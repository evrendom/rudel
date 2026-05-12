import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { ClickHouseStatement } from "../clickhouse.js";

const clickhouseModule = await import("../clickhouse.js");

const executeCalls: ClickHouseStatement[] = [];
let executeImpl: (statement: ClickHouseStatement) => Promise<void> = () =>
	Promise.resolve();
const execute = mock((statement: ClickHouseStatement) => {
	executeCalls.push(statement);
	return executeImpl(statement);
});

mock.module("../clickhouse.js", () => ({
	...clickhouseModule,
	getClickhouse: () => ({
		execute,
		insert: mock(() => Promise.resolve()),
		query: mock(() => Promise.resolve([])),
	}),
}));

const orgSessionService = await import("../services/org-session.service.js");
const { getOrgSessionCount, deleteOrgSessions, deleteUserSessions } =
	orgSessionService;

const queryCalls: ClickHouseStatement[] = [];
let rawTableCounts = new Map<string, string>();
let sessionAnalyticsCount = "0";

const querySessionCount = mock((input: ClickHouseStatement) => {
	queryCalls.push(input);

	if (input.query.includes("rudel.session_analytics")) {
		return Promise.resolve([{ count: sessionAnalyticsCount }]);
	}

	for (const [table, count] of rawTableCounts.entries()) {
		if (input.query.includes(table)) {
			return Promise.resolve([{ count }]);
		}
	}

	throw new Error(`Unexpected ClickHouse query: ${input.query}`);
});

describe("getOrgSessionCount", () => {
	beforeEach(() => {
		queryCalls.length = 0;
		rawTableCounts = new Map([
			["rudel.claude_sessions", "70"],
			["rudel.codex_sessions", "5"],
		]);
		sessionAnalyticsCount = "96";
		querySessionCount.mockClear();
	});

	test("counts wrapped user progress from session analytics", async () => {
		const count = await getOrgSessionCount("org-1", "user-1", {
			querySessionCount,
		});

		expect(count).toBe(96);
		expect(queryCalls).toHaveLength(1);
		expect(queryCalls[0]?.query).toContain(
			"FROM rudel.session_analytics FINAL",
		);
		expect(queryCalls[0]?.query).toContain("user_id = {userId:String}");
		expect(queryCalls[0]?.query_params).toEqual({
			orgId: "org-1",
			userId: "user-1",
		});
	});

	test("keeps organization-level setup counts on raw adapter tables", async () => {
		const count = await getOrgSessionCount("org-1", undefined, {
			querySessionCount,
			rawTableNames: ["rudel.claude_sessions", "rudel.codex_sessions"],
		});

		expect(count).toBe(75);
		expect(queryCalls).toHaveLength(2);
		expect(queryCalls[0]?.query).toContain("FROM rudel.claude_sessions");
		expect(queryCalls[1]?.query).toContain("FROM rudel.codex_sessions");
		expect(queryCalls[0]?.query).not.toContain("user_id = {userId:String}");
		expect(queryCalls[1]?.query).not.toContain("user_id = {userId:String}");
	});
});

describe("deleteOrgSessions", () => {
	beforeEach(() => {
		executeCalls.length = 0;
		execute.mockClear();
		executeImpl = () => Promise.resolve();
	});

	test("issues DELETE on every adapter table and session_analytics by organization_id", async () => {
		await deleteOrgSessions("org-1");

		expect(executeCalls.length).toBeGreaterThanOrEqual(2);
		for (const call of executeCalls) {
			expect(call.query).toMatch(/^DELETE FROM /);
			expect(call.query).toContain("WHERE organization_id = {orgId:String}");
			expect(call.query_params).toEqual({ orgId: "org-1" });
		}
		expect(
			executeCalls.some((c) => c.query.includes("rudel.claude_sessions")),
		).toBe(true);
		expect(
			executeCalls.some((c) => c.query.includes("rudel.session_analytics")),
		).toBe(true);
	});

	test("rejects when ClickHouse fails so the caller can abort Postgres delete", async () => {
		executeImpl = () => Promise.reject(new Error("clickhouse down"));

		await expect(deleteOrgSessions("org-1")).rejects.toThrow("clickhouse down");
	});
});

describe("deleteUserSessions", () => {
	beforeEach(() => {
		executeCalls.length = 0;
		execute.mockClear();
		executeImpl = () => Promise.resolve();
	});

	test("issues DELETE on every adapter table and session_analytics by user_id", async () => {
		await deleteUserSessions("user-1");

		expect(executeCalls.length).toBeGreaterThanOrEqual(2);
		for (const call of executeCalls) {
			expect(call.query).toMatch(/^DELETE FROM /);
			expect(call.query).toContain("WHERE user_id = {userId:String}");
			expect(call.query_params).toEqual({ userId: "user-1" });
		}
		expect(
			executeCalls.some((c) => c.query.includes("rudel.claude_sessions")),
		).toBe(true);
		expect(
			executeCalls.some((c) => c.query.includes("rudel.session_analytics")),
		).toBe(true);
	});

	test("rejects when ClickHouse fails so the caller can abort Postgres delete", async () => {
		executeImpl = () => Promise.reject(new Error("clickhouse down"));

		await expect(deleteUserSessions("user-1")).rejects.toThrow(
			"clickhouse down",
		);
	});
});
