import { toClickHouseDateTime } from "@rudel/agent-adapters";
import {
	buildClaudeSessionTokenBreakdown,
	type IngestSessionInput,
} from "@rudel/api-routes";
import {
	ingestRudelSessionAnalytics,
	type RudelSessionAnalyticsRow,
} from "@rudel/ch-schema/generated";
import type { ClickHouseExecutor } from "../clickhouse.js";

const CLAUDE_TOKEN_ACCOUNTING_VERSION = 2;

const ClaudeTimedInteractionLineSchema = {
	isTimedInteractionLine(value: unknown): value is {
		type: "user" | "assistant";
		timestamp: string;
		message?: { model?: string };
	} {
		if (!isRecord(value)) {
			return false;
		}

		if (value.type !== "user" && value.type !== "assistant") {
			return false;
		}

		return typeof value.timestamp === "string";
	},
};

export interface ClaudeAnalyticsSource {
	session_id: string;
	organization_id: string;
	project_path: string;
	git_remote: string;
	package_name: string;
	package_type: string;
	content: string;
	subagents: Record<string, string>;
	user_id: string;
	git_branch: string | null;
	git_sha: string | null;
	tag: string | null;
	session_date?: string;
	last_interaction_date?: string;
	ingested_at?: string;
}

export async function rewriteClaudeSessionAnalyticsAfterIngest(
	input: IngestSessionInput,
	organizationId: string,
	userId: string,
	env: { clickhouse: ClickHouseExecutor },
): Promise<void> {
	const source = toClaudeAnalyticsSource(input, organizationId, userId);
	const row = buildClaudeSessionAnalyticsRow(source);

	await ingestRudelSessionAnalytics(env.clickhouse, [row], {
		validate: true,
	});
}

export function buildClaudeSessionAnalyticsRow(
	source: ClaudeAnalyticsSource,
): RudelSessionAnalyticsRow {
	const timedInteractions = parseTimedInteractions(source.content);
	const interactionMetrics = buildInteractionMetrics(timedInteractions);
	const tokenBreakdown = buildClaudeSessionTokenBreakdown(
		source.content,
		source.subagents,
	);
	const sessionBounds = resolveSessionBounds(
		timedInteractions,
		source.session_date,
		source.last_interaction_date,
	);
	const modelUsed = findLastAssistantModel(source.content);
	const skills = extractDistinctMatches(
		source.content,
		/"name":"Skill"[^}]*"skill":"([^"]+)"/g,
	);
	const subagentTypes = extractDistinctMatches(
		source.content,
		/"name":"Task"[^}]*"subagent_type":"([^"]+)"/g,
	);
	const slashCommands = extractDistinctMatches(
		source.content,
		/<command-name>\/([^<]+)<\/command-name>/g,
	);
	const totalTokens = tokenBreakdown.session.total_tokens;
	const outputTokens = tokenBreakdown.session.output_tokens;
	const inputTokens = tokenBreakdown.session.input_tokens;
	const ingestedAt =
		source.ingested_at ?? toClickHouseDateTime(new Date().toISOString());
	const sessionArchetype = buildSessionArchetype({
		durationMin: interactionMetrics.actualDurationMin,
		inputTokens,
		outputTokens,
		totalTokens,
		hasCommit: Boolean(source.git_sha),
		skillsCount: skills.length,
	});

	return {
		session_date: sessionBounds.sessionDate,
		last_interaction_date: sessionBounds.lastInteractionDate,
		session_id: source.session_id,
		organization_id: source.organization_id,
		project_path: source.project_path,
		git_remote: source.git_remote,
		package_name: source.package_name,
		package_type: source.package_type,
		content: source.content,
		subagents: source.subagents,
		skills,
		slash_commands: slashCommands,
		subagent_types: subagentTypes,
		ingested_at: ingestedAt,
		user_id: source.user_id,
		git_branch: source.git_branch,
		git_sha: source.git_sha,
		input_tokens: toUInt64String(inputTokens),
		output_tokens: toUInt64String(outputTokens),
		cache_read_input_tokens: toUInt64String(
			tokenBreakdown.session.cache_read_input_tokens,
		),
		cache_creation_input_tokens: toUInt64String(
			tokenBreakdown.session.cache_creation_input_tokens,
		),
		total_tokens: toUInt64String(totalTokens),
		parent_input_tokens: toUInt64String(tokenBreakdown.parent.input_tokens),
		parent_output_tokens: toUInt64String(tokenBreakdown.parent.output_tokens),
		parent_cache_read_input_tokens: toUInt64String(
			tokenBreakdown.parent.cache_read_input_tokens,
		),
		parent_cache_creation_input_tokens: toUInt64String(
			tokenBreakdown.parent.cache_creation_input_tokens,
		),
		parent_total_tokens: toUInt64String(tokenBreakdown.parent.total_tokens),
		subagent_input_tokens: toUInt64String(tokenBreakdown.subagent.input_tokens),
		subagent_output_tokens: toUInt64String(
			tokenBreakdown.subagent.output_tokens,
		),
		subagent_cache_read_input_tokens: toUInt64String(
			tokenBreakdown.subagent.cache_read_input_tokens,
		),
		subagent_cache_creation_input_tokens: toUInt64String(
			tokenBreakdown.subagent.cache_creation_input_tokens,
		),
		subagent_total_tokens: toUInt64String(tokenBreakdown.subagent.total_tokens),
		token_accounting_version: CLAUDE_TOKEN_ACCOUNTING_VERSION,
		tag: source.tag,
		source: "claude_code",
		total_interactions: interactionMetrics.totalInteractions,
		actual_duration_min: interactionMetrics.actualDurationMin,
		avg_period_sec: interactionMetrics.avgPeriodSec,
		median_period_sec: interactionMetrics.medianPeriodSec,
		quick_responses: interactionMetrics.quickResponses,
		normal_responses: interactionMetrics.normalResponses,
		long_pauses: interactionMetrics.longPauses,
		error_count: countErrorMarkers(source.content),
		model_used: modelUsed,
		has_commit: source.git_sha ? 1 : 0,
		session_archetype: sessionArchetype,
		// Timing metrics stay parent-only on purpose: subagents add token work to
		// the session, but they are not extra human interaction time.
		success_score: buildSuccessScore({
			hasCommit: Boolean(source.git_sha),
			inputTokens,
			outputTokens,
			totalTokens,
			skillsCount: skills.length,
			errorCount: countErrorMarkers(source.content),
			durationMin: interactionMetrics.actualDurationMin,
		}),
		used_plan_mode: source.content.includes('"name":"EnterPlanMode"') ? 1 : 0,
		inference_duration_sec: interactionMetrics.inferenceDurationSec,
		human_duration_sec: interactionMetrics.humanDurationSec,
	};
}

