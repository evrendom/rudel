import { getAllAdapters } from "@rudel/agent-adapters";
import {
	type ClickHouseStatement,
	getClickhouse,
	getSafeClickHouseTable,
} from "../clickhouse.js";

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
	const ch = getClickhouse();
	const tables = getAllAdapters().map((a) => a.rawTableName);
	await Promise.all([
		...tables.map((table) =>
			ch.execute({
				query: `DELETE FROM ${getSafeClickHouseTable(table)} WHERE organization_id = {orgId:String}`,
				query_params: {
					orgId,
				},
			}),
		),
		ch.execute({
			query: `DELETE FROM ${getSafeClickHouseTable("rudel.session_analytics")} WHERE organization_id = {orgId:String}`,
			query_params: {
				orgId,
			},
		}),
	]);
}

export async function deleteUserSessions(userId: string): Promise<void> {
	const ch = getClickhouse();
	const tables = getAllAdapters().map((a) => a.rawTableName);
	await Promise.all([
		...tables.map((table) =>
			ch.execute({
				query: `DELETE FROM ${getSafeClickHouseTable(table)} WHERE user_id = {userId:String}`,
				query_params: {
					userId,
				},
			}),
		),
		ch.execute({
			query: `DELETE FROM ${getSafeClickHouseTable("rudel.session_analytics")} WHERE user_id = {userId:String}`,
			query_params: {
				userId,
			},
		}),
	]);
}
