import { describe, expect, test } from "bun:test";
import { buildDashboardTokenModelRows } from "./dashboard-token-model-adapter";

describe("buildDashboardTokenModelRows", () => {
	test("sums authored event-priced costs without client-side repricing", () => {
		const [row] = buildDashboardTokenModelRows([
			{
				date: "2026-08-01",
				estimated_cost: 10,
				input_tokens: 100,
				model: "display-model",
				output_tokens: 20,
				total_tokens: 120,
			},
			{
				date: "2026-08-02",
				estimated_cost: 2.5,
				input_tokens: 50,
				model: "display-model",
				output_tokens: 10,
				total_tokens: 60,
			},
		]);

		expect(row?.estimatedCost).toBe(12.5);
		expect(row?.totalTokens).toBe(180);
	});

	test("keeps a model aggregate unknown when any event-priced subtotal is unknown", () => {
		const [row] = buildDashboardTokenModelRows([
			{
				date: "2026-08-01",
				estimated_cost: 10,
				input_tokens: 100,
				model: "display-model",
				output_tokens: 20,
				total_tokens: 120,
			},
			{
				date: "2026-08-02",
				estimated_cost: null,
				input_tokens: 50,
				model: "display-model",
				output_tokens: 10,
				total_tokens: 60,
			},
		]);

		expect(row?.estimatedCost).toBeNull();
	});
});
