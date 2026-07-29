import { format } from "date-fns";
import { describe, expect, it } from "vitest";
import {
	expandAnalyticsDateRange,
	MAX_ANALYTICS_DAYS,
	normalizeAnalyticsDateRange,
} from "./analytics-date-range";

describe("normalizeAnalyticsDateRange", () => {
	it("clamps oversized ranges to the latest 365 inclusive days", () => {
		expect(normalizeAnalyticsDateRange("2020-01-01", "2026-12-31")).toEqual({
			start: "2026-01-01",
			end: "2026-12-31",
		});
	});

	it("orders reversed ranges", () => {
		expect(normalizeAnalyticsDateRange("2026-04-08", "2026-04-01")).toEqual({
			start: "2026-04-01",
			end: "2026-04-08",
		});
	});

	it("rejects invalid and non-date-only values", () => {
		expect(normalizeAnalyticsDateRange("2026-02-31", "2026-03-01")).toBeNull();
		expect(normalizeAnalyticsDateRange("not-a-date", "2026-03-01")).toBeNull();
		expect(
			normalizeAnalyticsDateRange("2026-03-01T00:00:00Z", "2026-03-02"),
		).toBeNull();
	});

	it("handles extreme four-digit dates without oversized output", () => {
		expect(normalizeAnalyticsDateRange("0001-01-01", "9999-12-31")).toEqual({
			start: "9999-01-01",
			end: "9999-12-31",
		});
	});
});

describe("expandAnalyticsDateRange", () => {
	it("expands reversed and DST-boundary ranges by calendar day", () => {
		const dates = expandAnalyticsDateRange("2026-03-30", "2026-03-28");

		expect(dates.map((date) => format(date, "yyyy-MM-dd"))).toEqual([
			"2026-03-28",
			"2026-03-29",
			"2026-03-30",
		]);
	});

	it("allows exactly 365 days", () => {
		expect(expandAnalyticsDateRange("2026-01-01", "2026-12-31")).toHaveLength(
			MAX_ANALYTICS_DAYS,
		);
	});

	it("rejects oversized, invalid, and extreme intervals before allocation", () => {
		expect(expandAnalyticsDateRange("2025-01-01", "2026-12-31")).toEqual([]);
		expect(expandAnalyticsDateRange("invalid", "2026-12-31")).toEqual([]);
		expect(expandAnalyticsDateRange("0001-01-01", "9999-12-31")).toEqual([]);
	});
});
