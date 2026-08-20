import type {
	HistoricalSkillAgent,
	HistoricalSkillDetail,
	HistoricalSkillSummary,
	HistoricalSkillVersion,
} from "@rudel/api-routes";
import { queryClickhouse } from "../clickhouse.js";
import { buildActiveSkillUsesCte } from "./skill-extraction-ingest.service.js";

interface HistoricalSkillSummaryRow {
	claude_session_count: number;
	codex_session_count: number;
	name: string;
	session_count: number;
}

interface HistoricalSkillAgentSummaryRow {
	agent: string;
	session_count: number;
	unavailable_session_count: number;
}

export interface HistoricalSkillVersionUseRow {
	agent: string;
	content_sha256: string;
	first_used_at: string;
	last_used_at: string;
	session_count: number;
}

export interface HistoricalSkillContentRow {
	content: string;
	content_sha256: string;
}

const HISTORICAL_SKILL_VERSION_LIMIT = 100;
const HISTORICAL_SKILL_QUERY_SETTINGS = {
	max_execution_time: 30,
	max_result_bytes: String(128 * 1024 * 1024),
	max_result_rows: "10000",
	result_overflow_mode: "throw",
} as const;

const HISTORICAL_SKILL_CONTENT_QUERY_SETTINGS = {
	...HISTORICAL_SKILL_QUERY_SETTINGS,
	max_result_bytes: String(256 * 1024 * 1024),
	max_result_rows: String(HISTORICAL_SKILL_VERSION_LIMIT),
} as const;

export async function listHistoricalSkills(
	organizationId: string,
): Promise<HistoricalSkillSummary[]> {
	const rows = await queryClickhouse<HistoricalSkillSummaryRow>({
		clickhouse_settings: HISTORICAL_SKILL_QUERY_SETTINGS,
		query: `
			WITH ${buildActiveSkillUsesCte()}
			SELECT
				skill_name AS name,
				uniqExact(tuple(user_id, agent, session_id)) AS session_count,
				uniqExactIf(tuple(user_id, session_id), agent = 'claude') AS claude_session_count,
				uniqExactIf(tuple(user_id, session_id), agent = 'codex') AS codex_session_count
			FROM active_skill_uses
			GROUP BY skill_name
			ORDER BY session_count DESC, name ASC
		`,
		query_params: { organizationId },
	});
	return rows.map((row) => ({
		name: row.name,
		sessionCount: Number(row.session_count),
		claudeSessionCount: Number(row.claude_session_count),
		codexSessionCount: Number(row.codex_session_count),
	}));
}

