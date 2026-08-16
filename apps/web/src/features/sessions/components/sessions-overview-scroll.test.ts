import { describe, expect, test } from "vitest";
import { getContainedWheelScroll } from "./sessions-overview-scroll";

const baseScrollState = {
	clientHeight: 400,
	clientWidth: 800,
	deltaMode: 0,
	scrollHeight: 1200,
	scrollLeft: 200,
	scrollTop: 300,
	scrollWidth: 1600,
};

describe("getContainedWheelScroll", () => {
	test("leaves wheel movement inside both scroll ranges native", () => {
		expect(
			getContainedWheelScroll({
				...baseScrollState,
				deltaX: 40,
				deltaY: 60,
			}),
		).toEqual({ left: 240, shouldContain: false, top: 360 });
	});

	test("clamps an exceeded axis while preserving valid diagonal movement", () => {
		expect(
			getContainedWheelScroll({
				...baseScrollState,
				deltaX: 80,
				deltaY: 120,
				scrollTop: 760,
			}),
		).toEqual({ left: 280, shouldContain: true, top: 800 });
	});

	test("recovers from browser rubber-band positions", () => {
		expect(
			getContainedWheelScroll({
				...baseScrollState,
				deltaX: -20,
				deltaY: -20,
				scrollLeft: -12,
				scrollTop: -8,
			}),
		).toEqual({ left: 0, shouldContain: true, top: 0 });
	});

	test("normalizes line-based wheel deltas", () => {
		expect(
			getContainedWheelScroll({
				...baseScrollState,
				deltaMode: 1,
				deltaX: 1,
				deltaY: 2,
			}),
		).toEqual({ left: 216, shouldContain: false, top: 332 });
	});
});
