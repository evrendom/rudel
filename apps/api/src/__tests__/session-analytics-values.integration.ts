import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getAdapter } from "@rudel/agent-adapters";
import type { IngestSessionInput } from "@rudel/api-routes";
import {
	createClickHouseExecutor,
	getSafeClickHouseTable,
} from "../clickhouse.js";
import { getDeveloperErrors } from "../services/developer.service.js";
import { getTopRecurringErrors } from "../services/error.service.js";
import { getLearningsFeed } from "../services/learnings.service.js";
import { getProjectErrors } from "../services/project.service.js";
import {
	getSessionAnalytics,
	getSessionDetail,
} from "../services/session-analytics.service.js";

/**
 * Value assertions for the session_analytics materialized views.
 *
 * Replaces analytics.integration.ts, which asserted response *shapes* (46 of its
 * 48 assertions were `Array.isArray` / `>= n`) and so could not detect a wrong
 * number. These assert the computed aggregates exactly, which is where the
 * defects actually live.
 *
 * Deliberately date-agnostic: the suite it replaces bound a fixed date range
 * against a rolling `days` window and silently stopped passing once the two
 * stopped overlapping. Nothing here filters on time.
 */

const MONOREPO_ROOT = resolve(import.meta.dir, "..", "..", "..", "..");

const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const ORG_ID = `test_org_values_${runId}`;
const USER_ID = `test_user_values_${runId}`;
const OTHER_ORG_ID = `test_org_values_other_${runId}`;
const OTHER_USER_ID = `test_user_values_other_${runId}`;
const TEST_ORGANIZATION_IDS = [ORG_ID, OTHER_ORG_ID];

const executor = createClickHouseExecutor({
	url: process.env.CLICKHOUSE_URL || "http://localhost:8123",
	username:
		process.env.CLICKHOUSE_USERNAME || process.env.CLICKHOUSE_USER || "default",
	password: process.env.CLICKHOUSE_PASSWORD || "",
	database: "default",
});

function userLine(at: string, text: string): string {
	return JSON.stringify({
		type: "user",
		timestamp: at,
		message: { role: "user", content: text },
	});
}

function assistantLine(
	at: string,
	id: string,
	usage: {
		input_tokens: number;
		output_tokens: number;
		cache_read_input_tokens: number;
		cache_creation_input_tokens: number;
	},
): string {
	return JSON.stringify({
		type: "assistant",
		timestamp: at,
		message: { id, model: "claude-sonnet-4-5", usage },
	});
}

const USAGE_A = {
	input_tokens: 100,
	output_tokens: 20,
	cache_read_input_tokens: 5,
	cache_creation_input_tokens: 3,
};
const USAGE_B = {
	input_tokens: 200,
	output_tokens: 40,
	cache_read_input_tokens: 7,
	cache_creation_input_tokens: 0,
};

/** Two distinct assistant messages, no duplicates. The baseline. */
function claudeTranscript(): string {
	return [
		userLine("2026-05-04T10:00:00.000Z", "first prompt"),
		assistantLine("2026-05-04T10:00:10.000Z", "msg_a", USAGE_A),
		userLine("2026-05-04T10:00:20.000Z", "second prompt"),
		assistantLine("2026-05-04T10:00:30.000Z", "msg_b", USAGE_B),
	].join("\n");
}

/**
 * Same two messages, but `msg_a` appears twice in a row.
 *
 * Claude Code streams updates to a message under one id, so the MV collapses
 * *adjacent* duplicate ids before summing usage:
 *
 *   (x, i) -> i = length(_assistant_ids) OR _assistant_ids[i] != _assistant_ids[i + 1]
 *
 * Note this is `uniq`, not a global dedupe — non-adjacent repeats of an id are
 * summed twice. Adjacency is measured across assistant lines only, since user
 * lines are filtered out before the comparison, so interleaved prompts do not
 * break a run. Totals here must match the baseline exactly.
 */
function claudeTranscriptWithAdjacentDuplicate(): string {
	return [
		userLine("2026-05-04T10:00:00.000Z", "first prompt"),
		assistantLine("2026-05-04T10:00:10.000Z", "msg_a", USAGE_A),
		assistantLine("2026-05-04T10:00:11.000Z", "msg_a", USAGE_A),
		userLine("2026-05-04T10:00:20.000Z", "second prompt"),
		assistantLine("2026-05-04T10:00:30.000Z", "msg_b", USAGE_B),
	].join("\n");
}

