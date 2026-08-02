import { describe, expect, mock, test } from "bun:test";

const queryClickhouse = mock((input: { query: string }) => {
	if (input.query.includes("WITH error_patterns AS")) {
		expect(input.query).not.toContain("LIMIT {limit:UInt32}");
		return Promise.resolve([
			{
				distinct_patterns: 19,
				high_severity_patterns: 4,
				max_affected_users: 8,
				top_error_pattern: "all-pattern leader",
				total_errors: 240,
			},
		]);
	}

	return Promise.resolve([
		{
			affected_sessions: 4,
			affected_users: 2,
			error_pattern: "visible top pattern",
			last_seen: "2026-08-01",
			occurrences: 4,
			repositories: ["rudel"],
			severity: "low",
		},
	]);
});

mock.module("../clickhouse.js", () => ({
	buildDateFilter: (name: string, column = "session_date") =>
		`${column} >= now64(3) - toIntervalDay({${name}:UInt32}) AND ${column} <= now64(3)`,
	buildInclusiveDateRangeFilter: (
		start: string,
		end: string,
		column = "session_date",
	) =>
		`toDate(${column}) >= toDate({${start}:String}) AND toDate(${column}) <= toDate({${end}:String})`,
	queryClickhouse,
}));

const { getErrorsDashboard } = await import("./error.service.js");

describe("getErrorsDashboard", () => {
	test("keeps all-pattern summary totals separate from the limited list", async () => {
		const dashboard = await getErrorsDashboard("org-1", {
			end_date: "2026-08-01",
			limit: 15,
			start_date: "2026-07-01",
		});

		expect(dashboard.recurring).toHaveLength(1);
		expect(dashboard.summary).toEqual({
			distinct_patterns: 19,
			high_severity_patterns: 4,
			max_affected_users: 8,
			top_error_pattern: "all-pattern leader",
			total_errors: 240,
		});
	});
});
