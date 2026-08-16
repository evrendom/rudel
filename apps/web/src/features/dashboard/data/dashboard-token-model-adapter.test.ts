import { describe, expect, test } from "vitest";
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

	test("renders a fully unpriced model aggregate as a partial numeric zero", () => {
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

		expect(row?.estimatedCost).toBe(0);
		expect(row?.isCostPartial).toBe(true);
	});

	test("renders the dashboard headline as a rounded known subtotal", () => {
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
		).toBe("$13");
	});

	test("renders a numeric dashboard headline when every model is unpriced", () => {
		const metrics = buildDashboardTokenTabMetrics(
			[],
			[],
			[
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
		).toBe("$0");
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

	test("prefers server cost and only falls back to the rate card when absent", () => {
		const points = buildDashboardTokenDailyPattern(
			"2026-08-01",
			"2026-08-02",
			[],
			[
				{
					date: "2026-08-01",
					estimated_cost: 123,
					input_tokens: 1_000_000,
					model: "claude-opus-5",
					output_tokens: 0,
					total_tokens: 1_000_000,
				},
				{
					date: "2026-08-02",
					estimated_cost: null,
					input_tokens: 1_000_000,
					model: "claude-opus-5",
					output_tokens: 0,
					total_tokens: 1_000_000,
				},
			],
		);

		expect(points[0]?.estimatedCost).toBe(123);
		expect(points[0]?.isCostPartial).toBe(false);
		expect(points[1]?.estimatedCost).toBe(5);
		expect(points[1]?.isCostPartial).toBe(true);
	});
});
