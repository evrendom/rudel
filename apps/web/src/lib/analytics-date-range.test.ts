import { describe, expect, test } from "bun:test";
import {
	getInclusiveDateRangeDays,
	getSupportedAnalyticsDateRange,
	isAnalyticsRangeTooLarge,
	MAX_ANALYTICS_DAYS,
} from "./analytics-date-range";

describe("analytics-date-range", () => {
	test("getInclusiveDateRangeDays counts both endpoints", () => {
		expect(getInclusiveDateRangeDays("2026-04-01", "2026-04-08")).toBe(8);
	});

	test("getInclusiveDateRangeDays falls back for invalid dates", () => {
		expect(getInclusiveDateRangeDays("invalid", "2026-04-08")).toBe(1);
	});

	test("isAnalyticsRangeTooLarge enforces the max supported span", () => {
		expect(isAnalyticsRangeTooLarge(MAX_ANALYTICS_DAYS)).toBe(false);
		expect(isAnalyticsRangeTooLarge(MAX_ANALYTICS_DAYS + 1)).toBe(true);
	});

	test("getSupportedAnalyticsDateRange returns a 365-day inclusive window", () => {
		const endDate = new Date("2026-04-08T00:00:00.000Z");
		const supportedRange = getSupportedAnalyticsDateRange(endDate);

		expect(supportedRange.end.toISOString().slice(0, 10)).toBe("2026-04-08");
		expect(supportedRange.start.toISOString().slice(0, 10)).toBe("2025-04-09");
	});
});
