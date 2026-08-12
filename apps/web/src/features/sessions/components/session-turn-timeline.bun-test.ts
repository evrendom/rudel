import { describe, expect, test } from "bun:test";
import type { TraceItem } from "@/components/conversation/conversation-trace";
import {
	buildSessionTurnTimelineLayout,
	buildSessionTurnTimelineTicks,
	getSessionTurnTimelineMetricValue,
	getSessionTurnTimelineViewportRange,
} from "./session-turn-timeline";
import { createSessionTurnV2TestOption } from "./session-turn-v2-test-fixtures";

function createTimelineOption({
	inputTokens,
	key,
	outputTokens,
	responseItems,
	toolCallCount,
	userItems,
}: {
	inputTokens: number;
	key: string;
	outputTokens: number;
	responseItems: TraceItem[];
	toolCallCount: number;
	userItems: TraceItem[];
}) {
	const base = createSessionTurnV2TestOption({
		key,
		metrics: {
			editedFiles: [],
			errorCount: 0,
			estimatedCost: 0.1,
			inputTokens,
			outputTokens,
			skills: ["ui"],
			usageEvents: [],
		},
		toolCallCount,
	});

	return {
		...base,
		memberPreview: "Please continue",
		preview: "Done",
		turn: { responseItems, userItems },
	};
}

describe("session turn timeline", () => {
	test("places member, reasoning, skill, and response spans in chronological lanes", () => {
		const option = createTimelineOption({
			inputTokens: 1_000,
			key: "turn-1",
			outputTokens: 200,
			responseItems: [
				{
					events: [
						{
							id: "reasoning",
							kind: "reasoning",
							text: "Thinking",
							timestamp: "2026-08-11T10:00:02.000Z",
						},
						{
							id: "skill",
							input: {},
							kind: "tool",
							result: undefined,
							timestamp: "2026-08-11T10:00:05.000Z",
							toolName: "Skill",
						},
						{
							content: "Done",
							id: "message",
							kind: "message",
							text: "Done",
							timestamp: "2026-08-11T10:00:08.000Z",
						},
					],
					id: "agent",
					kind: "agent",
					timestamp: "2026-08-11T10:00:02.000Z",
				},
			],
			toolCallCount: 1,
			userItems: [
				{
					content: "Please continue",
					id: "member",
					kind: "user",
					timestamp: "2026-08-11T10:00:00.000Z",
				},
			],
		});

		const layout = buildSessionTurnTimelineLayout([option], "tokens");

		expect(layout.blocks.map((block) => block.kind)).toEqual([
			"member",
			"model",
			"reasoning",
			"activity",
			"response",
		]);
		expect(layout.blocks[3]?.label).toBe("Skill · ui");
		expect(layout.blocks[2]?.durationMs).toBe(3_000);
		expect(layout.blocks[0]?.metricValue).toBeUndefined();
		expect(layout.blocks[1]?.metricValue).toBe(1_200);
		expect(layout.contextPoints[0]?.value).toBe(1_000);
	});

	test("normalizes thickness against the largest parent-turn metric", () => {
		const first = createTimelineOption({
			inputTokens: 800,
			key: "turn-1",
			outputTokens: 200,
			responseItems: [
				{
					events: [
						{
							id: "message-1",
							kind: "message",
							content: "First",
							text: "First",
							timestamp: "2026-08-11T10:00:01.000Z",
						},
					],
					id: "agent-1",
					kind: "agent",
					timestamp: "2026-08-11T10:00:01.000Z",
				},
			],
			toolCallCount: 1,
			userItems: [],
		});
		const second = createTimelineOption({
			inputTokens: 1_600,
			key: "turn-2",
			outputTokens: 400,
			responseItems: [
				{
					events: [
						{
							id: "message-2",
							kind: "message",
							content: "Second",
							text: "Second",
							timestamp: "2026-08-11T10:00:03.000Z",
						},
					],
					id: "agent-2",
					kind: "agent",
					timestamp: "2026-08-11T10:00:03.000Z",
				},
			],
			toolCallCount: 2,
			userItems: [],
		});

		const layout = buildSessionTurnTimelineLayout([first, second], "tokens");

		const modelBlocks = layout.blocks.filter((block) => block.kind === "model");
		expect(modelBlocks[0]?.thicknessRatio).toBe(0.5);
		expect(modelBlocks[1]?.thicknessRatio).toBe(1);
		expect(getSessionTurnTimelineMetricValue(second, "tools")).toBe(2);
		const visibleRange = getSessionTurnTimelineViewportRange(
			layout.blocks,
			[1, 1],
		);
		expect(visibleRange?.startRatio).toBe(modelBlocks[1]?.topRatio);
		expect(visibleRange?.endRatio).toBe(
			(modelBlocks[1]?.topRatio ?? 0) + (modelBlocks[1]?.heightRatio ?? 0),
		);
	});

	test("chooses readable clock ticks for the rendered timeline height", () => {
		const startMs = Date.parse("2026-08-11T10:00:00.000Z");
		const ticks = buildSessionTurnTimelineTicks(
			startMs,
			startMs + 10 * 60_000,
			1_200,
		);

		expect(ticks.intervalMs).toBe(30_000);
		expect(ticks.ticks.length).toBe(21);
		expect(ticks.ticks[0]?.offsetRatio).toBe(0);
	});
});
