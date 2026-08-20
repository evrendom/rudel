import { describe, expect, test } from "bun:test";
import { getSessionTurnTableScrollbarGeometry } from "./session-turn-table-scrollbar";

describe("session turn table scrollbar geometry", () => {
	test("reserves the header and horizontal scrollbar from the vertical track", () => {
		const geometry = getSessionTurnTableScrollbarGeometry({
			clientHeight: 400,
			clientWidth: 300,
			headerHeight: 44,
			scrollHeight: 4_000,
			scrollTop: 3_600,
			scrollWidth: 600,
		});

		expect(geometry.hasHorizontalOverflow).toBe(true);
		expect(geometry.hasVerticalOverflow).toBe(true);
		expect(geometry.horizontalScrollbarHeight).toBe(8);
		expect(geometry.trackHeight).toBe(348);
		expect(geometry.thumbHeight).toBeCloseTo(34.8);
		expect(geometry.thumbTop + geometry.thumbHeight).toBeCloseTo(348);
	});

	test("enforces the minimum thumb size and hides without overflow", () => {
		const whaleGeometry = getSessionTurnTableScrollbarGeometry({
			clientHeight: 400,
			clientWidth: 300,
			headerHeight: 44,
			scrollHeight: 40_000,
			scrollTop: 0,
			scrollWidth: 300,
		});
		const shortGeometry = getSessionTurnTableScrollbarGeometry({
			clientHeight: 400,
			clientWidth: 300,
			headerHeight: 44,
			scrollHeight: 400,
			scrollTop: 0,
			scrollWidth: 300,
		});

		expect(whaleGeometry.thumbHeight).toBe(24);
		expect(whaleGeometry.thumbTop).toBe(0);
		expect(shortGeometry.hasVerticalOverflow).toBe(false);
		expect(shortGeometry.thumbHeight).toBe(0);
		expect(shortGeometry.thumbTop).toBe(0);
	});
});
