import { describe, expect, test } from "bun:test";
import { createSessionTurnV2TestOption } from "./session-turn-v2-test-fixtures";
import {
	buildSessionTurnWaterfallLayout,
	formatSessionTurnWaterfallMetricValue,
} from "./session-turn-waterfall";

describe("session turn waterfall", () => {
	test("positions timed turns across a shared horizontal session scale", () => {
		const first = createSessionTurnV2TestOption({
			timing: {
				durationLabel: "10s",
				durationSeconds: 10,
				endTime: "10:00:10",
				endTimestamp: "2026-08-11T10:00:10.000Z",
				startTime: "10:00:00",
				startTimestamp: "2026-08-11T10:00:00.000Z",
			},
		});
		const second = createSessionTurnV2TestOption({
			key: "turn-2",
			timing: {
				durationLabel: "20s",
				durationSeconds: 20,
				endTime: "10:00:35",
				endTimestamp: "2026-08-11T10:00:35.000Z",
				startTime: "10:00:15",
				startTimestamp: "2026-08-11T10:00:15.000Z",
			},
		});

		const layout = buildSessionTurnWaterfallLayout([first, second], "time");

		expect(layout.maximum).toBe(35);
		expect(layout.rows[0]?.offsetRatio).toBe(0);
		expect(layout.rows[1]?.offsetRatio).toBeCloseTo(15 / 35);
		expect(layout.rows[1]?.sizeRatio).toBeCloseTo(20 / 35);
	});

	test("normalizes context and cost without treating missing values as data", () => {
		const first = createSessionTurnV2TestOption();
		const second = createSessionTurnV2TestOption({
			key: "turn-2",
			metrics: {
				...first.metrics,
				estimatedCost: undefined,
				inputTokens: 2_000,
			},
		});

		const context = buildSessionTurnWaterfallLayout([first, second], "context");
		const cost = buildSessionTurnWaterfallLayout([first, second], "cost");

		expect(context.maximum).toBe(2_000);
		expect(context.rows[0]?.sizeRatio).toBe(0.5);
		expect(context.rows[1]?.sizeRatio).toBe(1);
		expect(cost.rows[1]?.estimated).toBe(true);
		expect(formatSessionTurnWaterfallMetricValue(0.1, "cost")).toBe("$0.10");
	});
});
