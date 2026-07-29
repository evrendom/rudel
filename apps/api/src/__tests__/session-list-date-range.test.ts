import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { ClickHouseStatement } from "../clickhouse.js";
import {
	addOptionalStringEqFilter,
	buildDateFilter,
	buildInclusiveDateRangeFilter,
} from "../clickhouse.js";

/**
 * The session list is filtered by the date range picked in the UI.
 *
 * Before `start_date`/`end_date` existed the list only took a `days` lookback
 * measured from now, so picking a window that does not end today returned the
 * last N days instead of the picked window.
 */

const queryCalls: ClickHouseStatement[] = [];

mock.module("../clickhouse.js", () => ({
	addOptionalStringEqFilter,
	buildDateFilter,
	buildInclusiveDateRangeFilter,
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
	});

	test("falls back to the rolling lookback when no window is given", async () => {
		await getSessionAnalytics("org-1", { days: 7 });

		const { query, query_params } = lastQuery();

		expect(query).toContain("toIntervalDay({days:UInt32})");
		expect(query).not.toContain("{startDate:String}");
		expect(query_params).toMatchObject({ days: 7 });
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
