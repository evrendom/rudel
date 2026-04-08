import { describe, expect, test } from "bun:test";
import {
	formatDashboardDateRangeTriggerLabel,
	getAnalyticsDatePresets,
	parseIsoDateOnly,
	resolveMatchingAnalyticsPreset,
} from "./date-presets";

describe("date-presets", () => {
	test("parseIsoDateOnly accepts valid ISO calendar dates", () => {
		const parsedDate = parseIsoDateOnly("2026-04-08");

		expect(parsedDate).not.toBeNull();
		expect(parsedDate?.getFullYear()).toBe(2026);
		expect(parsedDate?.getMonth()).toBe(3);
		expect(parsedDate?.getDate()).toBe(8);
	});

	test("parseIsoDateOnly rejects impossible calendar dates", () => {
		expect(parseIsoDateOnly("2026-02-31")).toBeNull();
		expect(parseIsoDateOnly("2026/04/08")).toBeNull();
	});

	test("resolveMatchingAnalyticsPreset finds the preset for a resolved range", () => {
		const today = new Date("2026-04-08T12:00:00.000Z");
		const preset = getAnalyticsDatePresets().find(
			(candidate) => candidate.id === "this-year",
		);

		expect(preset).toBeDefined();

		if (!preset) {
			throw new Error("Expected the this-year preset to exist");
		}

		const resolvedRange = preset.resolveRange(today);
		const matchingPreset = resolveMatchingAnalyticsPreset(
			resolvedRange.startDate,
			resolvedRange.endDate,
			today,
		);

		expect(matchingPreset?.id).toBe("this-year");
	});

	test("formatDashboardDateRangeTriggerLabel formats the selected range", () => {
		expect(
			formatDashboardDateRangeTriggerLabel("2026-04-01", "2026-04-08"),
		).toBe("Apr 1 - Apr 8, 2026");
	});
});
