import type { VirtualItem } from "@tanstack/react-virtual";
import { describe, expect, test } from "vitest";
import {
	getTranscriptVirtualViewport,
	getVisibleBlankGap,
} from "./session-transcript-list";

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
			{ item: virtualItem(0, 0, 300), turnIndex: 0 },
			{ item: virtualItem(1, 300, 700), turnIndex: 1 },
			{ item: virtualItem(2, 700, 1_000), turnIndex: 2 },
		];
		expect(
			getTranscriptVirtualViewport({
				clientHeight: 500,
				scrollHeight: 1_000,
				scrollTop: 0,
				turnItems: turnItems.slice(0, 2),
				turnTotal: 3,
			}),
		).toEqual({ activeTurn: 0, visibleRange: [0, 1] });
		expect(
			getTranscriptVirtualViewport({
				clientHeight: 500,
				scrollHeight: 1_000,
				scrollTop: 500,
				turnItems: turnItems.slice(1),
				turnTotal: 3,
			}),
		).toEqual({ activeTurn: 2, visibleRange: [1, 2] });
	});

	test("lets a giant section spanning the focus line own the active turn", () => {
		expect(
			getTranscriptVirtualViewport({
				clientHeight: 600,
				scrollHeight: 2_400,
				scrollTop: 400,
				turnItems: [
					{ item: virtualItem(4, 300, 1_200), turnIndex: 7 },
					{ item: virtualItem(5, 1_200, 1_500), turnIndex: 8 },
				],
				turnTotal: 10,
			}),
		).toEqual({ activeTurn: 7, visibleRange: [7, 8] });
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