function toClaudeAnalyticsSource(
	input: IngestSessionInput,
	organizationId: string,
	userId: string,
): ClaudeAnalyticsSource {
	return {
		session_id: input.sessionId,
		organization_id: organizationId,
		project_path: input.projectPath,
		git_remote: input.gitRemote ?? "",
		package_name: input.packageName ?? "",
		package_type: input.packageType ?? "",
		content: input.content,
		subagents: Object.fromEntries(
			(input.subagents ?? []).map((subagent) => [
				subagent.agentId,
				subagent.content,
			]),
		),
		user_id: userId,
		git_branch: input.gitBranch ?? null,
		git_sha: input.gitSha ?? null,
		tag: input.tag ?? null,
	};
}

function parseTimedInteractions(content: string): Array<{
	type: "user" | "assistant";
	timestamp: string;
}> {
	const interactions: Array<{ type: "user" | "assistant"; timestamp: string }> =
		[];

	for (const line of content.split("\n")) {
		if (!line || line.trim() === "") {
			continue;
		}

		try {
			const parsed = JSON.parse(line) as unknown;
			if (!ClaudeTimedInteractionLineSchema.isTimedInteractionLine(parsed)) {
				continue;
			}

			interactions.push({
				type: parsed.type,
				timestamp: parsed.timestamp,
			});
		} catch {
			// Skip malformed JSON lines while keeping the session ingestible.
		}
	}

	return interactions;
}

function buildInteractionMetrics(
	interactions: Array<{ type: "user" | "assistant"; timestamp: string }>,
) {
	const promptPeriodsSec: number[] = [];
	const inferenceGaps: number[] = [];
	const humanGaps: number[] = [];

	for (let index = 0; index < interactions.length - 1; index += 1) {
		const current = interactions[index];
		const next = interactions[index + 1];
		if (!current || !next) {
			continue;
		}

		const gapSec = getDiffSeconds(current.timestamp, next.timestamp);
		promptPeriodsSec.push(gapSec);

		if (current.type === "user" && next.type === "assistant") {
			inferenceGaps.push(gapSec);
		}

		if (current.type === "assistant" && next.type === "user") {
			humanGaps.push(gapSec);
		}
	}

	const sortedPromptPeriods = [...promptPeriodsSec].sort((left, right) => {
		return left - right;
	});

	return {
		totalInteractions: interactions.length,
		actualDurationMin:
			interactions.length > 1
				? Math.max(
						0,
						Math.round(
							getDiffSeconds(
								interactions[0]?.timestamp ?? "",
								interactions[interactions.length - 1]?.timestamp ?? "",
							) / 60,
						),
					)
				: 0,
		avgPeriodSec: roundToTwoDecimals(getAverage(promptPeriodsSec)),
		medianPeriodSec: getMedian(sortedPromptPeriods),
		quickResponses: promptPeriodsSec.filter((period) => period < 5).length,
		normalResponses: promptPeriodsSec.filter(
			(period) => period >= 5 && period <= 60,
		).length,
		longPauses: promptPeriodsSec.filter((period) => period > 300).length,
		inferenceDurationSec: sumNumbers(inferenceGaps),
		humanDurationSec: sumNumbers(humanGaps),
	};
}

