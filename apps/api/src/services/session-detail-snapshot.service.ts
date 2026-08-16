import type { ClickHouseSettings } from "@clickhouse/client-web";
import type { Source } from "@rudel/api-routes";
import { queryClickhouse } from "../clickhouse.js";
import type { SessionDetailRawSnapshot } from "./session-detail-derivation.service.js";

const SESSION_DETAIL_QUERY_SETTINGS: ClickHouseSettings = {
	max_execution_time: 30,
	max_result_bytes: String(192 * 1024 * 1024),
	max_rows_to_read: "100000",
};

type CurrentRevisionRow = {
	revision: string;
	source: Source;
};

type SnapshotRow = {
	content: string;
	duration_minutes: number;
	git_branch: string | null;
	git_remote: string;
	git_sha: string | null;
	input_tokens: number;
	last_interaction_date: string;
	model_used: string;
	organization_id: string;
	output_tokens: number;
	package_name: string;
	project_path: string;
	revision: string;
	session_date: string;
	session_id: string;
	skills: string[];
	slash_commands: string[];
	source: Source;
	subagents: Record<string, string>;
	total_interactions: number;
	total_tokens: number;
	user_id: string;
};

function rawSessionUnionSql() {
	return `
    SELECT
      'claude_code' AS source,
      organization_id,
      user_id,
      session_id,
      content,
      subagents,
      ingested_at,
      session_date,
      last_interaction_date,
      project_path,
      git_remote,
      package_name,
      git_branch,
      git_sha
    FROM rudel.claude_sessions
    WHERE organization_id = {orgId:String}
      AND user_id = {ownerId:String}
      AND session_id = {sessionId:String}

    UNION ALL

    SELECT
      'codex' AS source,
      organization_id,
      user_id,
      session_id,
      content,
      CAST(map(), 'Map(String, String)') AS subagents,
      ingested_at,
      session_date,
      last_interaction_date,
      project_path,
      git_remote,
      package_name,
      git_branch,
      git_sha
    FROM rudel.codex_sessions
    WHERE organization_id = {orgId:String}
      AND user_id = {ownerId:String}
      AND session_id = {sessionId:String}`;
}

export function buildSessionDetailCurrentRevisionSql() {
	return `
  SELECT
    tupleElement(snapshot, 1) AS source,
    toString(tupleElement(snapshot, 2)) AS revision
  FROM (
    SELECT argMax(tuple(source, ingested_at), ingested_at) AS snapshot
    FROM (${rawSessionUnionSql()})
    HAVING count() > 0
  )`;
}

export function buildSessionDetailRawSnapshotSql() {
	return `
  WITH
    latest_raw AS (
      SELECT argMax(
        tuple(
          source,
          organization_id,
          user_id,
          session_id,
          content,
          subagents,
          ingested_at,
          session_date,
          last_interaction_date,
          project_path,
          git_remote,
          package_name,
          git_branch,
          git_sha
        ),
        ingested_at
      ) AS snapshot
      FROM (${rawSessionUnionSql()})
      HAVING count() > 0
    ),
    latest_analytics AS (
      SELECT argMax(
        tuple(
          ingested_at,
          input_tokens,
          output_tokens,
          total_tokens,
          total_interactions,
          actual_duration_min,
          model_used,
          skills,
          slash_commands
        ),
        ingested_at
      ) AS snapshot
      FROM rudel.session_analytics
      WHERE organization_id = {orgId:String}
        AND user_id = {ownerId:String}
        AND session_id = {sessionId:String}
      HAVING count() > 0
    )
  SELECT
    tupleElement(raw.snapshot, 1) AS source,
    tupleElement(raw.snapshot, 2) AS organization_id,
    tupleElement(raw.snapshot, 3) AS user_id,
    tupleElement(raw.snapshot, 4) AS session_id,
    tupleElement(raw.snapshot, 5) AS content,
    tupleElement(raw.snapshot, 6) AS subagents,
    toString(tupleElement(raw.snapshot, 7)) AS revision,
    toString(tupleElement(raw.snapshot, 8)) AS session_date,
    toString(tupleElement(raw.snapshot, 9)) AS last_interaction_date,
    tupleElement(raw.snapshot, 10) AS project_path,
    tupleElement(raw.snapshot, 11) AS git_remote,
    tupleElement(raw.snapshot, 12) AS package_name,
    tupleElement(raw.snapshot, 13) AS git_branch,
    tupleElement(raw.snapshot, 14) AS git_sha,
    tupleElement(analytics.snapshot, 2) AS input_tokens,
    tupleElement(analytics.snapshot, 3) AS output_tokens,
    tupleElement(analytics.snapshot, 4) AS total_tokens,
    tupleElement(analytics.snapshot, 5) AS total_interactions,
    tupleElement(analytics.snapshot, 6) AS duration_minutes,
    tupleElement(analytics.snapshot, 7) AS model_used,
    tupleElement(analytics.snapshot, 8) AS skills,
    tupleElement(analytics.snapshot, 9) AS slash_commands
  FROM latest_raw AS raw
  INNER JOIN latest_analytics AS analytics
    ON tupleElement(analytics.snapshot, 1) = tupleElement(raw.snapshot, 7)`;
}

function normalizeDateTime64(value: string) {
	const normalized = value.replace(" ", "T");
	if (/[zZ]|[+-]\d\d:\d\d$/u.test(normalized)) {
		return normalized;
	}
	return `${normalized.includes(".") ? normalized : `${normalized}.000`}Z`;
}

function queryParams(
	organizationId: string,
	sessionId: string,
	ownerId: string,
) {
	return { orgId: organizationId, ownerId, sessionId };
}

export async function getSessionDetailCurrentRevision(
	organizationId: string,
	sessionId: string,
	ownerId: string,
) {
	const [row] = await queryClickhouse<CurrentRevisionRow>({
		clickhouse_settings: SESSION_DETAIL_QUERY_SETTINGS,
		query: buildSessionDetailCurrentRevisionSql(),
		query_params: queryParams(organizationId, sessionId, ownerId),
	});
	return row
		? { revision: normalizeDateTime64(row.revision), source: row.source }
		: null;
}

export async function getSessionDetailRawSnapshot(
	organizationId: string,
	sessionId: string,
	ownerId: string,
): Promise<SessionDetailRawSnapshot | null> {
	const [row] = await queryClickhouse<SnapshotRow>({
		clickhouse_settings: SESSION_DETAIL_QUERY_SETTINGS,
		query: buildSessionDetailRawSnapshotSql(),
		query_params: queryParams(organizationId, sessionId, ownerId),
	});
	if (!row) {
		return null;
	}
	return {
		content: row.content,
		durationMinutes: Number(row.duration_minutes),
		gitBranch: row.git_branch || null,
		gitRemote: row.git_remote,
		gitSha: row.git_sha || null,
		inputTokens: Number(row.input_tokens),
		lastInteractionDate: normalizeDateTime64(row.last_interaction_date),
		modelUsed: row.model_used,
		organizationId: row.organization_id,
		outputTokens: Number(row.output_tokens),
		ownerId: row.user_id,
		packageName: row.package_name,
		projectPath: row.project_path,
		revision: normalizeDateTime64(row.revision),
		sessionDate: normalizeDateTime64(row.session_date),
		sessionId: row.session_id,
		skills: row.skills,
		slashCommands: row.slash_commands,
		source: row.source,
		subagents: row.subagents,
		totalInteractions: Number(row.total_interactions),
		totalTokens: Number(row.total_tokens),
	};
}
