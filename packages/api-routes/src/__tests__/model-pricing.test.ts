import { describe, expect, test } from "bun:test";
import {
	buildEstimatedCostSql,
	calculateBaseRateInputTokens,
	calculateEstimatedCost,
} from "../model-pricing.js";

describe("model pricing", () => {
	test("charges OpenAI cached input at the cached rate instead of twice", () => {
		const baseRateInputTokens = calculateBaseRateInputTokens({
			inputTokens: 55_031,
			cacheReadInputTokens: 34_304,
		});

		expect(baseRateInputTokens).toBe(20_727);
		expect(
			calculateEstimatedCost({
				model: "gpt-5.4",
				inputTokens: 55_031,
				outputTokens: 428,
				cacheReadInputTokens: 34_304,
			}),
		).toBe(0.0668);
	});

	test("subtracts cached reads and cache writes before applying the base input rate", () => {
		expect(
			calculateEstimatedCost({
				model: "claude-sonnet-4",
				inputTokens: 1_000_000,
				outputTokens: 250_000,
				cacheReadInputTokens: 400_000,
				cacheCreationInputTokens: 100_000,
			}),
		).toBe(5.745);
	});

	test("never produces negative base-rate input tokens", () => {
		expect(
			calculateBaseRateInputTokens({
				inputTokens: 100,
				cacheReadInputTokens: 80,
				cacheCreationInputTokens: 40,
			}),
		).toBe(0);
	});

	test("builds SQL that prices only uncached input at the full input rate", () => {
		const sql = buildEstimatedCostSql({
			modelExpr: "model_used",
			inputExpr: "ifNull(input_tokens, 0)",
			outputExpr: "ifNull(output_tokens, 0)",
			cacheReadInputExpr: "ifNull(cache_read_input_tokens, 0)",
			cacheCreationInputExpr: "ifNull(cache_creation_input_tokens, 0)",
			precision: 4,
		});

		expect(sql).toContain("greatest");
		expect(sql).toContain(
			"((ifNull(input_tokens, 0)) - (ifNull(cache_read_input_tokens, 0)) - (ifNull(cache_creation_input_tokens, 0)))",
		);
	});
});