export async function getHistoricalSkillDetail(
	organizationId: string,
	name: string,
): Promise<HistoricalSkillDetail> {
	const [agentRows, versionRows] = await Promise.all([
		queryClickhouse<HistoricalSkillAgentSummaryRow>({
			clickhouse_settings: HISTORICAL_SKILL_QUERY_SETTINGS,
			query: `
				WITH ${buildActiveSkillUsesCte({ filterSkillName: true })}
				SELECT
					agent,
					uniqExact(tuple(user_id, session_id)) AS session_count,
					uniqExactIf(tuple(user_id, session_id), content_sha256 = '') AS unavailable_session_count
				FROM active_skill_uses
				WHERE skill_name = {skillName:String}
				GROUP BY agent
			`,
			query_params: { organizationId, skillName: name },
		}),
		queryClickhouse<HistoricalSkillVersionUseRow>({
			clickhouse_settings: {
				...HISTORICAL_SKILL_QUERY_SETTINGS,
				max_result_rows: String(HISTORICAL_SKILL_VERSION_LIMIT),
			},
			query: `
				WITH ${buildActiveSkillUsesCte({ filterSkillName: true })}
				SELECT
					agent,
					content_sha256,
					uniqExact(tuple(user_id, session_id)) AS session_count,
					formatDateTime(min(used_at), '%Y-%m-%dT%H:%i:%SZ', 'UTC') AS first_used_at,
					formatDateTime(max(used_at), '%Y-%m-%dT%H:%i:%SZ', 'UTC') AS last_used_at
				FROM active_skill_uses
				WHERE skill_name = {skillName:String}
					AND content_sha256 != ''
				GROUP BY agent, content_sha256
				ORDER BY last_used_at DESC, agent ASC, content_sha256 ASC
				LIMIT {versionLimit:UInt32}
			`,
			query_params: {
				organizationId,
				skillName: name,
				versionLimit: HISTORICAL_SKILL_VERSION_LIMIT,
			},
		}),
	]);
	const contentHashes = [
		...new Set(versionRows.map((row) => row.content_sha256)),
	];
	const contentRows =
		contentHashes.length === 0
			? []
			: await queryClickhouse<HistoricalSkillContentRow>({
					clickhouse_settings: HISTORICAL_SKILL_CONTENT_QUERY_SETTINGS,
					query: `
				SELECT content_sha256, tupleElement(content_state, 1) AS content
				FROM (
					SELECT
						content_sha256,
						argMax(
							tuple(content, parser_version, extraction_seq, extracted_at),
							extraction_seq
						) AS content_state
					FROM rudel.skill_version_contents
					WHERE organization_id = {organizationId:String}
						AND skill_name = {skillName:String}
						AND content_sha256 IN {contentHashes:Array(String)}
					GROUP BY organization_id, skill_name, content_sha256
				)
			`,
					query_params: {
						contentHashes,
						organizationId,
						skillName: name,
					},
				});

	let unavailableSessionCount = agentRows.reduce(
		(total, row) => total + Number(row.unavailable_session_count),
		0,
	);
	const resolved = resolveHistoricalSkillVersions(versionRows, contentRows);
	unavailableSessionCount += resolved.unavailableSessionCount;

	const claudeSessionCount = getAgentSessionCount(agentRows, "claude");
	const codexSessionCount = getAgentSessionCount(agentRows, "codex");
	const sourceAgents = agentRows.map((row) => parseAgent(row.agent)).sort();
	return {
		name,
		sessionCount: claudeSessionCount + codexSessionCount,
		claudeSessionCount,
		codexSessionCount,
		sourceAgents,
		versions: resolved.versions,
		unavailableSessionCount,
	};
}

export function resolveHistoricalSkillVersions(
	versionRows: readonly HistoricalSkillVersionUseRow[],
	contentRows: readonly HistoricalSkillContentRow[],
): {
	readonly unavailableSessionCount: number;
	readonly versions: readonly HistoricalSkillVersion[];
} {
	const contentByHash = new Map(
		contentRows.map((row) => [row.content_sha256, row.content]),
	);
	let unavailableSessionCount = 0;
	const versions: HistoricalSkillVersion[] = [];
	for (const row of versionRows.slice(0, HISTORICAL_SKILL_VERSION_LIMIT)) {
		const content = contentByHash.get(row.content_sha256);
		if (content === undefined) {
			unavailableSessionCount += Number(row.session_count);
			continue;
		}
		versions.push({
			sourceAgent: parseAgent(row.agent),
			contentSha256: row.content_sha256,
			content,
			sessionCount: Number(row.session_count),
			firstUsedAt: row.first_used_at,
			lastUsedAt: row.last_used_at,
		});
	}
	versions.sort(compareVersions);
	return { unavailableSessionCount, versions };
}

function getAgentSessionCount(
	rows: readonly HistoricalSkillAgentSummaryRow[],
	agent: HistoricalSkillAgent,
): number {
	return Number(rows.find((row) => row.agent === agent)?.session_count ?? 0);
}

function parseAgent(value: string): HistoricalSkillAgent {
	if (value === "claude" || value === "codex") return value;
	throw new Error(`Unexpected historical skill agent: ${value}`);
}

function compareVersions(
	left: HistoricalSkillVersion,
	right: HistoricalSkillVersion,
): number {
	return (
		right.lastUsedAt.localeCompare(left.lastUsedAt) ||
		left.sourceAgent.localeCompare(right.sourceAgent) ||
		left.contentSha256.localeCompare(right.contentSha256)
	);
}
