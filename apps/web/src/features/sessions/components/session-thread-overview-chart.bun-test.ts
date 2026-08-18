import { describe, expect, test } from "bun:test";
import {
	buildSessionThreadOverviewChart,
	getSessionThreadOverviewIndexAtRatio,
	getSessionThreadOverviewViewport,
} from "./session-thread-overview-chart";
import { createSessionTurnTestOption } from "./session-turn-test-fixtures";

function createTimedOption({
	endTimestamp,
	key,
	startTimestamp,
}: {
	endTimestamp: string;
	key?: string;
	startTimestamp: string;
}) {
	const durationSeconds =
		(Date.parse(endTimestamp) - Date.parse(startTimestamp)) / 1_000;
	return createSessionTurnTestOption({
		key,
		timing: {
			durationLabel: `${durationSeconds}s`,
			durationSeconds,
			endTime: endTimestamp.slice(11, 19),
			endTimestamp,
			startTime: startTimestamp.slice(11, 19),
			startTimestamp,
		},
	});
}

describe("session thread overview chart", () => {
	test("places turns on the true clock and preserves live row values", () => {
		const first = createSessionTurnTestOption({
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
		});
		const second = createSessionTurnTestOption({
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
		});

		const chart = buildSessionThreadOverviewChart([first, second]);

		expect(chart.axisStartTimestamp).toBe(
			Date.parse("2026-08-11T10:00:00.000Z"),
		);
		expect(chart.axisEndTimestamp).toBe(Date.parse("2026-08-11T10:00:35.000Z"));
		expect(chart.rows).toEqual([
			{
				cost: 0.1,
				index: 0,
				inputTokens: 1_000,
				xEndRatio: expect.closeTo(10 / 35),
				xRatio: expect.closeTo(10 / 35),
				xStartRatio: 0,
			},
			{
				cost: 0.2,
				index: 1,
				inputTokens: 2_000,
				xEndRatio: 1,
				xRatio: 1,
				xStartRatio: expect.closeTo(15 / 35),
			},
		]);
		expect(getSessionThreadOverviewIndexAtRatio(chart.rows, 0.4)).toBe(0);
		expect(getSessionThreadOverviewIndexAtRatio(chart.rows, 0.9)).toBe(1);
		expect(getSessionThreadOverviewViewport(chart.rows, [1, 0])).toEqual({
			xEndRatio: 1,
			xStartRatio: 0,
		});
	});

	test("preserves missing usage and distributes untimed turns", () => {
		const option = createSessionTurnTestOption({
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
		});

		const chart = buildSessionThreadOverviewChart([option]);

		expect(chart.rows[0]).toEqual({
			cost: undefined,
			index: 0,
			inputTokens: undefined,
			xEndRatio: 0.5,
			xRatio: 0.5,
			xStartRatio: 0.5,
		});
		expect(chart.axisStartTimestamp).toBeUndefined();
		expect(chart.axisEndTimestamp).toBeUndefined();
	});

	test("places long-session ticks on round local times across calendar days", () => {
		const chart = buildSessionThreadOverviewChart([
			createTimedOption({
				endTimestamp: "2026-08-13T06:13:27.000Z",
				startTimestamp: "2026-08-11T08:13:27.000Z",
			}),
		]);
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

	test("compresses hour-long idle gaps into explicit fixed-width breaks", () => {
		const chart = buildSessionThreadOverviewChart([
			createTimedOption({
				endTimestamp: "2026-08-11T10:10:00.000Z",
				startTimestamp: "2026-08-11T10:00:00.000Z",
			}),
			createTimedOption({
				endTimestamp: "2026-08-11T12:20:00.000Z",
				key: "turn-2",
				startTimestamp: "2026-08-11T12:10:00.000Z",
			}),
		]);

		expect(chart.breaks).toHaveLength(1);
		expect(chart.breaks[0]?.durationMs).toBe(90 * 60 * 1_000);
		expect(chart.breaks[0]?.idleDurationMs).toBe(2 * 60 * 60 * 1_000);
		expect(chart.breaks[0]?.xStartRatio).toBeCloseTo(0.496);
		expect(chart.breaks[0]?.xEndRatio).toBeCloseTo(0.504);
		expect(chart.rows[0]?.xEndRatio).toBeCloseTo(0.1984);
		expect(chart.rows[1]?.xStartRatio).toBeCloseTo(0.8016);
	});

	test("removes complete idle hours and preserves the remaining time", () => {
		const chart = buildSessionThreadOverviewChart([
			createTimedOption({
				endTimestamp: "2026-08-11T10:10:00.000Z",
				startTimestamp: "2026-08-11T10:00:00.000Z",
			}),
			createTimedOption({
				endTimestamp: "2026-08-11T12:50:00.000Z",
				key: "turn-2",
				startTimestamp: "2026-08-11T12:40:00.000Z",
			}),
		]);
		const cutoff = chart.breaks[0];

		expect(cutoff?.idleDurationMs).toBe(150 * 60 * 1_000);
		expect(cutoff?.durationMs).toBe(2 * 60 * 60 * 1_000);
		expect(cutoff?.startTimestamp).toBe(Date.parse("2026-08-11T10:25:00.000Z"));
		expect(cutoff?.endTimestamp).toBe(Date.parse("2026-08-11T12:25:00.000Z"));
		expect(cutoff?.xStartRatio).toBeCloseTo(0.496);
		expect(cutoff?.xEndRatio).toBeCloseTo(0.504);
	});

	test("gives every removed-hour cutoff the same compact width", () => {
		const chart = buildSessionThreadOverviewChart([
			createTimedOption({
				endTimestamp: "2026-08-11T10:10:00.000Z",
				startTimestamp: "2026-08-11T10:00:00.000Z",
			}),
			createTimedOption({
				endTimestamp: "2026-08-11T12:20:00.000Z",
				key: "turn-2",
				startTimestamp: "2026-08-11T12:10:00.000Z",
			}),
			createTimedOption({
				endTimestamp: "2026-08-11T16:30:00.000Z",
				key: "turn-3",
				startTimestamp: "2026-08-11T16:20:00.000Z",
			}),
		]);
		const firstCutoffWidth =
			(chart.breaks[0]?.xEndRatio ?? 0) - (chart.breaks[0]?.xStartRatio ?? 0);
		const secondCutoffWidth =
			(chart.breaks[1]?.xEndRatio ?? 0) - (chart.breaks[1]?.xStartRatio ?? 0);

		expect(chart.breaks).toHaveLength(2);
		expect(firstCutoffWidth).toBeCloseTo(0.008);
		expect(secondCutoffWidth).toBeCloseTo(firstCutoffWidth);
	});
});
