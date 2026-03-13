import { afterAll, describe, expect, test } from "bun:test";
import { getAdapter } from "@rudel/agent-adapters";
import type { IngestSessionInput } from "@rudel/api-routes";
import { createClickHouseExecutor } from "../clickhouse.js";
import { getSessionAnalytics } from "../services/session-analytics.service.js";

const baseExecutor = createClickHouseExecutor({
	url: process.env.CLICKHOUSE_URL || "http://localhost:8123",
	username:
		process.env.CLICKHOUSE_USERNAME || process.env.CLICKHOUSE_USER || "default",
	password: process.env.CLICKHOUSE_PASSWORD || "",
	database: "default",
});

const executor: typeof baseExecutor = {
	...baseExecutor,
	async insert(params) {
		for (let attempt = 0; attempt < 5; attempt++) {
			try {
				await baseExecutor.insert(params);
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
const insertedAnalyticsIds = new Set<string>();

function isoMinutesAgo(minutes: number): string {
	return new Date(Date.now() - minutes * 60_000).toISOString();
}

async function waitForAnalytics(
	orgId: string,
	days: number,
	predicate: (
		sessions: Awaited<ReturnType<typeof getSessionAnalytics>>,
	) => boolean,
	timeoutMs = 30_000,
	intervalMs = 2_000,
) {
	const deadline = Date.now() + timeoutMs;

	while (Date.now() < deadline) {
		try {
			const sessions = await getSessionAnalytics(orgId, {
				days,
				limit: 100,
			});
			if (predicate(sessions)) return sessions;
		} catch {
			// Retry while MV propagation settles.
		}
		await Bun.sleep(intervalMs);
	}

	return [] as Awaited<ReturnType<typeof getSessionAnalytics>>;
}

async function waitForBaseCount(orgId: string, expected: number) {
	const deadline = Date.now() + 30_000;

	while (Date.now() < deadline) {
		try {
			const rows = await executor.query<{ count: number }>({
				query: `SELECT count() AS count
					FROM rudel.claude_sessions FINAL
					WHERE organization_id = {orgId:String}`,
				query_params: { orgId },
			});
			if (rows[0]?.count === expected) return rows[0].count;
		} catch {
			// Retry transient ClickHouse errors.
		}
		await Bun.sleep(2_000);
	}

	return 0;
}

afterAll(() => {
	if (insertedAnalyticsIds.size > 0) {
		void executor
			.execute({
				query: `DELETE FROM rudel.session_analytics WHERE session_id IN (${[
					...insertedAnalyticsIds,
				]
					.map((id) => `'${id}'`)
					.join(", ")})`,
			})
			.catch(() => {});
	}

	if (insertedClaudeIds.size > 0) {
		void executor
			.execute({
				query: `DELETE FROM rudel.claude_sessions WHERE session_id IN (${[
					...insertedClaudeIds,
				]
					.map((id) => `'${id}'`)
					.join(", ")})`,
			})
			.catch(() => {});
	}
});

describe("session visibility regression", () => {
	test("service-layer fix: a mixed upload batch stays fully visible", async () => {
		const orgId = `org_service_visibility_${Date.now()}`;
		const adapter = getAdapter("claude_code");
		const visibleId = `service_visible_${Date.now()}`;
		const hiddenIds = Array.from(
			{ length: 9 },
			(_, index) => `service_hidden_${Date.now()}_${index}`,
		);
		const allIds = [visibleId, ...hiddenIds];

		for (const sessionId of allIds) {
			insertedClaudeIds.add(sessionId);
			insertedAnalyticsIds.add(sessionId);
		}

		const requests: IngestSessionInput[] = [
			{
				source: "claude_code",
				sessionId: visibleId,
				projectPath: "/tests/service-visible",
				content: [
					JSON.stringify({
						type: "user",
						timestamp: isoMinutesAgo(4),
						message: { content: "hello" },
					}),
					JSON.stringify({
						type: "assistant",
						timestamp: isoMinutesAgo(3),
						message: {
							model: "claude-3-7-sonnet",
							usage: { input_tokens: 10, output_tokens: 20 },
						},
					}),
				].join("\n"),
			},
			...hiddenIds.map(
				(sessionId, index): IngestSessionInput => ({
					source: "claude_code",
					sessionId,
					projectPath: `/tests/service-hidden-${index}`,
					content:
						index % 2 === 0
							? [
									JSON.stringify({
										type: "user",
										message: { content: "hello" },
									}),
									JSON.stringify({
										type: "assistant",
										message: {
											model: "claude-3-7-sonnet",
											usage: { input_tokens: 5, output_tokens: 10 },
										},
									}),
								].join("\n")
							: [
									JSON.stringify({ type: "summary", sessionId }),
									JSON.stringify({
										toolUseResult: { agentId: "sub-agent-001", result: "done" },
									}),
								].join("\n"),
				}),
			),
		];

		for (const request of requests) {
			await adapter.ingest(executor, request, {
				userId: "user_service_visibility",
				organizationId: orgId,
			});
		}

		const baseCount = await waitForBaseCount(orgId, requests.length);
		expect(baseCount).toBe(requests.length);

		const visibleSessions = await waitForAnalytics(
			orgId,
			3650,
			(sessions) => sessions.length === requests.length,
		);

		expect(
			new Set(visibleSessions.map((session) => session.session_id)),
		).toEqual(new Set(allIds));
	}, 90_000);

	test("control: old but valid sessions are hidden by a 7-day query window, not by ingest failure", async () => {
		const orgId = `org_service_date_range_${Date.now()}`;
		const adapter = getAdapter("claude_code");
		const oldId = `service_old_${Date.now()}`;
		const recentId = `service_recent_${Date.now()}`;
		const oldStart = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
		const oldEnd = new Date(oldStart.getTime() + 5 * 60 * 1000);

		for (const sessionId of [oldId, recentId]) {
			insertedClaudeIds.add(sessionId);
			insertedAnalyticsIds.add(sessionId);
		}

		const requests: IngestSessionInput[] = [
			{
				source: "claude_code",
				sessionId: oldId,
				projectPath: "/tests/service-old-session",
				content: [
					JSON.stringify({
						type: "user",
						timestamp: oldStart.toISOString(),
						message: { content: "hello from the past" },
					}),
					JSON.stringify({
						type: "assistant",
						timestamp: oldEnd.toISOString(),
						message: {
							model: "claude-3-7-sonnet",
							usage: { input_tokens: 10, output_tokens: 20 },
						},
					}),
				].join("\n"),
			},
			{
				source: "claude_code",
				sessionId: recentId,
				projectPath: "/tests/service-recent-session",
				content: [
					JSON.stringify({
						type: "user",
						timestamp: isoMinutesAgo(15),
						message: { content: "recent hello" },
					}),
					JSON.stringify({
						type: "assistant",
						timestamp: isoMinutesAgo(14),
						message: {
							model: "claude-3-7-sonnet",
							usage: { input_tokens: 10, output_tokens: 20 },
						},
					}),
				].join("\n"),
			},
		];

		for (const request of requests) {
			await adapter.ingest(executor, request, {
				userId: "user_service_visibility",
				organizationId: orgId,
			});
		}

		const allSessions = await waitForAnalytics(
			orgId,
			90,
			(sessions) =>
				sessions.some((session) => session.session_id === oldId) &&
				sessions.some((session) => session.session_id === recentId),
		);

		expect(new Set(allSessions.map((session) => session.session_id))).toEqual(
			new Set([oldId, recentId]),
		);

		const lastSevenDays = await getSessionAnalytics(orgId, {
			days: 7,
			limit: 100,
		});

		expect(lastSevenDays.map((session) => session.session_id)).toEqual([
			recentId,
		]);
	}, 90_000);
});