function claudeTranscriptWithCorrectedDate(): string {
	return [
		userLine("2026-07-04T10:00:00.000Z", "first prompt"),
		assistantLine("2026-07-04T10:00:10.000Z", "msg_a", USAGE_A),
		userLine("2026-07-04T10:00:20.000Z", "second prompt"),
		assistantLine("2026-07-04T10:00:30.000Z", "msg_b", USAGE_B),
	].join("\n");
}

function claudeTranscriptAtCodexStart(): string {
	return [
		userLine("2026-03-02T04:29:38.576Z", "same identity, Claude source"),
		assistantLine("2026-03-02T04:29:48.000Z", "msg_source", USAGE_A),
	].join("\n");
}

function claudeUnderflowTranscript(): string {
	const errors = Array.from({ length: 10 }, (_, index) =>
		JSON.stringify({
			type: "tool_result",
			is_error: true,
			content: `failure ${index}`,
		}),
	);

	return [
		userLine("2026-05-04T10:00:00.000Z", "short failing session"),
		assistantLine("2026-05-04T10:00:30.000Z", "msg_underflow", {
			input_tokens: 1_600_000,
			output_tokens: 100,
			cache_read_input_tokens: 0,
			cache_creation_input_tokens: 0,
		}),
		...errors,
	].join("\n");
}

function codexUnderflowTranscript(): string {
	const errorLines = Array.from({ length: 10 }, (_, index) => ({
		timestamp: `2026-03-02T04:29:${String(40 + index).padStart(2, "0")}.000Z`,
		type: "response_item",
		payload: {
			type: "function_call_output",
			call_id: `call_error_${index}`,
			output: `TypeError: failure ${index}`,
		},
	}));

	return [
		{
			timestamp: "2026-03-02T04:29:38.576Z",
			type: "session_meta",
			payload: { model_provider: "openai" },
		},
		...errorLines,
		{
			timestamp: "2026-03-02T04:29:55.000Z",
			type: "event_msg",
			payload: {
				type: "token_count",
				info: {
					total_token_usage: {
						input_tokens: 1_600_000,
						output_tokens: 100,
						cached_input_tokens: 0,
					},
				},
			},
		},
	]
		.map((line) => JSON.stringify(line))
		.join("\n");
}

function overLineLimitTranscript(transcript: string): string {
	return [transcript, ...Array.from({ length: 8_000 }, () => "{}")].join("\n");
}

function overByteLimitTranscript(transcript: string): string {
	return [transcript, "x".repeat(120_000_000)].join("\n");
}

function recentRetentionTranscript(): string {
	const startedAt = new Date();
	startedAt.setUTCSeconds(startedAt.getUTCSeconds() - 30);
	const completedAt = new Date(startedAt);
	completedAt.setUTCSeconds(completedAt.getUTCSeconds() + 10);

	return [
		userLine(
			startedAt.toISOString(),
			[
				"TypeError: retention probe",
				"<command-name>/compound:feedback</command-name>",
				"<command-args>Keep transcript access tied to raw retention.</command-args>",
			].join("\n"),
		),
		JSON.stringify({
			type: "tool_result",
			is_error: true,
			content: "TypeError: retention probe",
		}),
		assistantLine(completedAt.toISOString(), "msg_retention", USAGE_A),
	].join("\n");
}

// input  = Σ(input + cache_read + cache_creation) over surviving assistant lines
//        = (100+5+3) + (200+7+0) = 315
// output = 20 + 40 = 60
// total  = input + output = 375   (session-analytics.ts: `_input_tokens + _output_tokens`)
const EXPECTED = {
	input_tokens: 315,
	output_tokens: 60,
	cache_read_input_tokens: 12,
	cache_creation_input_tokens: 3,
	total_tokens: 375,
};

