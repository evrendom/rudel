import { getClickhouse, getSafeClickHouseTable } from "../clickhouse.js";

const SESSION_ANALYTICS_TABLE = "rudel.session_analytics";

interface UploadedSessionRow {
	readonly session_id: string;
}

/**
 * Find session IDs already visible to the dashboard for one upload identity.
 *
 * Existence does not require FINAL: any analytics version proves that the
 * session reached ClickHouse, and grouping keeps the response unique.
 */
export async function findUploadedSessionIds(
	organizationId: string,
	userId: string,
	sessionIds: readonly string[],
): Promise<string[]> {
	if (sessionIds.length === 0) return [];

	const rows = await getClickhouse().query<UploadedSessionRow>({
		clickhouse_settings: {
			max_execution_time: 10,
			max_result_rows: String(sessionIds.length),
			result_overflow_mode: "throw",
		},
		query: `
			SELECT session_id
			FROM ${getSafeClickHouseTable(SESSION_ANALYTICS_TABLE)}
			WHERE source IN ('claude_code', 'codex')
				AND organization_id = {organizationId:String}
				AND user_id = {userId:String}
				AND session_id IN {sessionIds:Array(String)}
			GROUP BY session_id
			ORDER BY session_id
			LIMIT {maxResults:UInt32}
		`,
		query_params: {
			maxResults: sessionIds.length,
			organizationId,
			sessionIds,
			userId,
		},
	});

	return rows.map((row) => row.session_id);
}
