import type { ModelTokensTrendData } from "@rudel/api-routes";
import { describe, expect, it } from "vitest";
import { buildDashboardPricingCoverage } from "./dashboard-token-model-adapter";

function buildRow(
	overrides: Partial<ModelTokensTrendData>,
): ModelTokensTrendData {
	return {
		cache_creation_1h_input_tokens: 0,
		cache_creation_5m_input_tokens: 0,
		cache_creation_input_tokens: 0,
		cache_read_input_tokens: 0,
		date: "2026-08-01",
		estimated_cost: 1,
		input_tokens: 80,
		model: "priced-model",
		output_tokens: 20,
		total_tokens: 100,
		unpriced_session_count: 0,
		unpriced_token_count: 0,
		...overrides,
	};
}

describe("buildDashboardPricingCoverage", () => {
	it("reports priced-token share and daily unresolved model volume", () => {
		const coverage = buildDashboardPricingCoverage([
			buildRow({ total_tokens: 800 }),
			buildRow({
				date: "2026-08-02",
				estimated_cost: null,
				model: "new-model-id",
				total_tokens: 200,
				unpriced_session_count: 1,
				unpriced_token_count: 200,
			}),
		]);

		expect(coverage).toMatchObject({
			pricedTokenPercent: 80,
			totalTokens: 1000,
			unpricedModelCount: 1,
			unpricedTokens: 200,
		});
		expect(coverage.dailyUnresolvedModels).toEqual([
			{
				date: "2026-08-02",
				model: "new-model-id",
				unpricedTokens: 200,
			},
		]);
	});
});
