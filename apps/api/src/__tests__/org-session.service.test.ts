import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { ClickHouseStatement } from "../clickhouse.js";
import { getOrgSessionCount } from "../services/org-session.service.js";

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
