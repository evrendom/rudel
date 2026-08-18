import type { VirtualItem } from "@tanstack/react-virtual";
import { describe, expect, test } from "vitest";
import {
	getTranscriptVirtualViewport,
	getVisibleBlankGap,
	isTranscriptAnchorCancelKey,
	shouldAnchorTranscriptPrepend,
} from "./session-transcript-list";
import type { SessionTranscriptRow } from "./session-transcript-sections";

function virtualItem(index: number, start: number, end: number): VirtualItem {
	return {
		end,
		index,
		key: `row:${index}`,
		lane: 0,
		size: end - start,
		start,
	};
}

describe("virtual transcript viewport", () => {
	test("preserves the continuous-thread start and end edge semantics", () => {
		const turnItems = [
			{
				item: virtualItem(0, 0, 300),
				speaker: "member" as const,
				turnIndex: 0,
			},
			{
				item: virtualItem(1, 300, 700),
				speaker: "model" as const,
				turnIndex: 1,
			},
			{
				item: virtualItem(2, 700, 1_000),
				speaker: "model" as const,
				turnIndex: 2,
			},
		];
		expect(
			getTranscriptVirtualViewport({
				clientHeight: 500,
				scrollHeight: 1_000,
				scrollTop: 0,
				turnItems: turnItems.slice(0, 2),
				turnTotal: 3,
			}),
		).toEqual({
			activeSelection: { index: 0, speaker: "member" },
			activeTurn: 0,
			viewedSelections: [
				{ index: 0, speaker: "member" },
				{ index: 1, speaker: "model" },
			],
			visibleRange: [0, 1],
		});
		expect(
			getTranscriptVirtualViewport({
				clientHeight: 500,
				scrollHeight: 1_000,
				scrollTop: 500,
				turnItems: turnItems.slice(1),
				turnTotal: 3,
			}),
		).toEqual({
			activeSelection: { index: 2, speaker: "model" },
			activeTurn: 2,
			viewedSelections: [
				{ index: 1, speaker: "model" },
				{ index: 2, speaker: "model" },
			],
			visibleRange: [1, 2],
		});
	});

	test("classifies User and Model rows independently within one turn", () => {
		const turnItems = [
			{
				item: virtualItem(0, 0, 220),
				speaker: "member" as const,
				turnIndex: 0,
			},
			{
				item: virtualItem(1, 220, 620),
				speaker: "model" as const,
				turnIndex: 0,
			},
		];
		expect(
			getTranscriptVirtualViewport({
				clientHeight: 400,
				scrollHeight: 1_000,
				scrollTop: 50,
				turnItems,
				turnTotal: 1,
			}),
		).toMatchObject({
			activeSelection: { index: 0, speaker: "member" },
			viewedSelections: [
				{ index: 0, speaker: "member" },
				{ index: 0, speaker: "model" },
			],
		});
		expect(
			getTranscriptVirtualViewport({
				clientHeight: 400,
				scrollHeight: 1_000,
				scrollTop: 220,
				turnItems,
				turnTotal: 1,
			}),
		).toMatchObject({
			activeSelection: { index: 0, speaker: "model" },
			viewedSelections: [{ index: 0, speaker: "model" }],
		});
	});

	test("lets a giant section spanning the focus line own the active turn", () => {
		expect(
			getTranscriptVirtualViewport({
				clientHeight: 600,
				scrollHeight: 2_400,
				scrollTop: 400,
				turnItems: [
					{
						item: virtualItem(4, 300, 1_200),
						speaker: "model",
						turnIndex: 7,
					},
					{
						item: virtualItem(5, 1_200, 1_500),
						speaker: "member",
						turnIndex: 8,
					},
				],
				turnTotal: 10,
			}),
		).toEqual({
			activeSelection: { index: 7, speaker: "model" },
			activeTurn: 7,
			viewedSelections: [{ index: 7, speaker: "model" }],
			visibleRange: [7, 8],
		});
	});
});

describe("virtual transcript blank-frame detector", () => {
	test("reports no gap for contiguous measured rows", () => {
		expect(
			getVisibleBlankGap(
				[virtualItem(3, 90, 180), virtualItem(4, 180, 330)],
				100,
				300,
			),
		).toBe(0);
	});

	test("reports the largest uncovered viewport segment", () => {
		expect(
			getVisibleBlankGap(
				[virtualItem(3, 90, 160), virtualItem(4, 190, 240)],
				100,
				300,
			),
		).toBe(60);
	});
});

describe("virtual transcript scroll ownership", () => {
	test("cancels anchor mode for every navigation key in the contract", () => {
		for (const key of [
			"ArrowDown",
			"ArrowUp",
			"End",
			"Home",
			"PageDown",
			"PageUp",
		]) {
			expect(isTranscriptAnchorCancelKey(key)).toBe(true);
		}
		expect(isTranscriptAnchorCancelKey("Enter")).toBe(false);
	});

	test("enables keyed anchoring only when existing turn rows shift after a prepend", () => {
		const row = (turnId: string): SessionTranscriptRow => ({
			id: `${turnId}:no-response`,
			kind: "no-response",
			turnId,
		});
		const olderEdge: SessionTranscriptRow = {
			direction: "older",
			id: "window-edge:older",
			kind: "window-edge",
			state: "idle",
		};
		const previous = [olderEdge, row("turn-1"), row("turn-2")];

		expect(
			shouldAnchorTranscriptPrepend(previous, [
				olderEdge,
				row("turn-0"),
				...previous.slice(1),
			]),
		).toBe(true);
		expect(
			shouldAnchorTranscriptPrepend(previous, [
				olderEdge,
				row("turn-1"),
				row("turn-1-detail"),
				row("turn-2"),
			]),
		).toBe(false);
		expect(
			shouldAnchorTranscriptPrepend(previous, [olderEdge, row("turn-2")]),
		).toBe(false);
	});
});
