import { beforeEach, describe, expect, mock, test } from "bun:test";

interface ClickHouseQueryInput {
	query: string;
	query_params: Record<string, unknown>;
}

const query = mock((_input: ClickHouseQueryInput) => {
	return Promise.resolve([{ count: "1" }]);
});

mock.module("@rudel/agent-adapters", () => ({
	getAllAdapters: () => [
		{ rawTableName: "rudel.claude_sessions" },
		{ rawTableName: "rudel.codex_sessions" },
	],
}));

mock.module("../clickhouse.js", () => ({
	getClickhouse: () => ({ query }),
	getSafeClickHouseTable: (table: string) => table,
}));

const { getOrgSessionCount } = await import("./org-session.service.js");

describe("getOrgSessionCount", () => {
	beforeEach(() => {
		query.mockClear();
	});

	test("counts uploaded sessions by distinct session id for the current user", async () => {
		const count = await getOrgSessionCount("org-1", "user-1");

		expect(count).toBe(2);
		expect(query).toHaveBeenCalledTimes(2);
		for (const call of query.mock.calls) {
			const input = call[0];
			expect(input.query).toContain("uniqExact(session_id)");
			expect(input.query).toContain("organization_id = {orgId:String}");
			expect(input.query).toContain("user_id = {userId:String}");
			expect(input.query_params).toEqual({
				orgId: "org-1",
				userId: "user-1",
			});
		}
	});
});
