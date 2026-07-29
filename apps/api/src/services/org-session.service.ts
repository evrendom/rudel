import { getAllAdapters } from "@rudel/agent-adapters";
import {
	type ClickHouseStatement,
	getClickhouse,
	getSafeClickHouseTable,
} from "../clickhouse.js";

const SESSION_ANALYTICS_TABLE = "rudel.session_analytics";
const WRAPPED_USER_ARCHETYPE_SNAPSHOTS_TABLE =
	"rudel.wrapped_user_archetype_snapshots_v1";

interface SessionCountRow {
	count: string;
}

interface ClickHouseDeletion {
	promise: Promise<void>;
	table: string;
}

type ClickHouseDeletionScope =
	| { organizationId: string; type: "organization" }
	| { type: "user"; userId: string };

interface GetOrgSessionCountOptions {
	querySessionCount?: (
		statement: ClickHouseStatement,
	) => Promise<SessionCountRow[]>;
	rawTableNames?: readonly string[];
}

interface OrgSessionCountCacheEntry {
	expiresAt: number;
	pendingCount: Promise<number>;
}

interface OrgSessionCountCacheOptions {
	load: (organizationId: string, userId?: string) => Promise<number>;
	now?: () => number;
	ttlMs?: number;
}

const ORG_SESSION_COUNT_CACHE_TTL_MS = 2_000;

export function createOrgSessionCountCache(
	options: OrgSessionCountCacheOptions,
): (organizationId: string, userId?: string) => Promise<number> {
	const entries = new Map<string, OrgSessionCountCacheEntry>();
	const now = options.now ?? Date.now;
	const ttlMs = options.ttlMs ?? ORG_SESSION_COUNT_CACHE_TTL_MS;

	return (organizationId: string, userId?: string) => {
		const currentTime = now();
		const cacheKey = JSON.stringify([organizationId, userId ?? null]);
		const cachedEntry = entries.get(cacheKey);

		if (cachedEntry && cachedEntry.expiresAt > currentTime) {
			return cachedEntry.pendingCount;
		}

		for (const [key, entry] of entries) {
			if (entry.expiresAt <= currentTime) {
				entries.delete(key);
			}
		}

		const pendingCount = options.load(organizationId, userId);
		const entry = {
			expiresAt: currentTime + ttlMs,
			pendingCount,
		};
		entries.set(cacheKey, entry);

		void pendingCount.catch(() => {
			if (entries.get(cacheKey) === entry) {
				entries.delete(cacheKey);
			}
		});

		return pendingCount;
	};
}

export async function getOrgSessionCount(
	orgId: string,
	userId?: string,
	options: GetOrgSessionCountOptions = {},
): Promise<number> {
	const querySessionCount =
		options.querySessionCount ??
		((statement: ClickHouseStatement) =>
			getClickhouse().query<SessionCountRow>(statement));

	if (userId) {
		const rows = await querySessionCount({
			query: `SELECT count() as count FROM ${getSafeClickHouseTable("rudel.session_analytics")} FINAL WHERE organization_id = {orgId:String} AND user_id = {userId:String}`,
			query_params: {
				orgId,
				userId,
			},
		});

		return Number(rows[0]?.count ?? 0);
	}

	const tables =
		options.rawTableNames ?? getAllAdapters().map((a) => a.rawTableName);
	const results = await Promise.all(
		tables.map((table) =>
			querySessionCount({
				query: `SELECT count() as count FROM ${getSafeClickHouseTable(table)} WHERE organization_id = {orgId:String}`,
				query_params: {
					orgId,
				},
			}),
		),
	);
	return results.reduce((sum, rows) => sum + Number(rows[0]?.count ?? 0), 0);
}

export const getCachedOrgSessionCount = createOrgSessionCountCache({
	load: getOrgSessionCount,
});

export async function hasOrgUploadsInLastDays(
	orgId: string,
	days: number,
): Promise<boolean> {
	const ch = getClickhouse();
	const tables = getAllAdapters().map((a) => a.rawTableName);
	const results = await Promise.all(
		tables.map((table) =>
			ch.query<{ count: string }>({
				query: `SELECT count() as count FROM ${getSafeClickHouseTable(table)} WHERE organization_id = {orgId:String} AND session_date >= now64(3) - toIntervalDay({days:UInt32})`,
				query_params: {
					orgId,
					days,
				},
			}),
		),
	);
	return results.some((rows) => Number(rows[0]?.count ?? 0) > 0);
}

export async function deleteOrgSessions(orgId: string): Promise<void> {
	const deletions = getDeletionTableNames().map(
		(table): ClickHouseDeletion => ({
			table,
			promise: Promise.resolve().then(() =>
				getClickhouse().execute({
					// Cloud tables use SharedMergeTree. Wait for active replicas so
					// account deletion is visible cluster-wide.
					clickhouse_settings: { lightweight_deletes_sync: "3" },
					// organization_id leads the raw/session analytics sort keys. The
					// wrapped snapshot predicate is a deliberate low-frequency full-scan
					// field exception because its key starts with snapshot_id.
					query: `DELETE FROM ${getSafeClickHouseTable(table)} WHERE organization_id = {orgId:String}`,
					query_params: {
						orgId,
					},
				}),
			),
		}),
	);

	await settleClickHouseDeletions(deletions, {
		type: "organization",
		organizationId: orgId,
	});
}

export async function deleteUserSessions(userId: string): Promise<void> {
	const deletions = getDeletionTableNames().map(
		(table): ClickHouseDeletion => ({
			table,
			promise: Promise.resolve().then(() =>
				getClickhouse().execute({
					// Cloud tables use SharedMergeTree. Wait for active replicas so
					// account deletion is visible cluster-wide.
					clickhouse_settings: { lightweight_deletes_sync: "3" },
					// Deliberate schema-pk-filter-on-orderby field exception: user_id is
					// not a leading sort-key column in these tables. A complete,
					// low-frequency account purge must still cover historical rows for
					// which Postgres cannot provide an authoritative organization list.
					query: `DELETE FROM ${getSafeClickHouseTable(table)} WHERE user_id = {userId:String}`,
					query_params: {
						userId,
					},
				}),
			),
		}),
	);

	await settleClickHouseDeletions(deletions, { type: "user", userId });
}

function getDeletionTableNames(): string[] {
	return [
		...getAllAdapters().map((adapter) => adapter.rawTableName),
		SESSION_ANALYTICS_TABLE,
		WRAPPED_USER_ARCHETYPE_SNAPSHOTS_TABLE,
	];
}

async function settleClickHouseDeletions(
	deletions: readonly ClickHouseDeletion[],
	scope: ClickHouseDeletionScope,
): Promise<void> {
	const results = await Promise.allSettled(
		deletions.map((deletion) => deletion.promise),
	);
	const failures = results.flatMap((result, index) => {
		if (result.status === "fulfilled") {
			return [];
		}
		const table = deletions[index]?.table ?? "unknown";
		return [`${table}: ${String(result.reason)}`];
	});

	if (failures.length > 0) {
		const target =
			scope.type === "organization"
				? `organization ${scope.organizationId}`
				: `account ${scope.userId}`;
		throw new Error(
			`ClickHouse ${target} purge failed for ${failures.length} table(s): ${failures.join("; ")}`,
		);
	}
}
