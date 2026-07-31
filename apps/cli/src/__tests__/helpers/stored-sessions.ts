import type { getClickhouse } from "../../../../api/src/clickhouse.js";
import type { sqlClient } from "../../../../api/src/db.js";

/**
 * Readers for rows the API stores in ClickHouse and Postgres.
 *
 * apps/cli has no runtime dependency on @rudel/api, and this helper must not
 * create one: the api imports above are type-only (erased at build time), and
 * callers inject the live clients they already import for themselves. Only the
 * test files that construct these readers touch apps/api source.
 */

type ClickHouseClient = ReturnType<typeof getClickhouse>;
type SqlClient = typeof sqlClient;

export interface StoredSessionDeps {
	readonly getClickhouse: () => ClickHouseClient;
	readonly getSafeTable: (table: string) => string;
	readonly sql: SqlClient;
}

export interface StoredFilteredSession {
	readonly content: string;
	readonly filter_version: number;
	readonly subagents: Record<string, string>;
}

export interface StoredCodexSession {
	readonly content: string;
	readonly filter_version: number;
}

export interface StoredAnalyticsSession {
	readonly session_id: string;
	readonly organization_id: string;
	readonly user_id: string;
	readonly source: string;
	readonly filter_version: number;
	readonly error_pattern: string;
}

export interface StoredSessionReaders {
	readonly getPhysicalSessionCount: (
		organizationId: string,
		sessionDate: string,
		sessionId: string,
	) => Promise<number>;
	readonly getStoredContentHash: (
		organizationId: string,
		sessionId: string,
	) => Promise<string | null>;
	readonly getStoredFilteredSession: (
		organizationId: string,
		sessionId: string,
	) => Promise<StoredFilteredSession | null>;
	readonly getStoredCodexSession: (
		organizationId: string,
		sessionId: string,
	) => Promise<StoredCodexSession | null>;
	readonly getStoredAnalyticsSession: (
		organizationId: string,
		sessionId: string,
		source: "claude_code" | "codex",
	) => Promise<StoredAnalyticsSession | null>;
}

export function createStoredSessionReaders(
	deps: StoredSessionDeps,
): StoredSessionReaders {
	return {
		async getPhysicalSessionCount(organizationId, sessionDate, sessionId) {
			const [row] = await deps.getClickhouse().query<{ row_count: number }>({
				query: `SELECT count() AS row_count FROM ${deps.getSafeTable("rudel.claude_sessions")} WHERE organization_id = {organizationId:String} AND session_date = {sessionDate:DateTime64(3, 'UTC')} AND session_id = {sessionId:String}`,
				query_params: {
					organizationId,
					sessionDate,
					sessionId,
				},
			});
			return Number(row?.row_count ?? 0);
		},

		async getStoredContentHash(organizationId, sessionId) {
			const [row] = await deps.sql<
				Array<{ last_content_sha256: string | null }>
			>`
				SELECT last_content_sha256
				FROM session_ownership
				WHERE organization_id = ${organizationId}
					AND session_id = ${sessionId}
			`;
			return row?.last_content_sha256 ?? null;
		},

		async getStoredFilteredSession(organizationId, sessionId) {
			const [row] = await deps.getClickhouse().query<StoredFilteredSession>({
				query: `SELECT content, filter_version, subagents FROM ${deps.getSafeTable("rudel.claude_sessions")} WHERE organization_id = {organizationId:String} AND session_id = {sessionId:String} ORDER BY ingested_at DESC LIMIT 1`,
				query_params: {
					organizationId,
					sessionId,
				},
			});
			return row ?? null;
		},

		async getStoredCodexSession(organizationId, sessionId) {
			const [row] = await deps.getClickhouse().query<StoredCodexSession>({
				query: `SELECT content, filter_version FROM ${deps.getSafeTable("rudel.codex_sessions")} WHERE organization_id = {organizationId:String} AND session_id = {sessionId:String} ORDER BY ingested_at DESC LIMIT 1`,
				query_params: {
					organizationId,
					sessionId,
				},
			});
			return row ?? null;
		},

		// No FINAL here: this returns the newest row by ingested_at and polls for
		// MV lag. Anything asserting ReplacingMergeTree collapse semantics needs
		// its own FINAL query instead of this reader.
		async getStoredAnalyticsSession(organizationId, sessionId, source) {
			for (let attempt = 0; attempt < 20; attempt += 1) {
				const [row] = await deps.getClickhouse().query<StoredAnalyticsSession>({
					query: `SELECT session_id, organization_id, user_id, source, filter_version, error_pattern FROM ${deps.getSafeTable("rudel.session_analytics")} WHERE organization_id = {organizationId:String} AND session_id = {sessionId:String} AND source = {source:String} ORDER BY ingested_at DESC LIMIT 1`,
					query_params: {
						organizationId,
						sessionId,
						source,
					},
				});
				if (row) {
					return row;
				}
				await Bun.sleep(250);
			}
			return null;
		},
	};
}
