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
import { getSessionDetail } from "../services/session-analytics.service.js";

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
	input_tokens: string | number;
	output_tokens: string | number;
	cache_read_input_tokens: string | number;
	cache_creation_input_tokens: string | number;
	total_tokens: string | number;
	error_count: number;
	error_pattern: string;
	success_score: number;
}

async function ingest(input: IngestSessionInput): Promise<void> {
	const adapter = getAdapter(input.source);
	// ClickHouse Cloud can throw transient race errors (code 236) on insert.
	for (let attempt = 0; attempt < 5; attempt += 1) {
		try {
			await adapter.ingest(executor, input, {
				ingestedAt: new Date(),
				organizationId: ORG_ID,
				userId: USER_ID,
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
				query: `SELECT session_id, source, input_tokens, output_tokens,
					               cache_read_input_tokens, cache_creation_input_tokens, total_tokens,
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

function num(value: string | number): number {
	return typeof value === "number" ? value : Number(value);
}

afterAll(() => {
	// Fire-and-forget: DELETE mutations are slow on ClickHouse Cloud.
	for (const table of [
		"rudel.claude_sessions",
		"rudel.codex_sessions",
		"rudel.session_analytics",
	]) {
		executor
			.execute({
				query: `DELETE FROM ${getSafeClickHouseTable(table)} WHERE organization_id = {orgId:String}`,
				query_params: { orgId: ORG_ID },
			})
			.catch(() => {});
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

	test("re-ingesting the same session does not double-count tokens", async () => {
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
			content: claudeTranscriptWithCorrectedDate(),
		});

		const rows = await readAnalytics(sessionId);

		// A timestamp correction crosses a month boundary, but session_date is no
		// longer part of either the sorting or partition key.
		expect(rows).toHaveLength(1);
		const row = rows[0];
		if (!row) throw new Error("no analytics row produced");
		expect(num(row.total_tokens)).toBe(EXPECTED.total_tokens);
	}, 240000);

	test("keeps the same session identity from Claude and Codex", async () => {
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

		const rows = await readAnalytics(sessionId, 2);

		expect(rows).toHaveLength(2);
		expect(rows.map((row) => row.source).sort()).toEqual([
			"claude_code",
			"codex",
		]);
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
