import { afterAll, describe, expect, test } from "bun:test";
import { getAdapter } from "@rudel/agent-adapters";
import type { IngestSessionInput } from "@rudel/api-routes";
import {
	createClickHouseExecutor,
	getSafeClickHouseTable,
} from "../clickhouse.js";

const testId = `api_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const baseExecutor = createClickHouseExecutor({
	url: process.env.CLICKHOUSE_URL || "http://localhost:8123",
	username:
		process.env.CLICKHOUSE_USERNAME || process.env.CLICKHOUSE_USER || "default",
	password: process.env.CLICKHOUSE_PASSWORD || "",
	database: "default",
});
const executor = baseExecutor;

afterAll(() => {
	// Fire-and-forget: ClickHouse Cloud DELETE mutations are slow
	executor
		.execute({
			query: `DELETE FROM ${getSafeClickHouseTable("rudel.claude_sessions")} WHERE session_id = {sessionId:String}`,
			query_params: {
				sessionId: testId,
			},
		})
		.catch(() => {});
});

async function waitForRow(
	sessionId: string,
	timeoutMs = 30000,
	intervalMs = 2000,
): Promise<
	Array<{
		session_id: string;
		project_path: string;
		tag: string;
		user_id: string;
		organization_id: string;
	}>
> {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		try {
			const results = await executor.query<{
				session_id: string;
				project_path: string;
				tag: string;
				user_id: string;
				organization_id: string;
			}>({
				query: `SELECT session_id, project_path, tag, user_id, organization_id FROM ${getSafeClickHouseTable("rudel.claude_sessions")} WHERE session_id = {sessionId:String} LIMIT 1`,
				query_params: {
					sessionId,
				},
			});
			if (results.length > 0) return results;
		} catch {
			// Transient ClickHouse errors (e.g. S3 storage) - retry
		}
		await new Promise((r) => setTimeout(r, intervalMs));
	}
	return [];
}

describe("ingestSession", () => {
	test("ingests a session into ClickHouse and reads it back", async () => {
		const input: IngestSessionInput = {
			source: "claude_code",
			sessionId: testId,
			projectPath: "/test/api-ingest",
			gitBranch: "feature-branch",
			gitSha: "deadbeef",
			tag: "tests",
			content: "integration test content",
			subagents: [{ agentId: "sub-1", content: "subagent content" }],
		};

		// ClickHouse Cloud can silently drop inserts or throw race condition
		// errors (code 236). Retry the insert+read cycle with exponential backoff.
		let results: Awaited<ReturnType<typeof waitForRow>> = [];
		for (let attempt = 0; attempt < 5; attempt++) {
			try {
				const adapter = getAdapter(input.source);
				await adapter.ingest(executor, input, {
					ingestedAt: new Date(),
					userId: "test_user",
					organizationId: "test_org",
				});
			} catch {
				await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
				continue;
			}
			results = await waitForRow(testId);
			if (results.length > 0) break;
		}

		expect(results).toHaveLength(1);
		expect(results[0]?.session_id).toBe(testId);
		expect(results[0]?.project_path).toBe("/test/api-ingest");
		expect(results[0]?.tag).toBe("tests");
		expect(results[0]?.user_id).toBe("test_user");
		expect(results[0]?.organization_id).toBe("test_org");
	}, 120000);
});
