import {
	afterAll,
	describe,
	expect,
	it,
	setDefaultTimeout,
	test,
} from "bun:test";
import { ingestRudelClaudeSessions } from "../generated/chkit-ingest.js";
import type { RudelClaudeSessionsRow } from "../generated/chkit-types.js";
import { createTestExecutor, waitForQuery } from "./helpers/executor.js";

const testId = `test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const executor = createTestExecutor();

setDefaultTimeout(120_000);

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

afterAll(async () => {
	await executor
		.execute(
			`DELETE FROM rudel.claude_sessions WHERE session_id = '${testId}' SETTINGS lightweight_deletes_sync = 0`,
		)
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
		filter_version: 0,
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
					executor,
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
