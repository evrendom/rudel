import { afterAll, describe, expect, test } from "bun:test";
import {
	createClickHouseExecutor,
	getSafeClickHouseTable,
} from "../clickhouse.js";

const liveTable = getSafeClickHouseTable("rudel.claude_sessions");
const insertedSessionIds = new Set<string>();

function getExecutor() {
	const url = process.env.CLICKHOUSE_URL;
	if (!url) throw new Error("CLICKHOUSE_URL is required");
	return createClickHouseExecutor({
		url,
		username:
			process.env.CLICKHOUSE_USERNAME ||
			process.env.CLICKHOUSE_USER ||
			"default",
		password: process.env.CLICKHOUSE_PASSWORD || "",
		database: process.env.CLICKHOUSE_DB || "default",
	});
}

async function waitForRow(
	executor: ReturnType<typeof createClickHouseExecutor>,
	sessionId: string,
	timeoutMs = 90_000,
	intervalMs = 1_000,
): Promise<
	| {
			session_id: string;
			project_path: string;
			content: string;
	  }
	| undefined
> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		try {
			const rows = await executor.query<{
				session_id: string;
				project_path: string;
				content: string;
			}>({
				query: `SELECT session_id, project_path, content FROM ${liveTable} WHERE session_id = {sessionId:String} LIMIT 1`,
				query_params: {
					sessionId,
				},
			});
			if (rows[0]) return rows[0];
		} catch {
			// Transient ClickHouse errors can happen while cloud storage settles.
		}
		await Bun.sleep(intervalMs);
	}

	return undefined;
}

afterAll(() => {
	if (insertedSessionIds.size === 0) return;
	const exec = getExecutor();
	void Promise.all(
		[...insertedSessionIds].map((sessionId) =>
			exec
				.execute({
					query: `DELETE FROM ${liveTable} WHERE session_id = {sessionId:String}`,
					query_params: { sessionId },
				})
				.catch(() => {}),
		),
	);
});

describe("clickhouse executor integration", () => {
	test("round-trips malicious query params against real ClickHouse", async () => {
		const executor = getExecutor();
		const payload = "abc'\\\\\n--\u2028";
		const rows = await executor.query<{ value: string }>({
			query: "SELECT {value:String} AS value",
			query_params: {
				value: payload,
			},
		});

		expect(rows[0]?.value).toBe(payload);
	});

	test("inserts and queries a live row in ClickHouse", async () => {
		const executor = getExecutor();
		const sessionId = `clickhouse_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
		const now = new Date().toISOString().replace("Z", "");
		const projectPath = "/tmp/quote-'\\\\\n\u2028";
		const content = "line1\nquote:'\nbackslash:\\\nunicode:\u2028";

		insertedSessionIds.add(sessionId);

		await executor.insert({
			table: liveTable,
			values: [
				{
					session_date: now,
					last_interaction_date: now,
					session_id: sessionId,
					organization_id: "org_test",
					project_path: projectPath,
					git_remote: "",
					package_name: "",
					package_type: "",
					content,
					ingested_at: now,
					user_id: "user_test",
					git_branch: "main",
					git_sha: null,
					tag: "clickhouse-test",
					subagents: {},
				},
			],
		});

		const row = await waitForRow(executor, sessionId);

		expect(row).toBeDefined();
		expect(row?.session_id).toBe(sessionId);
		expect(row?.project_path).toBe(projectPath);
		expect(row?.content).toBe(content);

		await executor.execute({
			query: `DELETE FROM ${liveTable} WHERE session_id = {sessionId:String}`,
			query_params: {
				sessionId,
			},
		});
		insertedSessionIds.delete(sessionId);
	}, 120_000);
});
