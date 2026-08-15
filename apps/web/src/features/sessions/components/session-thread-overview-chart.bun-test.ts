import { describe, expect, test } from "bun:test";
import {
	buildSessionThreadOverviewChart,
	buildSessionThreadOverviewCumulativeCostPoints,
	buildSessionThreadOverviewMonotonePath,
	DEFAULT_SESSION_THREAD_OVERVIEW_METRIC,
	getSessionSubagentCountsByTurn,
	getSessionThreadOverviewIndexAtRatio,
	getSessionThreadOverviewMetricMaximum,
	getSessionThreadOverviewMetricRatio,
	getSessionThreadOverviewViewport,
} from "./session-thread-overview-chart";
import { createSessionTurnTestOption } from "./session-turn-test-fixtures";

describe("session thread overview chart", () => {
	test("places turns on the true clock and scales each metric independently", () => {
		const first = {
			...createSessionTurnTestOption({
				metrics: {
					editedFiles: ["src/first.ts"],
					errorCount: 1,
					errorEvents: [],
					estimatedCost: 0.1,
					inputTokens: 1_000,
					outputTokens: 200,
					skills: ["ui"],
					skillEvents: [],
					usageEvents: [],
				},
				timing: {
					durationLabel: "10s",
					durationSeconds: 10,
					endTime: "10:00:10",
					endTimestamp: "2026-08-11T10:00:10.000Z",
					startTime: "10:00:00",
					startTimestamp: "2026-08-11T10:00:00.000Z",
				},
			}),
			reasoningCount: 2,
			subagentCount: 1,
		};
		const second = {
			...createSessionTurnTestOption({
				compactionsBefore: [
					{
						key: "compact-1",
						timestamp: "2026-08-11T10:00:14.000Z",
					},
				],
				key: "turn-2",
				metrics: {
					editedFiles: ["src/second.ts", "src/third.ts"],
					errorCount: 0,
					errorEvents: [],
					estimatedCost: 0.2,
					inputTokens: 2_000,
					outputTokens: 400,
					skills: ["ui", "testing-bun"],
					skillEvents: [],
					usageEvents: [],
				},
				timing: {
					durationLabel: "20s",
					durationSeconds: 20,
					endTime: "10:00:35",
					endTimestamp: "2026-08-11T10:00:35.000Z",
					startTime: "10:00:15",
					startTimestamp: "2026-08-11T10:00:15.000Z",
				},
			}),
			reasoningCount: 1,
			subagentCount: 2,
		};

		const chart = buildSessionThreadOverviewChart([first, second]);

		expect(chart.axisStartTimestamp).toBe(
			Date.parse("2026-08-11T10:00:00.000Z"),
		);
		expect(chart.axisEndTimestamp).toBe(Date.parse("2026-08-11T10:00:35.000Z"));
		expect(chart.rows[0]?.xStartRatio).toBe(0);
		expect(chart.rows[0]?.xEndRatio).toBeCloseTo(10 / 35);
		expect(chart.rows[0]?.xRatio).toBeCloseTo(10 / 35);
		expect(chart.rows[1]?.xStartRatio).toBeCloseTo(15 / 35);
		expect(chart.rows[1]?.xEndRatio).toBe(1);
		expect(chart.rows[1]?.xRatio).toBe(1);
		const firstRow = chart.rows[0];
		expect(firstRow?.cost).toBe(0.1);
		expect(firstRow?.inputTokens).toBe(1_000);
		expect(getSessionThreadOverviewMetricMaximum(chart.rows, "input")).toBe(
			2_000,
		);
		expect(getSessionThreadOverviewMetricMaximum(chart.rows, "cost")).toBe(0.2);
		expect(
			firstRow
				? getSessionThreadOverviewMetricRatio(firstRow, "input", 2_000)
				: undefined,
		).toBeCloseTo(Math.sqrt(0.5));
		expect(
			firstRow
				? getSessionThreadOverviewMetricRatio(firstRow, "cost", 0.2)
				: undefined,
		).toBeCloseTo(Math.sqrt(0.5));
		expect(DEFAULT_SESSION_THREAD_OVERVIEW_METRIC).toBe("cost");
		expect(chart.rows[0]?.reasoningCount).toBe(2);
		expect(chart.rows[1]?.skillCount).toBe(2);
		expect(chart.rows[1]?.editCount).toBe(2);
		expect(chart.rows[1]?.subagentCount).toBe(2);
		expect(chart.totals.inputTokens).toBe(3_000);
		expect(chart.totals.cost).toBeCloseTo(0.3);
		expect(chart.totals.errors).toBe(1);
		expect(chart.totals.reasoning).toBe(3);
		expect(chart.totals.skills).toBe(3);
		expect(chart.totals.edits).toBe(3);
		expect(chart.totals.subagents).toBe(3);

		const costPoints = buildSessionThreadOverviewCumulativeCostPoints(
			chart.rows,
		);
		expect(costPoints[0]?.cumulativeCost).toBeCloseTo(0.1);
		expect(costPoints[1]?.cumulativeCost).toBeCloseTo(0.3);
		expect(getSessionThreadOverviewIndexAtRatio(chart.rows, 0.4)).toBe(0);
		expect(getSessionThreadOverviewIndexAtRatio(chart.rows, 0.9)).toBe(1);
		expect(getSessionThreadOverviewViewport(chart.rows, [1, 0])).toEqual({
			xEndRatio: 1,
			xStartRatio: 0,
		});
	});

	test("keeps missing usage out of totals and distributes untimed turns", () => {
		const option = {
			...createSessionTurnTestOption({
				metrics: {
					editedFiles: [],
					errorCount: 0,
					errorEvents: [],
					estimatedCost: undefined,
					inputTokens: undefined,
					outputTokens: undefined,
					skills: [],
					skillEvents: [],
					usageEvents: [],
				},
				timing: {
					durationLabel: undefined,
					durationSeconds: undefined,
					endTime: "",
					startTime: "",
				},
			}),
			reasoningCount: 0,
			subagentCount: 0,
		};

		const chart = buildSessionThreadOverviewChart([option]);

		expect(chart.rows[0]?.xRatio).toBe(0.5);
		expect(chart.rows[0]?.xStartRatio).toBe(0.5);
		expect(chart.rows[0]?.xEndRatio).toBe(0.5);
		expect(chart.axisStartTimestamp).toBeUndefined();
		expect(chart.axisEndTimestamp).toBeUndefined();
		expect(chart.totals.inputTokens).toBeUndefined();
		expect(chart.totals.cost).toBeUndefined();
		expect(chart.totals.errors).toBe(0);
		expect(chart.totals.reasoning).toBe(0);
		expect(chart.totals.skills).toBe(0);
		expect(chart.totals.edits).toBe(0);
		expect(chart.totals.subagents).toBe(0);
		expect(buildSessionThreadOverviewCumulativeCostPoints(chart.rows)).toEqual([
			{ cumulativeCost: 0, index: 0, xRatio: 0.5 },
		]);
	});

	test("builds a monotone cubic path without overshooting linear cost data", () => {
		const path = buildSessionThreadOverviewMonotonePath([
			{ x: 0, y: 10 },
			{ x: 0.5, y: 5 },
			{ x: 1, y: 0 },
		]);

		expect(path).toBe(
			"M 0 10 C 0.167 8.333 0.333 6.667 0.5 5 C 0.667 3.333 0.833 1.667 1 0",
		);
		expect(
			buildSessionThreadOverviewMonotonePath([
				{ x: 0, y: 10 },
				{ x: 0, y: 8 },
				{ x: 1, y: 0 },
			]),
		).toStartWith("M 0 8 C ");
	});

	test("places long-session ticks on round local times across calendar days", () => {
		const option = {
			...createSessionTurnTestOption({
				timing: {
					durationLabel: "46h",
					durationSeconds: 46 * 60 * 60,
					endTime: "06:13:27",
					endTimestamp: "2026-08-13T06:13:27.000Z",
					startTime: "08:13:27",
					startTimestamp: "2026-08-11T08:13:27.000Z",
				},
			}),
			reasoningCount: 0,
			subagentCount: 0,
		};

		const chart = buildSessionThreadOverviewChart([option]);
		const interiorTicks = chart.ticks.slice(1, -1);

		expect(interiorTicks.length).toBeGreaterThan(2);
		for (const tick of interiorTicks) {
			const date = new Date(tick.timestamp);
			expect(date.getMinutes()).toBe(0);
			expect(date.getSeconds()).toBe(0);
			expect(date.getMilliseconds()).toBe(0);
		}
		expect(
			new Set(chart.ticks.map((tick) => new Date(tick.timestamp).getDate()))
				.size,
		).toBeGreaterThan(1);
	});

	test("attributes each subagent once using its first transcript timestamp", () => {
		const first = createSessionTurnTestOption({
			timing: {
				durationLabel: "30s",
				durationSeconds: 30,
				endTime: "10:00:30",
				endTimestamp: "2026-08-11T10:00:30.000Z",
				startTime: "10:00:00",
				startTimestamp: "2026-08-11T10:00:00.000Z",
			},
		});
		const second = createSessionTurnTestOption({
			key: "turn-2",
			timing: {
				durationLabel: "30s",
				durationSeconds: 30,
				endTime: "10:01:30",
				endTimestamp: "2026-08-11T10:01:30.000Z",
				startTime: "10:01:00",
				startTimestamp: "2026-08-11T10:01:00.000Z",
			},
		});
		const counts = getSessionSubagentCountsByTurn([first, second], {
			"agent-1": [
				JSON.stringify({ timestamp: "2026-08-11T10:00:20.000Z" }),
				JSON.stringify({ timestamp: "2026-08-11T10:01:20.000Z" }),
			].join("\n"),
			"agent-2": JSON.stringify({
				timestamp: "2026-08-11T10:01:10.000Z",
			}),
			"agent-invalid": "not-json",
		});

		expect(counts).toEqual([1, 1]);
	});

	test("compresses hour-long idle gaps into explicit fixed-width breaks", () => {
		const first = {
			...createSessionTurnTestOption({
				timing: {
					durationLabel: "10 min",
					durationSeconds: 600,
					endTime: "10:10:00",
					endTimestamp: "2026-08-11T10:10:00.000Z",
					startTime: "10:00:00",
					startTimestamp: "2026-08-11T10:00:00.000Z",
				},
			}),
			reasoningCount: 1,
			subagentCount: 0,
		};
		const second = {
			...createSessionTurnTestOption({
				key: "turn-2",
				timing: {
					durationLabel: "10 min",
					durationSeconds: 600,
					endTime: "12:20:00",
					endTimestamp: "2026-08-11T12:20:00.000Z",
					startTime: "12:10:00",
					startTimestamp: "2026-08-11T12:10:00.000Z",
				},
			}),
			reasoningCount: 1,
			subagentCount: 0,
		};

		const chart = buildSessionThreadOverviewChart([first, second]);

		// 2h idle − 2×5m protected margins = 1h50m removable → 3×30m = 1.5h
		// removed; the surviving idle time stays visible around the cut.
		expect(chart.breaks).toHaveLength(1);
		expect(chart.breaks[0]?.durationMs).toBe(90 * 60 * 1_000);
		expect(chart.breaks[0]?.idleDurationMs).toBe(2 * 60 * 60 * 1_000);
		expect(chart.breaks[0]?.xStartRatio).toBeCloseTo(0.496);
		expect(chart.breaks[0]?.xEndRatio).toBeCloseTo(0.504);
		expect(chart.rows[0]?.xEndRatio).toBeCloseTo(0.1984);
		expect(chart.rows[1]?.xStartRatio).toBeCloseTo(0.8016);

		const chartWithBackgroundSubagent = buildSessionThreadOverviewChart(
			[first, second],
			[
				{
					endTimestamp: Date.parse("2026-08-11T12:00:00.000Z"),
					key: "background-agent",
					startTimestamp: Date.parse("2026-08-11T10:20:00.000Z"),
				},
			],
		);
		expect(chartWithBackgroundSubagent.breaks).toEqual([]);
	});

	test("removes complete idle hours and preserves the remaining time", () => {
		const first = {
			...createSessionTurnTestOption({
				timing: {
					durationLabel: "10 min",
					durationSeconds: 600,
					endTime: "10:10:00",
					endTimestamp: "2026-08-11T10:10:00.000Z",
					startTime: "10:00:00",
					startTimestamp: "2026-08-11T10:00:00.000Z",
				},
			}),
			reasoningCount: 0,
			subagentCount: 0,
		};
		const second = {
			...createSessionTurnTestOption({
				key: "turn-2",
				timing: {
					durationLabel: "10 min",
					durationSeconds: 600,
					endTime: "12:50:00",
					endTimestamp: "2026-08-11T12:50:00.000Z",
					startTime: "12:40:00",
					startTimestamp: "2026-08-11T12:40:00.000Z",
				},
			}),
			reasoningCount: 0,
			subagentCount: 0,
		};

		const chart = buildSessionThreadOverviewChart([first, second]);
		const cutoff = chart.breaks[0];

		// 2.5h idle − 2×5m margins = 2h20m removable → 4×30m = 2h removed,
		// leaving 15 minutes of real idle visible on each side of the cut.
		expect(cutoff?.idleDurationMs).toBe(150 * 60 * 1_000);
		expect(cutoff?.durationMs).toBe(2 * 60 * 60 * 1_000);
		expect(cutoff?.startTimestamp).toBe(Date.parse("2026-08-11T10:25:00.000Z"));
		expect(cutoff?.endTimestamp).toBe(Date.parse("2026-08-11T12:25:00.000Z"));
		expect(cutoff?.xStartRatio).toBeCloseTo(0.496);
		expect(cutoff?.xEndRatio).toBeCloseTo(0.504);
		expect(chart.rows[0]?.xEndRatio).toBeCloseTo(0.1984);
		expect(chart.rows[1]?.xStartRatio).toBeCloseTo(0.8016);
	});

	test("gives every removed-hour cutoff the same compact width", () => {
		const first = {
			...createSessionTurnTestOption({
				timing: {
					durationLabel: "10 min",
					durationSeconds: 600,
					endTime: "10:10:00",
					endTimestamp: "2026-08-11T10:10:00.000Z",
					startTime: "10:00:00",
					startTimestamp: "2026-08-11T10:00:00.000Z",
				},
			}),
			reasoningCount: 0,
			subagentCount: 0,
		};
		const second = {
			...createSessionTurnTestOption({
				key: "turn-2",
				timing: {
					durationLabel: "10 min",
					durationSeconds: 600,
					endTime: "12:20:00",
					endTimestamp: "2026-08-11T12:20:00.000Z",
					startTime: "12:10:00",
					startTimestamp: "2026-08-11T12:10:00.000Z",
				},
			}),
			reasoningCount: 0,
			subagentCount: 0,
		};
		const third = {
			...createSessionTurnTestOption({
				key: "turn-3",
				timing: {
					durationLabel: "10 min",
					durationSeconds: 600,
					endTime: "16:30:00",
					endTimestamp: "2026-08-11T16:30:00.000Z",
					startTime: "16:20:00",
					startTimestamp: "2026-08-11T16:20:00.000Z",
				},
			}),
			reasoningCount: 0,
			subagentCount: 0,
		};

		const chart = buildSessionThreadOverviewChart([first, second, third]);
		const firstCutoffWidth =
			(chart.breaks[0]?.xEndRatio ?? 0) - (chart.breaks[0]?.xStartRatio ?? 0);
		const secondCutoffWidth =
			(chart.breaks[1]?.xEndRatio ?? 0) - (chart.breaks[1]?.xStartRatio ?? 0);

		expect(chart.breaks).toHaveLength(2);
		expect(firstCutoffWidth).toBeCloseTo(0.008);
		expect(secondCutoffWidth).toBeCloseTo(0.008);
		expect(secondCutoffWidth).toBeCloseTo(firstCutoffWidth);
	});
});
