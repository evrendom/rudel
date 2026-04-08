import { describe, expect, test } from "bun:test";
import {
	calculateEstimatedCost,
	ESTIMATED_PRICING_MODE,
	getModelPricingCatalog,
	resolveModelPricing,
} from "../model-pricing.js";

describe("model pricing catalog", () => {
	test("exports a model-specific pricing mode and non-empty catalog", () => {
		expect(ESTIMATED_PRICING_MODE).toBe("estimated_model_pricing_v1");
		expect(getModelPricingCatalog().length).toBeGreaterThan(0);
	});

	test("matches current codex models", () => {
		const pricing = resolveModelPricing("gpt-5.3-codex");
		expect(pricing?.key).toBe("openai-gpt-5.3-codex");
		expect(pricing?.inputPerMillion).toBe(1.75);
		expect(pricing?.outputPerMillion).toBe(14);
	});

	test("matches dated claude snapshot aliases", () => {
		const pricing = resolveModelPricing("claude-3-7-sonnet-20250219");
		expect(pricing?.key).toBe("anthropic-claude-sonnet-3-7");
		expect(pricing?.cachedInputPerMillion).toBe(0.3);
	});

	test("includes cached token pricing in cost estimates", () => {
		const cost = calculateEstimatedCost({
			model: "claude-sonnet-4-6",
			inputTokens: 1_000_000,
			outputTokens: 1_000_000,
			cacheReadInputTokens: 1_000_000,
			cacheCreationInputTokens: 1_000_000,
			precision: 2,
		});

		expect(cost).toBe(22.05);
	});
});