interface AnalyticsRow {
	session_id: string;
	source: string;
	organization_id: string;
	user_id: string;
	project_path: string;
	session_date_ms: string | number;
	last_interaction_date_ms: string | number;
	input_tokens: string | number;
	output_tokens: string | number;
	cache_read_input_tokens: string | number;
	cache_creation_input_tokens: string | number;
	total_tokens: string | number;
	total_interactions: string | number;
	actual_duration_min: string | number;
	avg_period_sec: string | number;
	median_period_sec: string | number;
	quick_responses: string | number;
	normal_responses: string | number;
	long_pauses: string | number;
	inference_duration_sec: string | number;
	human_duration_sec: string | number;
	error_count: number;
	error_pattern: string;
	success_score: number;
}

async function ingest(
	input: IngestSessionInput,
	identity = { organizationId: ORG_ID, userId: USER_ID },
): Promise<void> {
	const adapter = getAdapter(input.source);
	// ClickHouse Cloud can throw transient race errors (code 236) on insert.
	for (let attempt = 0; attempt < 5; attempt += 1) {
		try {
			await adapter.ingest(executor, input, {
				ingestedAt: new Date(),
				organizationId: identity.organizationId,
				userId: identity.userId,
			});
			return;
		} catch (error) {
			if (attempt === 4) throw error;
			await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
		}
	}
}

/** Polls until the MV has produced `expectedRows` for the session. */
async function readAnalytics(
	sessionId: string,
	expectedRows = 1,
	timeoutMs = 60000,
): Promise<AnalyticsRow[]> {
	const deadline = Date.now() + timeoutMs;
	let rows: AnalyticsRow[] = [];
	while (Date.now() < deadline) {
		try {
			rows = await executor.query<AnalyticsRow>({
				query: `SELECT session_id, source, organization_id, user_id, project_path,
				               toUnixTimestamp64Milli(session_date) AS session_date_ms,
				               toUnixTimestamp64Milli(last_interaction_date) AS last_interaction_date_ms,
				               input_tokens, output_tokens,
				               cache_read_input_tokens, cache_creation_input_tokens, total_tokens,
				               total_interactions, actual_duration_min, avg_period_sec, median_period_sec,
				               quick_responses, normal_responses, long_pauses,
				               inference_duration_sec, human_duration_sec,
					               error_count, error_pattern, success_score
					        FROM ${getSafeClickHouseTable("rudel.session_analytics")} FINAL
				        WHERE organization_id = {orgId:String} AND session_id = {sessionId:String}`,
				query_params: { orgId: ORG_ID, sessionId },
			});
			if (rows.length >= expectedRows) return rows;
		} catch {
			// transient — retry
		}
		await new Promise((r) => setTimeout(r, 2000));
	}
	return rows;
}

async function readAnalyticsAcrossOrganizations(
	sessionId: string,
	expectedRows: number,
	timeoutMs = 60000,
): Promise<AnalyticsRow[]> {
	const deadline = Date.now() + timeoutMs;
	let rows: AnalyticsRow[] = [];
	while (Date.now() < deadline) {
		try {
			rows = await executor.query<AnalyticsRow>({
				query: `SELECT session_id, source, organization_id, user_id, project_path,
				               toUnixTimestamp64Milli(session_date) AS session_date_ms,
				               toUnixTimestamp64Milli(last_interaction_date) AS last_interaction_date_ms,
				               input_tokens, output_tokens,
				               cache_read_input_tokens, cache_creation_input_tokens, total_tokens,
				               total_interactions, actual_duration_min, avg_period_sec, median_period_sec,
				               quick_responses, normal_responses, long_pauses,
				               inference_duration_sec, human_duration_sec,
				               error_count, error_pattern, success_score
				        FROM ${getSafeClickHouseTable("rudel.session_analytics")} FINAL
				        WHERE session_id = {sessionId:String}`,
				query_params: { sessionId },
			});
			if (rows.length >= expectedRows) return rows;
		} catch {
			// transient — retry
		}
		await new Promise((resolve) => setTimeout(resolve, 2000));
	}
	return rows;
}

function num(value: string | number): number {
	return typeof value === "number" ? value : Number(value);
}

afterAll(() => {
	// Fire-and-forget: DELETE mutations are slow on ClickHouse Cloud.
	for (const organizationId of TEST_ORGANIZATION_IDS) {
		for (const table of [
			"rudel.claude_sessions",
			"rudel.codex_sessions",
			"rudel.session_analytics",
		]) {
			executor
				.execute({
					query: `DELETE FROM ${getSafeClickHouseTable(table)} WHERE organization_id = {orgId:String}`,
					query_params: { orgId: organizationId },
				})
				.catch(() => {});
		}
	}
});

