import { describe, expect, it } from "vitest";
import {
	isWrappedStepVisibleInSaturdayStory,
	WRAPPED_BEAT_CONTRACTS,
	WRAPPED_SATURDAY_STEPS,
} from "./config";

describe("wrapped saturday story visibility", () => {
	it("keeps only the launch-safe beats in the saturday deck", () => {
		expect(WRAPPED_SATURDAY_STEPS.map((step) => step.id)).toEqual([
			"intro",
			"model",
			"scale",
			"pulse",
			"card",
		]);
	});

	it("marks blocked truth-layer beats as hidden for now", () => {
		expect(isWrappedStepVisibleInSaturdayStory("skills")).toBe(false);
		expect(isWrappedStepVisibleInSaturdayStory("tools")).toBe(false);
		expect(isWrappedStepVisibleInSaturdayStory("lock-in")).toBe(false);
		expect(isWrappedStepVisibleInSaturdayStory("quality")).toBe(false);
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
