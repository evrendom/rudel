import type { VirtualItem } from "@tanstack/react-virtual";
import { describe, expect, test } from "vitest";
import {
	getTranscriptAnchorRowIndex,
	getTranscriptVirtualViewport,
	getVisibleBlankGap,
	isTranscriptAnchorCancelKey,
	shouldAnchorTranscriptPrepend,
	startTranscriptAnchorPin,
} from "./session-transcript-list";
import type {
	SessionTranscriptRow,
	SessionTranscriptRowModel,
} from "./session-transcript-sections";

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

describe("virtual transcript row anchors", () => {
	test("targets the selected speaker within a turn", () => {
		const rows: SessionTranscriptRow[] = [
			{
				id: "turn-1:member",
				items: [],
				kind: "member",
				startsTrace: true,
				turnId: "turn-1",
			},
			{ id: "turn-1:no-response", kind: "no-response", turnId: "turn-1" },
		];
		const model: SessionTranscriptRowModel = {
			rowIndex: new Map(rows.map((row, index) => [row.id, index])),
			rows,
			rowTurnIndex: new Map(rows.map((row) => [row.id, 0])),
			turnFirstRowIndex: new Map([["turn-1", 0]]),
		};

		expect(getTranscriptAnchorRowIndex(model, "turn-1", "member")).toBe(0);
		expect(getTranscriptAnchorRowIndex(model, "turn-1", "model")).toBe(1);
	});

	test("falls back to the pending turn row for either speaker", () => {
		const rows: SessionTranscriptRow[] = [
			{
				estimatedHeight: 420,
				id: "turn-1:pending",
				kind: "turn-pending",
				option: {} as never,
				turnId: "turn-1",
			},
		];
		const model: SessionTranscriptRowModel = {
			rowIndex: new Map([["turn-1:pending", 0]]),
			rows,
			rowTurnIndex: new Map([["turn-1:pending", 0]]),
			turnFirstRowIndex: new Map([["turn-1", 0]]),
		};

		expect(getTranscriptAnchorRowIndex(model, "turn-1", "member")).toBe(0);
		expect(getTranscriptAnchorRowIndex(model, "turn-1", "model")).toBe(0);
	});
});

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
	test("pins the anchor again when a measurement shifts its start", async () => {
		let anchorStart = 300;
		let now = 0;
		const frames: FrameRequestCallback[] = [];
		const writes: number[] = [];
		const scrollElement = {
			clientHeight: 200,
			scrollHeight: 1_200,
			scrollTop: 0,
		};
		const pin = startTranscriptAnchorPin({
			getAnchorStart: () => anchorStart,
			getScrollElement: () => scrollElement,
			isActive: () => true,
			now: () => now,
			onWrite: (target) => writes.push(target),
			requestFrame: (callback) => frames.push(callback),
		});
		const runFrame = () => {
			const frame = frames.shift();
			if (!frame) {
				throw new Error("Expected an anchor-settle frame");
			}
			now += 16;
			frame(now);
		};

		runFrame();
		anchorStart = 420;
		pin.enforce();
		runFrame();
		runFrame();

		await expect(pin.settled).resolves.toBe(true);
		expect(writes).toEqual([300, 420]);
		expect(scrollElement.scrollTop).toBe(420);
	});

	test("keeps correcting anchor drift after the settle promise resolves", async () => {
		let anchorStart = 300;
		let now = 0;
		const frames: FrameRequestCallback[] = [];
		const settlements: Array<{
			elapsedMs: number;
			settled: boolean;
			starvedMs: number;
			via: "stable-frames" | "timeout";
		}> = [];
		const writes: number[] = [];
		const scrollElement = {
			clientHeight: 200,
			scrollHeight: 3_000,
			scrollTop: anchorStart,
		};
		const pin = startTranscriptAnchorPin({
			getAnchorStart: () => anchorStart,
			getScrollElement: () => scrollElement,
			isActive: () => true,
			now: () => now,
			onSettle: (result) => settlements.push(result),
			onWrite: (target) => writes.push(target),
			requestFrame: (callback) => frames.push(callback),
		});
		const runFrame = () => {
			const frame = frames.shift();
			if (!frame) {
				throw new Error("Expected an anchor-settle frame");
			}
			now += 16;
			frame(now);
		};

		runFrame();
		runFrame();
		await expect(pin.settled).resolves.toBe(true);

		anchorStart += 1_300;
		pin.enforce();

		expect(writes).toEqual([1_600]);
		expect(scrollElement.scrollTop).toBe(1_600);
		expect(settlements).toEqual([
			{ elapsedMs: 32, settled: true, starvedMs: 0, via: "stable-frames" },
		]);
	});

	test("stops correcting after the user takes over post-settle", async () => {
		let active = true;
		let anchorStart = 300;
		let now = 0;
		let deactivationCount = 0;
		const frames: FrameRequestCallback[] = [];
		const writes: number[] = [];
		const scrollElement = {
			clientHeight: 200,
			scrollHeight: 1_200,
			scrollTop: anchorStart,
		};
		const pin = startTranscriptAnchorPin({
			getAnchorStart: () => anchorStart,
			getScrollElement: () => scrollElement,
			isActive: () => active,
			now: () => now,
			onDeactivate: () => {
				deactivationCount += 1;
			},
			onWrite: (target) => writes.push(target),
			requestFrame: (callback) => frames.push(callback),
		});
		const runFrame = () => {
			const frame = frames.shift();
			if (!frame) {
				throw new Error("Expected an anchor-settle frame");
			}
			now += 16;
			frame(now);
		};

		runFrame();
		runFrame();
		await expect(pin.settled).resolves.toBe(true);

		active = false;
		anchorStart = 450;
		pin.enforce();
		pin.enforce();

		expect(deactivationCount).toBe(1);
		expect(writes).toEqual([]);
		expect(scrollElement.scrollTop).toBe(300);
	});

	test("resolves false when user takeover cancels before settle", async () => {
		let active = true;
		const frames: FrameRequestCallback[] = [];
		const scrollElement = {
			clientHeight: 200,
			scrollHeight: 1_200,
			scrollTop: 0,
		};
		const pin = startTranscriptAnchorPin({
			getAnchorStart: () => 300,
			getScrollElement: () => scrollElement,
			isActive: () => active,
			onWrite: () => {},
			requestFrame: (callback) => frames.push(callback),
		});

		active = false;
		const frame = frames.shift();
		if (!frame) {
			throw new Error("Expected an anchor-settle frame");
		}
		frame(16);

		await expect(pin.settled).resolves.toBe(false);
		expect(pin.enforce()).toBe(false);
	});

	test("reports timeout settling when the anchor never stabilizes", async () => {
		let now = 0;
		const frames: FrameRequestCallback[] = [];
		const settlements: Array<{
			elapsedMs: number;
			settled: boolean;
			starvedMs: number;
			via: "stable-frames" | "timeout";
		}> = [];
		const pin = startTranscriptAnchorPin({
			getAnchorStart: () => undefined,
			getScrollElement: () => null,
			isActive: () => true,
			now: () => now,
			onSettle: (result) => settlements.push(result),
			onWrite: () => {},
			requestFrame: (callback) => frames.push(callback),
		});

		const frame = frames.shift();
		if (!frame) {
			throw new Error("Expected an anchor-settle frame");
		}
		now = 700;
		frame(now);

		await expect(pin.settled).resolves.toBe(true);
		expect(settlements).toEqual([
			{ elapsedMs: 700, settled: true, starvedMs: 0, via: "timeout" },
		]);
	});

	test("reports main-thread starvation beyond the anchor timeout budget", async () => {
		let now = 0;
		const frames: FrameRequestCallback[] = [];
		const settlements: Array<{
			elapsedMs: number;
			settled: boolean;
			starvedMs: number;
			via: "stable-frames" | "timeout";
		}> = [];
		const pin = startTranscriptAnchorPin({
			getAnchorStart: () => undefined,
			getScrollElement: () => null,
			isActive: () => true,
			now: () => now,
			onSettle: (result) => settlements.push(result),
			onWrite: () => {},
			requestFrame: (callback) => frames.push(callback),
		});

		const frame = frames.shift();
		if (!frame) {
			throw new Error("Expected an anchor-settle frame");
		}
		now = 3_374;
		frame(now);

		await expect(pin.settled).resolves.toBe(true);
		expect(settlements).toEqual([
			{
				elapsedMs: 3_374,
				settled: true,
				starvedMs: 2_674,
				via: "timeout",
			},
		]);
	});

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
