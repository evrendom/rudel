import { describe, expect, test } from "bun:test";
import {
	buildDashboardTokenDailyPattern,
	buildDashboardTokenTabMetrics,
} from "./dashboard-tab-adapters";
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

	test("keeps the known subtotal and marks a model aggregate partial", () => {
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

		expect(row?.estimatedCost).toBe(10);
		expect(row?.isCostPartial).toBe(true);
	});

	test("keeps a fully unpriced model aggregate unknown", () => {
		const [row] = buildDashboardTokenModelRows([
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
		expect(row?.isCostPartial).toBe(false);
	});

	test("renders the dashboard headline as a non-rounded lower bound", () => {
		const metrics = buildDashboardTokenTabMetrics(
			[],
			[],
			[
				{
					date: "2026-08-01",
					estimated_cost: 12.5,
					input_tokens: 100,
					model: "priced-model",
					output_tokens: 20,
					total_tokens: 120,
				},
				{
					date: "2026-08-01",
					estimated_cost: null,
					input_tokens: 50,
					model: "unpriced-model",
					output_tokens: 10,
					total_tokens: 60,
				},
			],
		);

		expect(
			metrics.find((metric) => metric.id === "uncommitted")?.valueLabel,
		).toBe("≥ $12.50");
	});

	test("keeps daily known cost and partial state separately", () => {
		const [point] = buildDashboardTokenDailyPattern(
			"2026-08-01",
			"2026-08-01",
			[],
			[
				{
					date: "2026-08-01",
					estimated_cost: 12.5,
					input_tokens: 100,
					model: "priced-model",
					output_tokens: 20,
					total_tokens: 120,
				},
				{
					date: "2026-08-01",
					estimated_cost: null,
					input_tokens: 50,
					model: "unpriced-model",
					output_tokens: 10,
					total_tokens: 60,
				},
			],
		);

		expect(point?.estimatedCost).toBe(12.5);
		expect(point?.isCostPartial).toBe(true);
	});
});
