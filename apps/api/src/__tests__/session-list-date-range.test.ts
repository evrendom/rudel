import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { ClickHouseStatement } from "../clickhouse.js";
import {
	addOptionalStringEqFilter,
	buildDateFilter,
	buildInclusiveDateRangeFilter,
	getSafeClickHouseTable,
} from "../clickhouse.js";

/**
 * The session list is filtered by the date range picked in the UI.
 *
 * Before `start_date`/`end_date` existed the list only took a `days` lookback
 * measured from now, so picking a window that does not end today returned the
 * last N days instead of the picked window.
 */

const queryCalls: ClickHouseStatement[] = [];

// Bun's mock.module is process-global and leaks across test files, so this mock
// must never carry its own copy of the table allowlist — a stale copy poisons
// whichever test file runs after this one. Delegate to the real implementation.
mock.module("../clickhouse.js", () => ({
	addOptionalStringEqFilter,
	buildDateFilter,
	buildInclusiveDateRangeFilter,
	getClickhouse: () => ({
		query: () => Promise.resolve([]),
	}),
	getSafeClickHouseTable,
	queryClickhouse: (statement: ClickHouseStatement) => {
		queryCalls.push(statement);
		return Promise.resolve([]);
	},
}));

const { getSessionAnalytics } = await import(
	"../services/session-analytics.service.js"
);

function lastQuery(): ClickHouseStatement {
	const statement = queryCalls.at(-1);

	if (!statement) {
		throw new Error("no ClickHouse query was issued");
	}

	return statement;
}

describe("session list date range", () => {
	beforeEach(() => {
		queryCalls.length = 0;
	});

	test("filters on the picked window when both dates are given", async () => {
		await getSessionAnalytics("org-1", {
			days: 31,
			start_date: "2026-03-01",
			end_date: "2026-03-31",
		});

		const { query, query_params } = lastQuery();

		expect(query).toContain(
			"toDate(sa.session_date) >= toDate({startDate:String})",
		);
		expect(query).toContain(
			"toDate(sa.session_date) <= toDate({endDate:String})",
		);
		// The rolling lookback must not also be applied, or a past window would
		// be intersected with "the last N days" and come back empty.
		expect(query).not.toContain("toIntervalDay({days:UInt32})");
		expect(query_params).toMatchObject({
			startDate: "2026-03-01",
			endDate: "2026-03-31",
		});
		expect(query).toContain(
			"FROM rudel.session_language_signals AS signal_rows",
		);
		expect(query).toContain("LEFT ANY JOIN language_signal_counts AS signals");
		expect(query).toContain("signal_rows.organization_id = {orgId:String}");
		expect(query).toContain(
			"toDate(signal_rows.session_date) >= toDate({startDate:String})",
		);
		expect(query).toContain(
			"toDate(signal_rows.session_date) <= toDate({endDate:String})",
		);
		expect(lastQuery().clickhouse_settings?.join_use_nulls).toBe(0);
	});

	test("preserves the production ClickHouse table allowlist in the module mock", () => {
		expect(() =>
			getSafeClickHouseTable("rudel.session_analytics"),
		).not.toThrow();
		expect(() => getSafeClickHouseTable("rudel.unknown_table")).toThrow(
			"Unsupported ClickHouse table: rudel.unknown_table",
		);
	});

	test("falls back to the rolling lookback when no window is given", async () => {
		await getSessionAnalytics("org-1", { days: 7 });

		const { query, query_params } = lastQuery();

		expect(query).toContain("toIntervalDay({days:UInt32})");
		expect(query).not.toContain("{startDate:String}");
		expect(query).toContain(
			"signal_rows.session_date >= now64(3) - toIntervalDay({days:UInt32})",
		);
		expect(query_params).toMatchObject({ days: 7 });
	});

	test("qualifies the user filter against the session analytics relation", async () => {
		await getSessionAnalytics("org-1", {
			days: 7,
			user_id: "user-1",
		});

		const { query, query_params } = lastQuery();

		expect(query).toContain("sa.user_id = {userId:String}");
		expect(query).not.toMatch(/(^|[^.\w])user_id\s*=\s*\{userId:String\}/mu);
		expect(query_params).toMatchObject({ userId: "user-1" });
	});

	test("ignores a half-specified window rather than dropping the filter", async () => {
		for (const partialRange of [
			{ start_date: "2026-03-01" },
			{ end_date: "2026-03-31" },
		]) {
			await getSessionAnalytics("org-1", { days: 7, ...partialRange });

			const { query } = lastQuery();

			expect(query).toContain("toIntervalDay({days:UInt32})");
			expect(query).not.toContain("{startDate:String}");
		}
	});
});
