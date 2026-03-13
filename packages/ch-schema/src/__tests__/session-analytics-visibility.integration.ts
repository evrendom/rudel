import { afterAll, describe, expect, test } from "bun:test";
import { createClickHouseExecutor } from "@chkit/clickhouse";
import {
	ingestRudelClaudeSessions,
	ingestRudelCodexSessions,
} from "../generated/chkit-ingest.js";
import type {
	RudelClaudeSessionsRow,
	RudelCodexSessionsRow,
} from "../generated/chkit-types.js";

const baseExecutor = createClickHouseExecutor({
	url: process.env.CLICKHOUSE_URL || "http://localhost:8123",
	username:
		process.env.CLICKHOUSE_USERNAME || process.env.CLICKHOUSE_USER || "default",
	password: process.env.CLICKHOUSE_PASSWORD || "",
	database: "default",
});

// ClickHouse Cloud's insert() can silently drop rows.
// Use execute() with async_insert=0 so inserts are immediately queryable.
const executor: typeof baseExecutor = {
	...baseExecutor,
	async insert(params) {
		const rows = params.values
			.map((row: Record<string, unknown>) => JSON.stringify(row))
			.join("\n");
		const sql = `INSERT INTO ${params.table} SETTINGS async_insert=0 FORMAT JSONEachRow ${rows}`;

		for (let attempt = 0; attempt < 5; attempt++) {
			try {
				await baseExecutor.execute(sql);
				return;
			} catch (error) {
				const isRaceCondition =
					error instanceof Error &&
					error.message.includes("INSERT race condition");
				if (!isRaceCondition || attempt === 4) throw error;
				await Bun.sleep(1_000 * 2 ** attempt);
			}
		}
	},
};

const insertedClaudeIds = new Set<string>();
const insertedCodexIds = new Set<string>();
const insertedAnalyticsIds = new Set<string>();

function isoMinutesFromNow(offsetMinutes: number): string {
	return new Date(Date.now() + offsetMinutes * 60_000).toISOString();
}

function clickhouseNow(): string {
	return new Date().toISOString().replace("Z", "");
}

async function waitForQuery<T>(
	query: string,
	predicate: (rows: T[]) => boolean,
	timeoutMs = 30_000,
	intervalMs = 2_000,
): Promise<T[]> {
	const deadline = Date.now() + timeoutMs;

	while (Date.now() < deadline) {
		try {
			const rows = await executor.query<T>(query);
			if (predicate(rows)) return rows;
		} catch {
			// Retry transient ClickHouse errors while cloud storage settles.
		}
		await Bun.sleep(intervalMs);
	}

	return [];
}

function quoteIds(values: Set<string>): string {
	return [...values].map((value) => `'${value}'`).join(", ");
}

afterAll(() => {
	if (insertedAnalyticsIds.size > 0) {
		void executor
			.execute(
				`DELETE FROM rudel.session_analytics WHERE session_id IN (${quoteIds(insertedAnalyticsIds)})`,
			)
			.catch(() => {});
	}

	if (insertedClaudeIds.size > 0) {
		void executor
			.execute(
				`DELETE FROM rudel.claude_sessions WHERE session_id IN (${quoteIds(insertedClaudeIds)})`,
			)
			.catch(() => {});
	}

	if (insertedCodexIds.size > 0) {
		void executor
			.execute(
				`DELETE FROM rudel.codex_sessions WHERE session_id IN (${quoteIds(insertedCodexIds)})`,
			)
			.catch(() => {});
	}
});

