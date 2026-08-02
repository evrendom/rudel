import { afterAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import {
	ingestRudelClaudeSessions,
	ingestRudelCodexSessions,
} from "../generated/chkit-ingest.js";
import type {
	RudelClaudeSessionsRow,
	RudelCodexSessionsRow,
	RudelSessionAnalyticsRow,
} from "../generated/chkit-types.js";
import { CLAUDE_SESSION_ANALYTICS_MV_SQL } from "../mv-sql/claude-session-analytics.js";
import { CODEX_SESSION_ANALYTICS_MV_SQL } from "../mv-sql/codex-session-analytics.js";
import { ANALYTICS_TRANSCRIPT_LINE_LIMIT } from "../mv-sql/counting-correctness.js";
import { createTestExecutor, waitForQuery } from "./helpers/executor.js";
import { withSessionFilter } from "./mv-session-filter.js";

setDefaultTimeout(180_000);

const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const organizationId = `org_counting_correctness_${runId}`;
const executor = createTestExecutor();

function jsonl(lines: readonly unknown[]): string {
	return lines.map((line) => JSON.stringify(line)).join("\n");
}

function claudeAssistant({
	at,
	cache1h,
	cache5m,
	cacheRead,
	input,
	model,
	output,
	requestId,
}: {
	at: string;
	cache1h: number;
	cache5m: number;
	cacheRead: number;
	input: number;
	model: string;
	output: number;
	requestId: string;
}) {
	return {
		type: "assistant",
		requestId,
		timestamp: at,
		message: {
			id: `message-${requestId}`,
			model,
			usage: {
				input_tokens: input,
				output_tokens: output,
				cache_read_input_tokens: cacheRead,
				cache_creation_input_tokens: cache5m + cache1h,
				cache_creation: {
					ephemeral_5m_input_tokens: cache5m,
					ephemeral_1h_input_tokens: cache1h,
				},
			},
		},
	};
}

function baseClaudeRow(
	sessionId: string,
	content: string,
	subagents: Record<string, string>,
): RudelClaudeSessionsRow {
	return {
		session_date: "2026-08-01T10:00:00.000",
		last_interaction_date: "2026-08-01T10:10:00.000",
		session_id: sessionId,
		organization_id: organizationId,
		project_path: "/test/token-counting",
		git_remote: "",
		package_name: "token-counting",
		package_type: "package.json",
		content,
		filter_version: 5,
		ingested_at: "2026-08-01T10:11:00.000",
		user_id: "user-counting",
		git_branch: "main",
		git_sha: null,
		tag: "token-counting-correctness",
		subagents,
	};
}

function codexUsage(
	at: string,
	input: number,
	cacheRead: number,
	output: number,
) {
	return {
		timestamp: at,
		type: "event_msg",
		payload: {
			type: "token_count",
			info: {
				total_token_usage: {
					input_tokens: input,
					cached_input_tokens: cacheRead,
					output_tokens: output,
				},
			},
		},
	};
}

afterAll(async () => {
	for (const table of [
		"rudel.claude_sessions",
		"rudel.codex_sessions",
		"rudel.session_analytics",
	]) {
		await executor
			.execute(
				`DELETE FROM ${table} WHERE organization_id = '${organizationId}' SETTINGS lightweight_deletes_sync = 0`,
			)
			.catch(() => {});
	}
});

describe("counting-correctness materialized views", () => {
	test("includes subagent usage, cache duration, poison-line tolerance, and a real model", async () => {
		const sessionId = `claude_subagents_${runId}`;
		const content = jsonl([
			{
				type: "user",
				timestamp: "2026-08-01T10:00:00.000Z",
				message: { role: "user", content: "count everything" },
			},
			{ type: "user", timestamp: "not-a-date", message: { role: "user" } },
			claudeAssistant({
				at: "2026-08-01T10:01:00.000Z",
				cache1h: 3,
				cache5m: 4,
				cacheRead: 3,
				input: 10,
				model: "claude-opus-5",
				output: 2,
				requestId: "main-request",
			}),
			{
				type: "assistant",
				timestamp: "2026-08-01T10:02:00.000Z",
				message: { model: "<synthetic>" },
			},
		]);
		const subagent = jsonl([
			claudeAssistant({
				at: "2026-08-01T10:01:30.000Z",
				cache1h: 3,
				cache5m: 1,
				cacheRead: 6,
				input: 20,
				model: "claude-opus-5",
				output: 5,
				requestId: "subagent-request",
			}),
		]);

		await ingestRudelClaudeSessions(executor, [
			baseClaudeRow(sessionId, content, { worker: subagent }),
		]);
		const rows = await waitForQuery<RudelSessionAnalyticsRow>(
			executor,
			withSessionFilter(CLAUDE_SESSION_ANALYTICS_MV_SQL, {
				organizationId,
				sessionId,
			}),
		);
		const row = rows[0];
		if (!row) throw new Error("Claude correctness row was not produced");

		expect(Number(row.input_tokens)).toBe(50);
		expect(Number(row.output_tokens)).toBe(7);
		expect(Number(row.cache_read_input_tokens)).toBe(9);
		expect(Number(row.cache_creation_input_tokens)).toBe(11);
		expect(Number(row.cache_creation_5m_input_tokens)).toBe(5);
		expect(Number(row.cache_creation_1h_input_tokens)).toBe(6);
		expect(row.model_used).toBe("claude-opus-5");
		expect(row.is_capped).toBe(0);
	}, 180_000);

	test("keeps real tokens and marks a transcript beyond the extraction bound", async () => {
		const sessionId = `claude_capped_${runId}`;
		const usage = claudeAssistant({
			at: "2026-08-01T10:01:00.000Z",
			cache1h: 0,
			cache5m: 0,
			cacheRead: 0,
			input: 12,
			model: "claude-opus-5",
			output: 4,
			requestId: "before-cap",
		});
		const content = [
			JSON.stringify(usage),
			...Array.from(
				{ length: ANALYTICS_TRANSCRIPT_LINE_LIMIT + 1 },
				() => "{}",
			),
		].join("\n");

		await ingestRudelClaudeSessions(executor, [
			baseClaudeRow(sessionId, content, {}),
		]);
		const rows = await waitForQuery<RudelSessionAnalyticsRow>(
			executor,
			withSessionFilter(CLAUDE_SESSION_ANALYTICS_MV_SQL, {
				organizationId,
				sessionId,
			}),
		);
		const row = rows[0];
		if (!row) throw new Error("capped Claude row was not produced");

		expect(Number(row.total_tokens)).toBe(16);
		expect(row.is_capped).toBe(1);
	}, 180_000);

	test("sums Codex cumulative maxima across resume resets", async () => {
		const sessionId = `codex_resume_${runId}`;
		const content = jsonl([
			{
				timestamp: "2026-08-01T10:00:00.000Z",
				type: "turn_context",
				payload: { model: "gpt-5.6-sol" },
			},
			codexUsage("2026-08-01T10:01:00.000Z", 100, 40, 10),
			codexUsage("2026-08-01T10:02:00.000Z", 150, 60, 20),
			{
				timestamp: "invalid",
				type: "event_msg",
				payload: { type: "token_count", info: null },
			},
			codexUsage("2026-08-01T10:03:00.000Z", 20, 5, 3),
			codexUsage("2026-08-01T10:04:00.000Z", 50, 15, 7),
			{
				timestamp: "2026-08-01T10:05:00.000Z",
				type: "turn_context",
				payload: { model: "<synthetic>" },
			},
		]);
		const row: RudelCodexSessionsRow = {
			session_date: "2026-08-01T10:00:00.000",
			last_interaction_date: "2026-08-01T10:05:00.000",
			session_id: sessionId,
			organization_id: organizationId,
			project_path: "/test/token-counting",
			git_remote: "",
			package_name: "token-counting",
			package_type: "package.json",
			content,
			filter_version: 5,
			ingested_at: "2026-08-01T10:06:00.000",
			user_id: "user-counting",
			git_branch: "main",
			git_sha: null,
			tag: "token-counting-correctness",
		};

		await ingestRudelCodexSessions(executor, [row]);
		const rows = await waitForQuery<RudelSessionAnalyticsRow>(
			executor,
			withSessionFilter(CODEX_SESSION_ANALYTICS_MV_SQL, {
				organizationId,
				sessionId,
			}),
		);
		const analytics = rows[0];
		if (!analytics) throw new Error("Codex resume row was not produced");

		expect(Number(analytics.input_tokens)).toBe(200);
		expect(Number(analytics.cache_read_input_tokens)).toBe(75);
		expect(Number(analytics.output_tokens)).toBe(27);
		expect(analytics.model_used).toBe("gpt-5.6-sol");
	}, 180_000);
});
