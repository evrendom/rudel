import { describe, expect, test } from "bun:test";
import type { SessionThreadOverviewChartRow } from "./session-thread-overview-chart";
import { DEFAULT_SESSION_THREAD_OVERVIEW_STRIP_CONFIG } from "./session-thread-overview-config";
import {
	buildInputStairsPaths,
	formatElapsedSinceStart,
	formatTimelineMomentWithSeconds,
	getDurationBarGeometry,
	getInputMaximum,
	getInputStairY,
	getOutputMaximum,
	getTurnMarkKinds,
} from "./session-thread-overview-strip-v2-model";

const CONFIG = DEFAULT_SESSION_THREAD_OVERVIEW_STRIP_CONFIG;

function createRow(
	overrides: Partial<SessionThreadOverviewChartRow>,
): SessionThreadOverviewChartRow {
	return {
		cost: undefined,
		editCount: 0,
		errorCount: 0,
		index: 0,
		inputTokens: undefined,
		outputTokens: undefined,
		reasoningCount: 0,
		skillCount: 0,
		subagentCount: 0,
		xEndRatio: 0,
		xRatio: 0,
		xStartRatio: 0,
		...overrides,
	};
}

describe("maxima", () => {
	test("output and input maxima ignore undefined values", () => {
		const rows = [
			createRow({ index: 0, inputTokens: 100, outputTokens: undefined }),
			createRow({ index: 1, inputTokens: undefined, outputTokens: 40 }),
			createRow({ index: 2, inputTokens: 900, outputTokens: 10 }),
		];
		expect(getOutputMaximum(rows)).toBe(40);
		expect(getInputMaximum(rows)).toBe(900);
	});
});

describe("getDurationBarGeometry", () => {
	test("bar width equals the projected duration on the timescale", () => {
		const row = createRow({ xEndRatio: 0.3, xStartRatio: 0.1 });
		const geometry = getDurationBarGeometry(row, CONFIG);
		const plotWidth = CONFIG.chartWidth - 2 * CONFIG.plotPadding;
		expect(geometry.x).toBeCloseTo(CONFIG.plotPadding + 0.1 * plotWidth, 5);
		expect(geometry.width).toBeCloseTo(0.2 * plotWidth, 5);
	});

	test("zero-duration turns keep a minimum visible width", () => {
		const row = createRow({ xEndRatio: 0.5, xStartRatio: 0.5 });
		expect(getDurationBarGeometry(row, CONFIG).width).toBe(2);
	});
});

describe("getTurnMarkKinds", () => {
	test("emits one mark per category regardless of counts", () => {
		expect(
			getTurnMarkKinds(
				createRow({ editCount: 4, errorCount: 2, skillCount: 12 }),
			),
		).toEqual(["skill", "error", "edit"]);
		expect(getTurnMarkKinds(createRow({}))).toEqual([]);
		expect(getTurnMarkKinds(createRow({ errorCount: 1 }))).toEqual(["error"]);
	});
});

describe("scrub time formatting", () => {
	test("formatElapsedSinceStart scales from seconds to days", () => {
		expect(formatElapsedSinceStart(45 * 1_000)).toBe("+45s");
		expect(formatElapsedSinceStart(90 * 1_000)).toBe("+1m");
		expect(formatElapsedSinceStart((2 * 60 + 13) * 60 * 1_000)).toBe("+2h 13m");
		expect(formatElapsedSinceStart(26 * 60 * 60 * 1_000)).toBe("+1d 2h");
		expect(formatElapsedSinceStart(0)).toBe("+0s");
	});

	test("formatTimelineMomentWithSeconds includes seconds precision", () => {
		const label = formatTimelineMomentWithSeconds(
			Date.parse("2026-08-02T14:32:07.000Z"),
		);
		expect(label).toMatch(/\d{2}:\d{2}:\d{2}/);
	});
});

describe("buildInputStairsPaths", () => {
	test("builds horizontal-then-vertical steps, never diagonal segments", () => {
		const rows = [
			createRow({
				index: 0,
				inputTokens: 250,
				xEndRatio: 0.2,
				xStartRatio: 0,
			}),
			createRow({
				index: 1,
				inputTokens: 500,
				xEndRatio: 0.6,
				xStartRatio: 0.4,
			}),
			createRow({
				index: 2,
				inputTokens: 1_000,
				xEndRatio: 1,
				xStartRatio: 0.8,
			}),
		];
		const { areaPath, linePath } = buildInputStairsPaths(rows, 1_000, CONFIG);
		expect(linePath.startsWith("M ")).toBe(true);
		expect(linePath).toContain(" H ");
		expect(linePath).toContain(" V ");
		expect(linePath).not.toContain(" L ");
		expect(linePath).not.toContain(" C ");
		expect(areaPath.endsWith("Z")).toBe(true);
		expect(areaPath).toContain(`V ${CONFIG.axisY}`);
	});

	test("skips rows without input tokens and returns empty for no data", () => {
		expect(buildInputStairsPaths([createRow({})], 100, CONFIG)).toEqual({
			areaPath: "",
			linePath: "",
		});
		const rows = [
			createRow({ index: 0, inputTokens: undefined, xStartRatio: 0 }),
			createRow({
				index: 1,
				inputTokens: 100,
				xEndRatio: 0.7,
				xStartRatio: 0.5,
			}),
		];
		const { linePath } = buildInputStairsPaths(rows, 100, CONFIG);
		const plotWidth = CONFIG.chartWidth - 2 * CONFIG.plotPadding;
		const expectedStartX = CONFIG.plotPadding + 0.5 * plotWidth;
		expect(linePath.startsWith(`M ${expectedStartX}`)).toBe(true);
	});

	test("stair heights scale linearly against the input maximum", () => {
		expect(getInputStairY(0, 1_000, CONFIG)).toBe(CONFIG.axisY);
		expect(getInputStairY(1_000, 1_000, CONFIG)).toBe(
			CONFIG.axisY - CONFIG.maxBarHeight,
		);
		expect(getInputStairY(500, 1_000, CONFIG)).toBe(
			CONFIG.axisY - CONFIG.maxBarHeight / 2,
		);
	});
});
