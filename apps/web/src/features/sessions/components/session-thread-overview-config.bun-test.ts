import { describe, expect, test } from "bun:test";
import type { SessionThreadOverviewChartRow } from "./session-thread-overview-chart";
import {
	getSessionThreadOverviewMetricMedian,
	getSessionThreadOverviewMetricRatio,
} from "./session-thread-overview-chart";
import {
	DEFAULT_SESSION_THREAD_OVERVIEW_STRIP_CONFIG,
	getSessionThreadOverviewTimelineSettings,
	resolveSessionThreadOverviewStripConfig,
} from "./session-thread-overview-config";
import { buildSessionThreadOverviewTimelineScale } from "./session-thread-overview-timeline";

function createRow(
	overrides: Partial<SessionThreadOverviewChartRow>,
): SessionThreadOverviewChartRow {
	return {
		cost: undefined,
		editCount: 0,
		errorCount: 0,
		index: 0,
		inputTokens: undefined,
		reasoningCount: 0,
		skillCount: 0,
		subagentCount: 0,
		xEndRatio: 0,
		xRatio: 0,
		xStartRatio: 0,
		...overrides,
	};
}

const BURSTY_INTERVALS = [
	{
		endTimestamp: Date.parse("2026-08-02T10:10:00.000Z"),
		key: "a",
		startTimestamp: Date.parse("2026-08-02T10:00:00.000Z"),
	},
	{
		endTimestamp: Date.parse("2026-08-02T11:50:00.000Z"),
		key: "b",
		startTimestamp: Date.parse("2026-08-02T11:40:00.000Z"),
	},
];

describe("resolveSessionThreadOverviewStripConfig", () => {
	test("returns the default config identity when no overrides are given", () => {
		expect(resolveSessionThreadOverviewStripConfig(undefined)).toBe(
			DEFAULT_SESSION_THREAD_OVERVIEW_STRIP_CONFIG,
		);
	});

	test("merges overrides over defaults without mutating the default", () => {
		const resolved = resolveSessionThreadOverviewStripConfig({ axisY: 60 });
		expect(resolved.axisY).toBe(60);
		expect(resolved.maxBarHeight).toBe(40);
		expect(DEFAULT_SESSION_THREAD_OVERVIEW_STRIP_CONFIG.axisY).toBe(50);
	});
});