function resolveSessionBounds(
	interactions: Array<{ type: "user" | "assistant"; timestamp: string }>,
	fallbackSessionDate?: string,
	fallbackLastInteractionDate?: string,
) {
	const firstTimestamp = interactions[0]?.timestamp;
	const lastTimestamp = interactions[interactions.length - 1]?.timestamp;

	if (firstTimestamp && lastTimestamp) {
		return {
			sessionDate: toClickHouseDateTime(firstTimestamp),
			lastInteractionDate: toClickHouseDateTime(lastTimestamp),
		};
	}

	if (fallbackSessionDate && fallbackLastInteractionDate) {
		return {
			sessionDate: fallbackSessionDate,
			lastInteractionDate: fallbackLastInteractionDate,
		};
	}

	const now = toClickHouseDateTime(new Date().toISOString());
	return {
		sessionDate: now,
		lastInteractionDate: now,
	};
}

function findLastAssistantModel(content: string): string {
	let modelUsed = "";

	for (const line of content.split("\n")) {
		if (!line || line.trim() === "") {
			continue;
		}

		try {
			const parsed = JSON.parse(line) as unknown;
			if (!ClaudeTimedInteractionLineSchema.isTimedInteractionLine(parsed)) {
				continue;
			}

			if (parsed.type !== "assistant") {
				continue;
			}

			if (
				parsed.message &&
				isRecord(parsed.message) &&
				typeof parsed.message.model === "string"
			) {
				modelUsed = parsed.message.model;
			}
		} catch {
			// Skip malformed JSON lines while preserving the last good model value.
		}
	}

	return modelUsed;
}

function extractDistinctMatches(content: string, regex: RegExp): string[] {
	const values = new Set<string>();
	for (const match of content.matchAll(regex)) {
		const value = match[1];
		if (typeof value === "string" && value !== "") {
			values.add(value);
		}
	}
	return Array.from(values);
}

function buildSessionArchetype(params: {
	durationMin: number;
	inputTokens: number;
	outputTokens: number;
	totalTokens: number;
	hasCommit: boolean;
	skillsCount: number;
}): string {
	const { durationMin, inputTokens, outputTokens, totalTokens, hasCommit } =
		params;

	if (durationMin <= 10 && totalTokens < 500_000 && outputTokens > 1_000) {
		return "quick_win";
	}

	if (durationMin > 30 && outputTokens > 50_000 && hasCommit) {
		return "deep_work";
	}

	if (
		totalTokens > 1_000_000 &&
		getRatio(outputTokens, inputTokens) < 0.3 &&
		durationMin > 20
	) {
		return "struggle";
	}

	if (params.skillsCount >= 3 && !hasCommit && totalTokens > 200_000) {
		return "exploration";
	}

	if (durationMin < 3 && outputTokens < 500) {
		return "abandoned";
	}

	return "standard";
}

function buildSuccessScore(params: {
	hasCommit: boolean;
	inputTokens: number;
	outputTokens: number;
	totalTokens: number;
	skillsCount: number;
	errorCount: number;
	durationMin: number;
}): number {
	const { hasCommit, inputTokens, outputTokens, totalTokens } = params;

	const score =
		50 +
		(hasCommit ? 20 : 0) +
		(getRatio(outputTokens, inputTokens) > 0.5 ? 15 : 0) +
		Math.min(params.skillsCount, 3) * 5 -
		(totalTokens > 1_500_000 && !hasCommit ? 20 : 0) -
		(params.durationMin < 2 && outputTokens < 200 ? 30 : 0) -
		Math.min(params.errorCount, 10) * 2;

	return Math.max(0, Math.min(100, Math.round(score)));
}

function countErrorMarkers(content: string): number {
	const apiErrors = content.match(/"isApiErrorMessage":true/g)?.length ?? 0;
	const toolErrors = content.match(/"is_error":true/g)?.length ?? 0;
	return apiErrors + toolErrors;
}

function getAverage(values: number[]): number {
	if (values.length === 0) {
		return 0;
	}

	return sumNumbers(values) / values.length;
}

function getMedian(sortedValues: number[]): number {
	if (sortedValues.length === 0) {
		return 0;
	}

	const middleIndex = Math.ceil(sortedValues.length / 2) - 1;
	return sortedValues[middleIndex] ?? 0;
}

function getDiffSeconds(leftTimestamp: string, rightTimestamp: string): number {
	const leftMs = Date.parse(leftTimestamp);
	const rightMs = Date.parse(rightTimestamp);
	if (Number.isNaN(leftMs) || Number.isNaN(rightMs)) {
		return 0;
	}

	return Math.max(0, Math.round((rightMs - leftMs) / 1000));
}

function getRatio(numerator: number, denominator: number): number {
	if (denominator <= 0) {
		return 0;
	}

	return numerator / denominator;
}

function sumNumbers(values: number[]): number {
	let total = 0;
	for (const value of values) {
		total += value;
	}
	return total;
}

function roundToTwoDecimals(value: number): number {
	return Math.round(value * 100) / 100;
}

function toUInt64String(value: number): string {
	return Math.max(0, Math.round(value)).toString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}