describe("session analytics visibility regression", () => {
	test("keeps Claude sessions visible when user/assistant timestamps are missing", async () => {
		const orgId = `org_visibility_claude_${Date.now()}`;
		const missingId = `claude_missing_ts_${Date.now()}`;
		const validId = `claude_valid_ts_${Date.now()}`;
		const now = clickhouseNow();

		const rows: RudelClaudeSessionsRow[] = [
			{
				session_date: now,
				last_interaction_date: now,
				session_id: missingId,
				organization_id: orgId,
				project_path: "/tests/claude-missing-timestamps",
				git_remote: "",
				package_name: "",
				package_type: "",
				content: [
					JSON.stringify({ type: "user", message: { content: "hello" } }),
					JSON.stringify({
						type: "assistant",
						message: {
							model: "claude-3-7-sonnet",
							usage: { input_tokens: 10, output_tokens: 20 },
						},
					}),
				].join("\n"),
				subagents: {},
				ingested_at: now,
				user_id: "user_visibility",
				git_branch: "main",
				git_sha: null,
				tag: "bug-repro",
			},
			{
				session_date: now,
				last_interaction_date: now,
				session_id: validId,
				organization_id: orgId,
				project_path: "/tests/claude-valid-timestamps",
				git_remote: "",
				package_name: "",
				package_type: "",
				content: [
					JSON.stringify({
						type: "user",
						timestamp: isoMinutesFromNow(-5),
						message: { content: "hello" },
					}),
					JSON.stringify({
						type: "assistant",
						timestamp: isoMinutesFromNow(-4),
						message: {
							model: "claude-3-7-sonnet",
							usage: { input_tokens: 10, output_tokens: 20 },
						},
					}),
				].join("\n"),
				subagents: {},
				ingested_at: now,
				user_id: "user_visibility",
				git_branch: "main",
				git_sha: null,
				tag: "bug-repro",
			},
		];

		insertedClaudeIds.add(missingId);
		insertedClaudeIds.add(validId);
		insertedAnalyticsIds.add(missingId);
		insertedAnalyticsIds.add(validId);

		await ingestRudelClaudeSessions(executor, rows);

		const analyticsRows = await waitForQuery<{
			session_id: string;
			total_interactions: number;
			actual_duration_min: number;
		}>(
			`SELECT session_id, total_interactions, actual_duration_min
			 FROM rudel.session_analytics FINAL
			 WHERE organization_id = '${orgId}'
			 ORDER BY session_id ASC`,
			(result) => result.length === 2,
		);

		expect(analyticsRows.map((row) => row.session_id)).toContain(validId);
		expect(analyticsRows.map((row) => row.session_id)).toContain(missingId);
		expect(
			analyticsRows.find((row) => row.session_id === missingId),
		).toMatchObject({
			session_id: missingId,
			total_interactions: 0,
			actual_duration_min: 0,
		});

		const baseRows = await waitForQuery<{ session_id: string }>(
			`SELECT session_id
			 FROM rudel.claude_sessions FINAL
			 WHERE organization_id = '${orgId}'
			 ORDER BY session_id ASC`,
			(result) => result.length === 2,
		);

		expect(baseRows.map((row) => row.session_id)).toEqual(
			[missingId, validId].sort(),
		);
	}, 60_000);

	test("keeps Claude sessions visible when transcripts have no interaction lines", async () => {
		const orgId = `org_visibility_claude_no_interactions_${Date.now()}`;
		const missingId = `claude_no_interactions_${Date.now()}`;
		const validId = `claude_valid_control_${Date.now()}`;
		const now = clickhouseNow();

		const rows: RudelClaudeSessionsRow[] = [
			{
				session_date: now,
				last_interaction_date: now,
				session_id: missingId,
				organization_id: orgId,
				project_path: "/tests/claude-no-interactions",
				git_remote: "",
				package_name: "",
				package_type: "",
				content: [
					JSON.stringify({ type: "summary", sessionId: missingId }),
					JSON.stringify({
						toolUseResult: { agentId: "sub-agent-001", result: "done" },
					}),
				].join("\n"),
				subagents: {},
				ingested_at: now,
				user_id: "user_visibility",
				git_branch: "main",
				git_sha: null,
				tag: "bug-repro",
			},
			{
				session_date: now,
				last_interaction_date: now,
				session_id: validId,
				organization_id: orgId,
				project_path: "/tests/claude-valid-control",
				git_remote: "",
				package_name: "",
				package_type: "",
				content: [
					JSON.stringify({
						type: "user",
						timestamp: isoMinutesFromNow(-8),
						message: { content: "hello" },
					}),
					JSON.stringify({
						type: "assistant",
						timestamp: isoMinutesFromNow(-7),
						message: {
							model: "claude-3-7-sonnet",
							usage: { input_tokens: 20, output_tokens: 40 },
						},
					}),
				].join("\n"),
				subagents: {},
				ingested_at: now,
				user_id: "user_visibility",
				git_branch: "main",
				git_sha: null,
				tag: "bug-repro",
			},
		];

		insertedClaudeIds.add(missingId);
		insertedClaudeIds.add(validId);
		insertedAnalyticsIds.add(missingId);
		insertedAnalyticsIds.add(validId);

		await ingestRudelClaudeSessions(executor, rows);

		const analyticsRows = await waitForQuery<{
			session_id: string;
			total_interactions: number;
			actual_duration_min: number;
		}>(
			`SELECT session_id, total_interactions, actual_duration_min
			 FROM rudel.session_analytics FINAL
			 WHERE organization_id = '${orgId}'
			 ORDER BY session_id ASC`,
			(result) => result.length === 2,
		);

		expect(analyticsRows.map((row) => row.session_id)).toContain(validId);
		expect(analyticsRows.map((row) => row.session_id)).toContain(missingId);
		expect(
			analyticsRows.find((row) => row.session_id === missingId),
		).toMatchObject({
			session_id: missingId,
			total_interactions: 0,
			actual_duration_min: 0,
		});
	}, 60_000);

	test("keeps Codex sessions visible when timestamps are missing", async () => {
		const orgId = `org_visibility_codex_${Date.now()}`;
		const missingId = `codex_missing_ts_${Date.now()}`;
		const validId = `codex_valid_ts_${Date.now()}`;
		const now = clickhouseNow();

		const rows: RudelCodexSessionsRow[] = [
			{
				session_date: now,
				last_interaction_date: now,
				session_id: missingId,
				organization_id: orgId,
				project_path: "/tests/codex-missing-timestamps",
				git_remote: "",
				package_name: "",
				package_type: "",
				content: [
					JSON.stringify({
						type: "session_meta",
						payload: { id: missingId, cwd: "/tests/codex-missing-timestamps" },
					}),
					JSON.stringify({ type: "response_item", payload: { id: "resp-1" } }),
					JSON.stringify({ type: "event_msg", payload: { text: "done" } }),
				].join("\n"),
				ingested_at: now,
				user_id: "user_visibility",
				git_branch: "main",
				git_sha: null,
				tag: "bug-repro",
			},
			{
				session_date: now,
				last_interaction_date: now,
				session_id: validId,
				organization_id: orgId,
				project_path: "/tests/codex-valid-timestamps",
				git_remote: "",
				package_name: "",
				package_type: "",
				content: [
					JSON.stringify({
						type: "session_meta",
						timestamp: isoMinutesFromNow(-12),
						payload: { id: validId, cwd: "/tests/codex-valid-timestamps" },
					}),
					JSON.stringify({
						type: "response_item",
						timestamp: isoMinutesFromNow(-11),
						payload: { id: "resp-1" },
					}),
					JSON.stringify({
						type: "event_msg",
						timestamp: isoMinutesFromNow(-10),
						payload: { text: "done" },
					}),
					JSON.stringify({
						type: "event",
						name: "turn.completed",
						timestamp: isoMinutesFromNow(-10),
						payload: { usage: { input_tokens: 15, output_tokens: 25 } },
					}),
				].join("\n"),
				ingested_at: now,
				user_id: "user_visibility",
				git_branch: "main",
				git_sha: null,
				tag: "bug-repro",
			},
		];

		insertedCodexIds.add(missingId);
		insertedCodexIds.add(validId);
		insertedAnalyticsIds.add(missingId);
		insertedAnalyticsIds.add(validId);

		await ingestRudelCodexSessions(executor, rows);

		const analyticsRows = await waitForQuery<{
			session_id: string;
			total_interactions: number;
			actual_duration_min: number;
		}>(
			`SELECT session_id, total_interactions, actual_duration_min
			 FROM rudel.session_analytics FINAL
			 WHERE organization_id = '${orgId}'
			 ORDER BY session_id ASC`,
			(result) => result.length === 2,
		);

		expect(analyticsRows.map((row) => row.session_id)).toContain(validId);
		expect(analyticsRows.map((row) => row.session_id)).toContain(missingId);
		expect(
			analyticsRows.find((row) => row.session_id === missingId),
		).toMatchObject({
			session_id: missingId,
			total_interactions: 0,
			actual_duration_min: 0,
		});

		const baseRows = await waitForQuery<{ session_id: string }>(
			`SELECT session_id
			 FROM rudel.codex_sessions FINAL
			 WHERE organization_id = '${orgId}'
			 ORDER BY session_id ASC`,
			(result) => result.length === 2,
		);

		expect(baseRows.map((row) => row.session_id)).toEqual(
			[missingId, validId].sort(),
		);
	}, 60_000);
});
