import { describe, expect, test } from "bun:test";
import {
	buildEventSpans,
	buildMetricShareLayout,
	buildWaterfallLayout,
} from "./session-trace-timeline";

describe("session trace timeline", () => {
	test("compresses long idle gaps while retaining a labeled break", () => {
		const layout = buildWaterfallLayout([
			{
				endTimestamp: "2026-08-11T10:01:00.000Z",
				startTimestamp: "2026-08-11T10:00:00.000Z",
			},
			{
				endTimestamp: "2026-08-11T12:02:00.000Z",
				startTimestamp: "2026-08-11T12:00:00.000Z",
			},
		]);
		expect(layout.breaks).toHaveLength(1);
		expect(layout.breaks[0]?.originalGapMs).toBe(7_140_000);
		expect(layout.totalCompressedMs).toBe(240_000);
	});

	test("builds event spans with tool labels and a message fallback end", () => {
		const spans = buildEventSpans({
			responseItems: [
				{
					events: [
						{
							id: "tool",
							input: {},
							kind: "tool",
							result: undefined,
							timestamp: "2026-08-11T10:00:00.000Z",
							toolName: "Read",
						},
						{
							content: "done",
							id: "message",
							kind: "message",
							text: "done",
							timestamp: "2026-08-11T10:00:10.000Z",
						},
					],
					id: "agent",
					kind: "agent",
					timestamp: "2026-08-11T10:00:00.000Z",
				},
			],
			userItems: [],
		});
		expect(spans[0]?.label).toBe("Read");
		expect(spans[0]?.end - (spans[0]?.start ?? 0)).toBe(10_000);
	});

	test("builds proportional metric shares and returns empty for no total", () => {
		expect(buildMetricShareLayout([1, 3]).map((item) => item.share)).toEqual([
			0.25, 0.75,
		]);
		expect(buildMetricShareLayout([undefined, 0])).toEqual([]);
	});
});
