import { describe, expect, test } from "vitest";
import {
	getActiveContinuousTurnIndex,
	getContinuousTurnViewport,
} from "./session-continuous-turn-focus";

describe("getActiveContinuousTurnIndex", () => {
	test("keeps the first turn focused before the next turn crosses the focus line", () => {
		expect(
			getActiveContinuousTurnIndex({
				focusLine: 160,
				isAtScrollEnd: false,
				isAtScrollStart: false,
				sectionTops: [-240, 220, 880],
			}),
		).toBe(0);
	});

	test("advances to the latest turn that crossed the focus line", () => {
		expect(
			getActiveContinuousTurnIndex({
				focusLine: 160,
				isAtScrollEnd: false,
				isAtScrollStart: false,
				sectionTops: [-700, -40, 410],
			}),
		).toBe(1);
	});

	test("focuses the final turn at the bottom of the thread", () => {
		expect(
			getActiveContinuousTurnIndex({
				focusLine: 160,
				isAtScrollEnd: true,
				isAtScrollStart: false,
				sectionTops: [-1200, -500, 260],
			}),
		).toBe(2);
	});

	test("keeps the first turn focused at the top of a short preamble", () => {
		expect(
			getActiveContinuousTurnIndex({
				focusLine: 160,
				isAtScrollEnd: false,
				isAtScrollStart: true,
				sectionTops: [0, 120, 720],
			}),
		).toBe(0);
	});
});

describe("getContinuousTurnViewport", () => {
	test("returns document indices for a filtered, non-contiguous thread", () => {
		expect(
			getContinuousTurnViewport({
				focusLine: 160,
				isAtScrollEnd: false,
				isAtScrollStart: false,
				sectionIndices: [2, 7, 9],
				sectionTops: [-100, 140, 700],
				viewportBottom: 600,
				viewportTop: 0,
			}),
		).toEqual({
			activeIndex: 7,
			activePosition: 1,
			visibleRange: [2, 7],
		});
	});
});
