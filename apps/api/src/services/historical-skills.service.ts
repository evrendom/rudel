import type {
	HistoricalSkillDetail,
	HistoricalSkillSummary,
} from "@rudel/api-routes";
import { queryClickhouse } from "../clickhouse.js";
import {
	buildHistoricalSkillDetail,
	type HistoricalSkillSessionRow,
} from "./historical-skills-aggregation.js";

const CODEX_SKILL_NAME_PATTERN =
	'"name":"exec_command"[^}]*skills/([a-zA-Z0-9_-]+)/SKILL';

interface HistoricalSkillSummaryRow {
	name: string;
	session_count: number;
}

export async function listHistoricalCodexSkills(
	orgId: string,
): Promise<HistoricalSkillSummary[]> {
	const rows = await queryClickhouse<HistoricalSkillSummaryRow>({
		query: `
			SELECT
				skill AS name,
				uniqExact(session_id) AS session_count
			FROM (
				SELECT
					session_id,
					arrayDistinct(
						extractAll(
							argMax(content, ingested_at),
							{skillNamePattern:String}
						)
					) AS distinct_skills
				FROM rudel.codex_sessions
				PREWHERE organization_id = {orgId:String}
				GROUP BY session_id
			)
			ARRAY JOIN distinct_skills AS skill
			GROUP BY skill
			ORDER BY session_count DESC, name ASC
		`,
		query_params: {
			orgId,
			skillNamePattern: CODEX_SKILL_NAME_PATTERN,
		},
	});

	return rows.map((row) => ({
		name: row.name,
		sessionCount: Number(row.session_count),
	}));
}

export async function getHistoricalCodexSkillDetail(
	orgId: string,
	name: string,
): Promise<HistoricalSkillDetail> {
	const rows = await queryClickhouse<HistoricalSkillSessionRow>({
		query: `
			SELECT
				session_id,
				content,
				formatDateTime(
					session_date,
					'%Y-%m-%dT%H:%i:%SZ',
					'UTC'
				) AS used_at
			FROM (
				SELECT
					session_id,
					argMax(content, ingested_at) AS content,
					argMax(session_date, ingested_at) AS session_date
				FROM rudel.codex_sessions
				PREWHERE organization_id = {orgId:String}
				GROUP BY session_id
			)
			WHERE has(
				extractAll(content, {skillNamePattern:String}),
				{skillName:String}
			)
		`,
		query_params: {
			orgId,
			skillName: name,
			skillNamePattern: CODEX_SKILL_NAME_PATTERN,
		},
	});

	return buildHistoricalSkillDetail(name, rows);
}