describe("session_analytics computed values", () => {
	test("does not retain transcript columns", async () => {
		const columns = await executor.query<{ name: string }>({
			query: `
				SELECT name
				FROM system.columns
				WHERE database = 'rudel'
				  AND table = 'session_analytics'
				  AND name IN ('content', 'subagents')
				ORDER BY name
			`,
		});

		expect(columns).toEqual([]);
	});

	test("sums token usage exactly", async () => {
		const sessionId = `values_tokens_${runId}`;
		await ingest({
			source: "claude_code",
			sessionId,
			projectPath: "/test/analytics-values",
			content: claudeTranscript(),
		});

		const rows = await readAnalytics(sessionId);
		expect(rows).toHaveLength(1);

		const row = rows[0];
		if (!row) throw new Error("no analytics row produced");

		expect(num(row.input_tokens)).toBe(EXPECTED.input_tokens);
		expect(num(row.output_tokens)).toBe(EXPECTED.output_tokens);
		expect(num(row.cache_read_input_tokens)).toBe(
			EXPECTED.cache_read_input_tokens,
		);
		expect(num(row.cache_creation_input_tokens)).toBe(
			EXPECTED.cache_creation_input_tokens,
		);
		expect(num(row.total_tokens)).toBe(EXPECTED.total_tokens);
		expect(row.source).toBe("claude_code");
	}, 180000);

	test("collapses adjacent duplicate assistant blocks", async () => {
		const sessionId = `values_adjacent_${runId}`;
		await ingest({
			source: "claude_code",
			sessionId,
			projectPath: "/test/analytics-values",
			content: claudeTranscriptWithAdjacentDuplicate(),
		});

		const rows = await readAnalytics(sessionId);
		expect(rows).toHaveLength(1);
		const row = rows[0];
		if (!row) throw new Error("no analytics row produced");

		// msg_a appears twice consecutively; the run collapses to one, so the
		// totals must be identical to the no-duplicate baseline. If this drifts
		// upward, streamed message updates are being counted more than once.
		expect(num(row.input_tokens)).toBe(EXPECTED.input_tokens);
		expect(num(row.output_tokens)).toBe(EXPECTED.output_tokens);
		expect(num(row.total_tokens)).toBe(EXPECTED.total_tokens);
	}, 180000);

	test("does not double-count the same transcript inserted in separate batches", async () => {
		const sessionId = `values_double_upload_${runId}`;
		const projectPath = `/test/double-upload-${runId}`;
		const input: IngestSessionInput = {
			source: "claude_code",
			sessionId,
			projectPath,
			content: claudeTranscript(),
		};

		await ingest(input);
		await readAnalytics(sessionId);
		await ingest(input);

		const rows = await readAnalytics(sessionId);
		expect(rows).toHaveLength(1);
		const row = rows[0];
		if (!row) throw new Error("no double-upload analytics row produced");
		expect(num(row.input_tokens)).toBe(EXPECTED.input_tokens);
		expect(num(row.output_tokens)).toBe(EXPECTED.output_tokens);
		expect(num(row.total_tokens)).toBe(EXPECTED.total_tokens);

		const dashboardRows = await getSessionAnalytics(ORG_ID, {
			start_date: "2026-05-01",
			end_date: "2026-05-31",
			project_path: projectPath,
		});
		expect(dashboardRows).toHaveLength(1);
		expect(dashboardRows[0]?.total_tokens).toBe(EXPECTED.total_tokens);
	}, 240000);

	test("keeps corrected values when a session date crosses a month boundary", async () => {
		const sessionId = `values_reingest_${runId}`;
		const input: IngestSessionInput = {
			source: "claude_code",
			sessionId,
			projectPath: "/test/analytics-values",
			content: claudeTranscript(),
		};

		await ingest(input);
		await readAnalytics(sessionId);
		await ingest({
			...input,
			projectPath: "/test/analytics-values-corrected",
			content: claudeTranscriptWithCorrectedDate(),
		});

		const rows = await readAnalytics(sessionId);

		// A timestamp correction crosses a month boundary, but session_date is no
		// longer part of either the sorting or partition key.
		expect(rows).toHaveLength(1);
		const row = rows[0];
		if (!row) throw new Error("no analytics row produced");
		expect(num(row.total_tokens)).toBe(EXPECTED.total_tokens);
		expect(row.project_path).toBe("/test/analytics-values-corrected");
		expect(num(row.session_date_ms)).toBe(
			Date.parse("2026-07-04T10:00:00.000Z"),
		);
	}, 240000);

	test("keeps source, organization, and user identity collisions independent", async () => {
		const sessionId = `values_source_identity_${runId}`;

		// Committed fixture rather than a hand-written Codex transcript: the Codex
		// format is deeply nested (session_meta / response_item / turn_context) and
		// inventing it risks testing a shape the adapter never sees.
		const codexContent = readFileSync(
			resolve(
				MONOREPO_ROOT,
				"packages/ch-schema/src/__tests__/fixtures/codex-session.jsonl",
			),
			"utf-8",
		);

		await ingest({
			source: "claude_code",
			sessionId,
			projectPath: "/test/analytics-values",
			content: claudeTranscriptAtCodexStart(),
		});
		await ingest({
			source: "codex",
			sessionId,
			projectPath: "/test/analytics-values",
			content: codexContent,
		});
		await ingest(
			{
				source: "claude_code",
				sessionId,
				projectPath: "/test/analytics-values-other-identity",
				content: claudeTranscriptAtCodexStart(),
			},
			{ organizationId: OTHER_ORG_ID, userId: OTHER_USER_ID },
		);

		const rows = await readAnalyticsAcrossOrganizations(sessionId, 3);

		expect(rows).toHaveLength(3);
		expect(rows.map((row) => row.source).sort()).toEqual([
			"claude_code",
			"claude_code",
			"codex",
		]);
		expect(
			rows
				.map((row) => [row.source, row.organization_id, row.user_id].join(":"))
				.sort(),
		).toEqual(
			[
				`claude_code:${ORG_ID}:${USER_ID}`,
				`claude_code:${OTHER_ORG_ID}:${OTHER_USER_ID}`,
				`codex:${ORG_ID}:${USER_ID}`,
			].sort(),
		);
	}, 300000);

	test("clamps a negative Claude success score to zero", async () => {
		const sessionId = `values_underflow_${runId}`;
		await ingest({
			source: "claude_code",
			sessionId,
			projectPath: "/test/analytics-values",
			content: claudeUnderflowTranscript(),
		});

		const rows = await readAnalytics(sessionId);
		expect(rows).toHaveLength(1);
		const row = rows[0];
		if (!row) throw new Error("no underflow analytics row produced");

		expect(row.error_count).toBe(10);
		expect(row.error_pattern).toBe("UnknownError");
		expect(num(row.total_tokens)).toBe(1_600_100);
		expect(row.success_score).toBe(0);
	}, 180000);

	test("clamps a negative Codex success score to zero through real ingest", async () => {
		const sessionId = `values_codex_underflow_${runId}`;
		await ingest({
			source: "codex",
			sessionId,
			projectPath: "/test/analytics-values",
			content: codexUnderflowTranscript(),
		});

		const rows = await readAnalytics(sessionId);
		expect(rows).toHaveLength(1);
		const row = rows[0];
		if (!row) throw new Error("no Codex underflow analytics row produced");

		expect(row.error_count).toBe(10);
		expect(row.error_pattern).toBe("TypeError");
		expect(num(row.total_tokens)).toBe(1_600_100);
		expect(row.success_score).toBe(0);
	}, 180000);

	test("caps over-limit Claude and Codex transcripts during ingest", async () => {
		const cases: Array<{
			source: "claude_code" | "codex";
			sessionId: string;
			content: string;
			sessionDate: number;
			lastInteractionDate: number;
		}> = [
			{
				source: "claude_code",
				sessionId: `values_capped_claude_${runId}`,
				content: overLineLimitTranscript(claudeTranscript()),
				sessionDate: Date.parse("2026-05-04T10:00:00.000Z"),
				lastInteractionDate: Date.parse("2026-05-04T10:00:30.000Z"),
			},
			{
				source: "codex",
				sessionId: `values_capped_codex_${runId}`,
				content: overByteLimitTranscript(codexUnderflowTranscript()),
				sessionDate: Date.parse("2026-03-02T04:29:38.576Z"),
				lastInteractionDate: Date.parse("2026-03-02T04:29:55.000Z"),
			},
		];

		for (const testCase of cases) {
			await ingest({
				source: testCase.source,
				sessionId: testCase.sessionId,
				projectPath: "/test/analytics-values-capped",
				content: testCase.content,
			});

			const rows = await readAnalytics(testCase.sessionId);
			expect(rows).toHaveLength(1);
			const row = rows[0];
			if (!row) throw new Error(`no capped ${testCase.source} row produced`);

			expect(row.source).toBe(testCase.source);
			expect(num(row.session_date_ms)).toBe(testCase.sessionDate);
			expect(num(row.last_interaction_date_ms)).toBe(
				testCase.lastInteractionDate,
			);
			expect(num(row.total_tokens)).toBe(0);
			expect(num(row.total_interactions)).toBe(0);
			expect(num(row.actual_duration_min)).toBe(0);
			expect(num(row.avg_period_sec)).toBe(0);
			expect(num(row.median_period_sec)).toBe(0);
			expect(num(row.quick_responses)).toBe(0);
			expect(num(row.normal_responses)).toBe(0);
			expect(num(row.long_pauses)).toBe(0);
			expect(num(row.inference_duration_sec)).toBe(0);
			expect(num(row.human_duration_sec)).toBe(0);
		}
	}, 300000);

	test("retains error classification after raw transcripts expire", async () => {
		const sessionId = `values_retention_${runId}`;
		const projectPath = `/test/retention-${runId}`;
		const content = recentRetentionTranscript();

		await ingest({
			source: "claude_code",
			sessionId,
			projectPath,
			content,
			subagents: [
				{
					agentId: "retention-agent",
					content: "retained only with the raw session",
				},
			],
		});
		await readAnalytics(sessionId);

		const detail = await getSessionDetail(ORG_ID, sessionId, USER_ID);
		expect(detail?.content).toBe(content);
		expect(detail?.subagents).toEqual({
			"retention-agent": "retained only with the raw session",
		});

		const developerErrors = await getDeveloperErrors(ORG_ID, USER_ID);
		expect(developerErrors.map((error) => error.error_pattern)).toContain(
			"TypeError",
		);

		const projectErrors = await getProjectErrors(ORG_ID, projectPath);
		expect(projectErrors.map((error) => error.error_pattern)).toContain(
			"TypeError",
		);

		const recurringErrors = await getTopRecurringErrors(ORG_ID, {
			min_occurrences: 1,
		});
		expect(recurringErrors.map((error) => error.error_pattern)).toContain(
			"TypeError",
		);

		const learnings = await getLearningsFeed(ORG_ID, {
			user_id: USER_ID,
			project_path: projectPath,
		});
		expect(learnings).toHaveLength(1);
		expect(learnings[0]?.content).toBe(
			"Keep transcript access tied to raw retention.",
		);
		expect(learnings[0]?.subagents).toEqual(["retention-agent"]);

		await executor.execute({
			query: `
				DELETE FROM ${getSafeClickHouseTable("rudel.claude_sessions")}
				WHERE organization_id = {orgId:String}
				  AND user_id = {userId:String}
				  AND session_id = {sessionId:String}
			`,
			query_params: {
				orgId: ORG_ID,
				sessionId,
				userId: USER_ID,
			},
			clickhouse_settings: { mutations_sync: "2" },
		});

		const analyticsRows = await readAnalytics(sessionId);
		expect(analyticsRows).toHaveLength(1);
		expect(analyticsRows[0]?.error_pattern).toBe("TypeError");
		expect(await getSessionDetail(ORG_ID, sessionId, USER_ID)).toBeNull();
		expect(
			(await getDeveloperErrors(ORG_ID, USER_ID)).map(
				(error) => error.error_pattern,
			),
		).toContain("TypeError");
		expect(
			(await getProjectErrors(ORG_ID, projectPath)).map(
				(error) => error.error_pattern,
			),
		).toContain("TypeError");
		expect(
			(
				await getTopRecurringErrors(ORG_ID, {
					min_occurrences: 1,
				})
			).map((error) => error.error_pattern),
		).toContain("TypeError");
		expect(
			await getLearningsFeed(ORG_ID, {
				user_id: USER_ID,
				project_path: projectPath,
			}),
		).toEqual([]);
	}, 240000);
});
