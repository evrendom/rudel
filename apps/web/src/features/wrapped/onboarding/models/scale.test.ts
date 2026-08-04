import { describe, expect, test } from "bun:test";
import { resolveScaleEstimatedSpendUsd } from "./scale";

describe("resolveScaleEstimatedSpendUsd", () => {
	test("preserves unknown and exact-zero event pricing", () => {
		expect(
			resolveScaleEstimatedSpendUsd({
				baseCostTokenBasis: 100,
				baseCostUsd: null,
				totalTokens: 200,
			}),
		).toBeNull();
		expect(
			resolveScaleEstimatedSpendUsd({
				baseCostTokenBasis: 100,
				baseCostUsd: 0,
				totalTokens: 200,
			}),
		).toBe(0);
	});

	test("scales a known event-priced cost proportionally", () => {
		expect(
			resolveScaleEstimatedSpendUsd({
				baseCostTokenBasis: 100,
				baseCostUsd: 12.5,
				totalTokens: 200,
			}),
		).toBe(25);
	});
});
