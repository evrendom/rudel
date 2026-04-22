import { afterAll, describe, expect, it, test } from "bun:test";
import { createClickHouseExecutor } from "@chkit/clickhouse";
import { ingestRudelClaudeSessions } from "../generated/chkit-ingest";
import type { RudelClaudeSessionsRow } from "../generated/chkit-types";

const testId = `test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const baseExecutor = createClickHouseExecutor({
	url: process.env.CLICKHOUSE_URL || "http://localhost:8123",
	username:
		process.env.CLICKHOUSE_USERNAME || process.env.CLICKHOUSE_USER || "default",
	password: process.env.CLICKHOUSE_PASSWORD || "",
	database: "default",
});

// ClickHouse Cloud's @clickhouse/client insert() silently drops data.
// Wrap the executor to use execute() with FORMAT JSONEachRow instead.
// async_insert=0 forces synchronous insert so data is immediately queryable.
const executor: typeof baseExecutor = {
	...baseExecutor,
	async insert(params) {
		const rows = params.values
			.map((r: Record<string, unknown>) => JSON.stringify(r))
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
				await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
			}
		}
	},
};

async function waitForQuery<T>(
	query: string,
	timeoutMs = 30000,
	intervalMs = 2000,
): Promise<T[]> {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		try {
			const results = await executor.query<T>(query);
			if (results.length > 0) return results;
		} catch {
			// Transient ClickHouse errors (e.g. S3 storage) - retry
		}
		await new Promise((r) => setTimeout(r, intervalMs));
	}
	return [];
}

async function insertWithRetry(
	fn: () => Promise<void>,
	queryFn: () => Promise<unknown[]>,
	maxAttempts = 5,
): Promise<unknown[]> {
	for (let attempt = 0; attempt < maxAttempts; attempt++) {
		try {
			await fn();
		} catch (error) {
			// Retry on transient ClickHouse errors (e.g. INSERT race conditions)
			if (attempt === maxAttempts - 1) throw error;
			await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
			continue;
		}
		const results = await queryFn();
		if (results.length > 0) return results;
	}
	return [];
}

afterAll(() => {
	executor
		.execute(`DELETE FROM rudel.claude_sessions WHERE session_id = '${testId}'`)
		.catch(() => {});
});

describe("ingestRudelClaudeSessions", () => {
	const now = new Date().toISOString().replace("Z", "");
	const row: RudelClaudeSessionsRow = {
		session_date: now,
		last_interaction_date: now,
		session_id: testId,
		organization_id: "org_test",
		project_path: "/test/project",
		git_remote: "",
		package_name: "",
		package_type: "",
		content: "test session content",
		subagents: {},
		ingested_at: now,
		user_id: "user_test",
		git_branch: "main",
		git_sha: null,
		tag: "integration-test",
	};

	test("inserts a row and reads it back", async () => {
		const results = (await insertWithRetry(
			() => ingestRudelClaudeSessions(executor, [row]),
			() =>
				waitForQuery<{ session_id: string; tag: string }>(
					`SELECT session_id, tag FROM rudel.claude_sessions WHERE session_id = '${testId}' LIMIT 1`,
				),
		)) as Array<{ session_id: string; tag: string }>;

		expect(results).toHaveLength(1);
		expect(results[0]?.session_id).toBe(testId);
		expect(results[0]?.tag).toBe("integration-test");
	}, 120000);

	it("rejects invalid data with validate option", async () => {
		const badRow = {
			...row,
			session_id: 999,
		} as unknown as RudelClaudeSessionsRow;
		expect(
			ingestRudelClaudeSessions(executor, [badRow], { validate: true }),
		).rejects.toThrow();
	});
});
