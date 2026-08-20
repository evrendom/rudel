import { getAllAdapters } from "@rudel/agent-adapters";
import {
	type ClickHouseStatement,
	getClickhouse,
	getSafeClickHouseTable,
} from "../clickhouse.js";

const SESSION_ANALYTICS_TABLE = "rudel.session_analytics";
const SESSION_LANGUAGE_SIGNALS_TABLE = "rudel.session_language_signals";
const SKILL_RECEIPTS_TABLE = "rudel.skill_receipts";
const SKILL_USES_TABLE = "rudel.skill_uses";
const SKILL_VERSION_CONTENTS_TABLE = "rudel.skill_version_contents";
const USAGE_EVENTS_TABLE = "rudel.usage_events";
const WRAPPED_USER_ARCHETYPE_SNAPSHOTS_TABLE =
	"rudel.wrapped_user_archetype_snapshots_v1";

interface SessionCountRow {
	count: string;
}

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
				query: `SELECT count() as count FROM ${getSafeClickHouseTable(table)} FINAL WHERE organization_id = {orgId:String}`,
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

export async function deleteOrgSessions(organizationId: string): Promise<void> {
	await deleteSessions("organization_id", organizationId);
}

export async function deleteUserSessions(userId: string): Promise<void> {
	await deleteSessions("user_id", userId);
}

async function deleteSessions(
	column: "organization_id" | "user_id",
	targetId: string,
): Promise<void> {
	const plans = [
		...getAllAdapters().map((adapter) => ({
			column,
			table: adapter.rawTableName,
		})),
		{ column, table: SESSION_ANALYTICS_TABLE },
		{ column, table: SESSION_LANGUAGE_SIGNALS_TABLE },
		{ column, table: SKILL_RECEIPTS_TABLE },
		{ column, table: SKILL_USES_TABLE },
		{
			// skill_version_contents is deduplicated by the legacy workspace key and
			// intentionally has no user_id. In production that key is the uploader's
			// user ID, so account erasure must target organization_id here.
			column: column === "user_id" ? "organization_id" : column,
			table: SKILL_VERSION_CONTENTS_TABLE,
		},
		{ column, table: USAGE_EVENTS_TABLE },
		{ column, table: WRAPPED_USER_ARCHETYPE_SNAPSHOTS_TABLE },
	];
	const results = await Promise.allSettled(
		plans.map((plan) =>
			deleteSessionsFromTable(plan.table, plan.column, targetId),
		),
	);
	const failures = results.flatMap((result, index) =>
		result.status === "rejected"
			? [
					new Error(
						`ClickHouse purge failed for ${plans[index]?.table ?? "unknown"}`,
						{ cause: result.reason },
					),
				]
			: [],
	);

	if (failures.length > 0) {
		throw new AggregateError(failures, "ClickHouse purge failed");
	}
}

async function deleteSessionsFromTable(
	tableName: string,
	column: "organization_id" | "user_id",
	targetId: string,
): Promise<void> {
	const clickhouse = getClickhouse();
	const table = getSafeClickHouseTable(tableName);
	const predicate = `${column} = {targetId:String}`;
	const queryParams = { targetId };

	// Privacy deletion is an infrequent mutation, so use a lightweight DELETE.
	// Sync level 3 waits for active SharedMergeTree replicas. The read-back
	// confirms query-level deletion; merges reclaim the physical data later.
	await clickhouse.execute({
		clickhouse_settings: { lightweight_deletes_sync: "3" },
		query: `DELETE FROM ${table} WHERE ${predicate}`,
		query_params: queryParams,
	});

	const remainingRows = await clickhouse.query({
		query: `SELECT 1 FROM ${table} WHERE ${predicate} LIMIT 1`,
		query_params: queryParams,
	});
	if (remainingRows.length > 0) {
		throw new Error(`ClickHouse purge verification failed for ${table}`);
	}
}
