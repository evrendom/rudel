import { describe, expect, it } from "vitest";
import {
	WRAPPED_ARCHETYPE_CARD_THEMES,
	WRAPPED_PRODUCT_ARCHETYPE_CARD_THEMES,
} from "./archetypes";

describe("wrapped archetype catalog", () => {
	it("keeps the canonical product archetype labels isolated from special editions", () => {
		expect(
			WRAPPED_PRODUCT_ARCHETYPE_CARD_THEMES.map((theme) => theme.displayLabel),
		).toEqual([
			"Roadrunner",
			"Hit and Runner",
			"ADHD Brain",
			"Cheapskate",
			"Company Card",
			"Tourist",
			"Smooth Operator",
			"Obsessed",
			"Maniac",
		]);
	});

	it("uses current product slugs for classifier-backed archetypes", () => {
		expect(
			WRAPPED_PRODUCT_ARCHETYPE_CARD_THEMES.map((theme) => theme.classifierKey),
		).toEqual([
			"roadrunner",
			"hit_and_runner",
			"adhd_brain",
			"cheapskate",
			"company_card",
			"tourist",
			"smooth_operator",
			"obsessed",
			"maniac",
		]);
	});

	it("does not include special-edition card themes in the product archetype set", () => {
		expect(
			WRAPPED_ARCHETYPE_CARD_THEMES.map((theme) => theme.displayLabel),
		).toContain("Decimal");
		expect(
			WRAPPED_PRODUCT_ARCHETYPE_CARD_THEMES.map((theme) => theme.displayLabel),
		).not.toContain("Decimal");
	});
});
