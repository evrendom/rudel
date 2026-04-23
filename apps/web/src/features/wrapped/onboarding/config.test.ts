import { describe, expect, it } from "vitest";
import {
	isWrappedStepVisibleInSaturdayStory,
	WRAPPED_BEAT_CONTRACTS,
	WRAPPED_SATURDAY_STEPS,
} from "./config";

describe("wrapped saturday story visibility", () => {
	it("keeps only the launch-safe beats in the saturday deck", () => {
		expect(WRAPPED_SATURDAY_STEPS.map((step) => step.id)).toEqual([
			"skills",
			"tools",
			"model",
			"scale",
			"pulse",
			"card",
		]);
	});

	it("keeps intro, lock-in, and quality out of the shipped story deck", () => {
		expect(isWrappedStepVisibleInSaturdayStory("intro")).toBe(false);
		expect(isWrappedStepVisibleInSaturdayStory("skills")).toBe(true);
		expect(isWrappedStepVisibleInSaturdayStory("tools")).toBe(true);
		expect(isWrappedStepVisibleInSaturdayStory("lock-in")).toBe(false);
		expect(isWrappedStepVisibleInSaturdayStory("quality")).toBe(false);
		expect(WRAPPED_BEAT_CONTRACTS.skills.currentStatus).toBe("ship_now");
		expect(WRAPPED_BEAT_CONTRACTS.tools.currentStatus).toBe("ship_now");
		expect(WRAPPED_BEAT_CONTRACTS.quality.currentStatus).toBe(
			"ship_now_with_softening",
		);
	});

	it("keeps the final card visible even before classifier assignment lands", () => {
		expect(isWrappedStepVisibleInSaturdayStory("card")).toBe(true);
		expect(WRAPPED_BEAT_CONTRACTS.card.currentStatus).toBe(
			"needs_classifier_snapshot",
		);
	});

	it("keeps decimal product-only by leaving the card beat as a theme picker", () => {
		expect(WRAPPED_BEAT_CONTRACTS.card.whatWeShowNow).toContain(
			"Decimal VIP special edition",
		);
		expect(WRAPPED_BEAT_CONTRACTS.card.productNote).toContain("theme picker");
	});
});