describe("timeline settings threading", () => {
	test("scale built with explicit default settings matches the no-settings scale", () => {
		const implicit = buildSessionThreadOverviewTimelineScale(BURSTY_INTERVALS);
		const explicit = buildSessionThreadOverviewTimelineScale(
			BURSTY_INTERVALS,
			getSessionThreadOverviewTimelineSettings(
				DEFAULT_SESSION_THREAD_OVERVIEW_STRIP_CONFIG,
			),
		);
		expect(explicit.breaks).toEqual(implicit.breaks);
		expect(explicit.ticks).toEqual(implicit.ticks);
		expect(explicit.axisStartTimestamp).toBe(implicit.axisStartTimestamp);
		expect(explicit.axisEndTimestamp).toBe(implicit.axisEndTimestamp);
	});

	test("cuts 30 minute multiples while 5 minute side margins survive", () => {
		const buildGapIntervals = (gapMinutes: number) => [
			{
				endTimestamp: Date.parse("2026-08-02T10:10:00.000Z"),
				key: "a",
				startTimestamp: Date.parse("2026-08-02T10:00:00.000Z"),
			},
			{
				endTimestamp:
					Date.parse("2026-08-02T10:10:00.000Z") +
					(gapMinutes + 10) * 60 * 1_000,
				key: "b",
				startTimestamp:
					Date.parse("2026-08-02T10:10:00.000Z") + gapMinutes * 60 * 1_000,
			},
		];

		// 40m idle − 2×5m margins = 30m removable → one 30m cut.
		const fortyMinuteScale = buildSessionThreadOverviewTimelineScale(
			buildGapIntervals(40),
		);
		expect(fortyMinuteScale.breaks).toHaveLength(1);
		expect(fortyMinuteScale.breaks[0]?.durationMs).toBe(30 * 60 * 1_000);

		// 35m idle − 2×5m margins = 25m removable → below the 30m step → no cut.
		const thirtyFiveMinuteScale = buildSessionThreadOverviewTimelineScale(
			buildGapIntervals(35),
		);
		expect(thirtyFiveMinuteScale.breaks).toHaveLength(0);

		// 90m idle − 2×5m margins = 80m removable → 2×30m removed (the bursty
		// fixture's gap behaves identically by default).
		const defaultScale =
			buildSessionThreadOverviewTimelineScale(BURSTY_INTERVALS);
		expect(defaultScale.breaks).toHaveLength(1);
		expect(defaultScale.breaks[0]?.durationMs).toBe(60 * 60 * 1_000);

		// Wider margins can veto the cut entirely.
		const wideMarginScale = buildSessionThreadOverviewTimelineScale(
			BURSTY_INTERVALS,
			{
				...getSessionThreadOverviewTimelineSettings(
					DEFAULT_SESSION_THREAD_OVERVIEW_STRIP_CONFIG,
				),
				breakMarginMinutes: 45,
			},
		);
		expect(wideMarginScale.breaks).toHaveLength(0);
	});

	test("unprojectRatio inverts projectTimestamp on active and removed segments", () => {
		const scale = buildSessionThreadOverviewTimelineScale(BURSTY_INTERVALS);
		const activeTimestamp = Date.parse("2026-08-02T10:05:00.000Z");
		const projected = scale.projectTimestamp(activeTimestamp);
		expect(projected).toBeDefined();
		if (projected === undefined) {
			throw new Error("projection failed for an active timestamp");
		}
		const roundTripped = scale.unprojectRatio(projected);
		expect(roundTripped).toBeDefined();
		expect(Math.abs((roundTripped ?? 0) - activeTimestamp)).toBeLessThan(1_000);

		const cutoff = scale.breaks[0];
		expect(cutoff).toBeDefined();
		if (!cutoff) {
			throw new Error("expected a break in the bursty fixture");
		}
		const midBreakTimestamp = scale.unprojectRatio(
			(cutoff.xStartRatio + cutoff.xEndRatio) / 2,
		);
		expect(midBreakTimestamp).toBeDefined();
		expect(midBreakTimestamp ?? 0).toBeGreaterThan(cutoff.startTimestamp);
		expect(midBreakTimestamp ?? 0).toBeLessThan(cutoff.endTimestamp);
	});

	test("a 4 hour gap is cut down to the margins, removing whole threshold multiples", () => {
		const intervals = [
			BURSTY_INTERVALS[0],
			{
				endTimestamp: Date.parse("2026-08-02T14:20:00.000Z"),
				key: "late",
				startTimestamp: Date.parse("2026-08-02T14:10:00.000Z"),
			},
		].filter((interval) => interval !== undefined);
		const scale = buildSessionThreadOverviewTimelineScale(intervals);
		expect(scale.breaks).toHaveLength(1);
		// 4h idle − 2×5m margins = 3h50m removable → 7×30m = 3.5h removed.
		expect(scale.breaks[0]?.durationMs).toBe(3.5 * 60 * 60 * 1_000);
	});
});

describe("getSessionThreadOverviewMetricRatio scale modes", () => {
	test("sqrt is the default and linear returns the raw proportion", () => {
		const row = createRow({ cost: 0.25 });
		expect(getSessionThreadOverviewMetricRatio(row, "cost", 1)).toBe(0.5);
		expect(getSessionThreadOverviewMetricRatio(row, "cost", 1, "sqrt")).toBe(
			0.5,
		);
		expect(getSessionThreadOverviewMetricRatio(row, "cost", 1, "linear")).toBe(
			0.25,
		);
	});
});

describe("getSessionThreadOverviewMetricMedian", () => {
	test("returns the middle value for odd counts, ignoring undefined", () => {
		const rows = [
			createRow({ cost: 1, index: 0 }),
			createRow({ cost: undefined, index: 1 }),
			createRow({ cost: 5, index: 2 }),
			createRow({ cost: 3, index: 3 }),
		];
		expect(getSessionThreadOverviewMetricMedian(rows, "cost")).toBe(3);
	});

	test("averages the two middle values for even counts", () => {
		const rows = [
			createRow({ cost: 1, index: 0 }),
			createRow({ cost: 2, index: 1 }),
			createRow({ cost: 4, index: 2 }),
			createRow({ cost: 10, index: 3 }),
		];
		expect(getSessionThreadOverviewMetricMedian(rows, "cost")).toBe(3);
	});

	test("returns undefined when no row has a defined value", () => {
		const rows = [createRow({ index: 0 }), createRow({ index: 1 })];
		expect(getSessionThreadOverviewMetricMedian(rows, "cost")).toBeUndefined();
	});
});
