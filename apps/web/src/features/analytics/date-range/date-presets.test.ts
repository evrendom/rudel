import { describe, expect, it } from "vitest";
import { getSupportedAnalyticsDateRange } from "@/lib/analytics-date-range";
import {
	formatDashboardDateRangeTriggerLabel,
	getAnalyticsDatePresets,
	parseIsoDateOnly,
	resolveMatchingAnalyticsPreset,
} from "./date-presets";

describe("date-presets", () => {
	const today = new Date(2026, 3, 8);

	it("resolves the expected preset ranges", () => {
		const presetRanges = Object.fromEntries(
			getAnalyticsDatePresets().map((preset) => [
				preset.id,
				preset.resolveRange(today),
			]),
		);

		expect(presetRanges["last-7-days"]).toEqual({
			startDate: "2026-04-01",
			endDate: "2026-04-08",
		});
		expect(presetRanges["last-30-days"]).toEqual({
			startDate: "2026-03-09",
			endDate: "2026-04-08",
		});
		expect(presetRanges["last-60-days"]).toEqual({
			startDate: "2026-02-07",
			endDate: "2026-04-08",
		});
		expect(presetRanges["last-90-days"]).toEqual({
			startDate: "2026-01-08",
			endDate: "2026-04-08",
		});
		expect(presetRanges["this-week"]).toEqual({
			startDate: "2026-04-06",
			endDate: "2026-04-08",
		});
		expect(presetRanges["this-month"]).toEqual({
			startDate: "2026-04-01",
			endDate: "2026-04-08",
		});
		expect(presetRanges["this-quarter"]).toEqual({
			startDate: "2026-04-01",
			endDate: "2026-04-08",
		});
		expect(presetRanges["this-year"]).toEqual({
			startDate: "2026-01-01",
			endDate: "2026-04-08",
		});
	});

	it("matches a preset from a concrete range", () => {
		expect(
			resolveMatchingAnalyticsPreset("2026-04-01", "2026-04-08", today)?.id,
		).toBe("last-7-days");
	});

	it("returns null for a custom range", () => {
		expect(
			resolveMatchingAnalyticsPreset("2026-02-01", "2026-02-12", today),
		).toBeNull();
	});

	it("keeps presets within the supported analytics window", () => {
		const leapYearEndDate = new Date(2024, 11, 31);
		const supportedStartDate =
			getSupportedAnalyticsDateRange(leapYearEndDate).start;
		const thisYearPreset = getAnalyticsDatePresets().find(
			(preset) => preset.id === "this-year",
		);

		expect(thisYearPreset?.resolveRange(leapYearEndDate).startDate).toBe(
			`${supportedStartDate.getFullYear()}-${String(
				supportedStartDate.getMonth() + 1,
			).padStart(
				2,
				"0",
			)}-${String(supportedStartDate.getDate()).padStart(2, "0")}`,
		);
	});

	it("parses ISO date-only values and rejects invalid dates", () => {
		expect(parseIsoDateOnly("2026-04-08")?.getDate()).toBe(8);
		expect(parseIsoDateOnly("2026-02-31")).toBeNull();
		expect(parseIsoDateOnly("not-a-date")).toBeNull();
	});

	it("formats the dashboard trigger label", () => {
		expect(
			formatDashboardDateRangeTriggerLabel("2026-04-01", "2026-04-08"),
		).toBe("Apr 1 - Apr 8, 2026");
	});
});
