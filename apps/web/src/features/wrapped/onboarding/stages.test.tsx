import { describe, expect, it } from "vitest";
import { resolveScaleRainReleaseIntervalMs } from "./stages";

const SCALE_RAIN_BALLS_PER_MILLION = 1_000;

function resolveFlowDurationMs(millionCount: number) {
	const ballCount = millionCount * SCALE_RAIN_BALLS_PER_MILLION;
	return resolveScaleRainReleaseIntervalMs(ballCount) * ballCount;
}

describe("resolveScaleRainReleaseIntervalMs", () => {
	it("halves the added rain time for every million after the first", () => {
		const oneMillionFlowMs = resolveFlowDurationMs(1);
		const twoMillionFlowMs = resolveFlowDurationMs(2);
		const threeMillionFlowMs = resolveFlowDurationMs(3);
		const fourMillionFlowMs = resolveFlowDurationMs(4);

		expect(twoMillionFlowMs - oneMillionFlowMs).toBeCloseTo(3_500);
		expect(threeMillionFlowMs - twoMillionFlowMs).toBeCloseTo(1_750);
		expect(fourMillionFlowMs - threeMillionFlowMs).toBeCloseTo(875);
	});

	it("applies the decayed timing proportionally inside a partial extra million", () => {
		const oneMillionFlowMs = resolveFlowDurationMs(1);
		const oneAndHalfMillionFlowMs = resolveFlowDurationMs(1.5);

		expect(oneAndHalfMillionFlowMs - oneMillionFlowMs).toBeCloseTo(1_750);
	});
});
