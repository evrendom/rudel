import { describe, expect, test } from "bun:test";
import type { ModelTokensTrendData } from "@rudel/api-routes";
import {
	buildDashboardTokenModelChartData,
	buildDashboardTokenModelRows,
} from "./dashboard-token-model-adapter";

describe("dashboard-token-model-adapter", () => {
	test("aggregates model totals across dates and sorts by total tokens", () => {
		const modelTokensTrend: ModelTokensTrendData[] = [
			{
				date: "2026-04-01",
				input_tokens: 600_000,
				model: "claude-sonnet-4-6-20250514",
				output_tokens: 400_000,
				total_tokens: 1_000_000,
			},
			{
				date: "2026-04-02",
				input_tokens: 400_000,
				model: "claude-sonnet-4-6-20250514",
				output_tokens: 600_000,
				total_tokens: 1_000_000,
			},
			{
				date: "2026-04-01",
				input_tokens: 250_000,
				model: "gpt-5.4-mini",
				output_tokens: 250_000,
				total_tokens: 500_000,
			},
		];

		const rows = buildDashboardTokenModelRows(modelTokensTrend);

		expect(rows).toEqual([
			{
				estimatedCost: 18,
				id: "claude-sonnet-4-6-20250514",
				inputTokens: 1_000_000,
				label: "claude-sonnet-4-6-20250514",
				outputTokens: 1_000_000,
				totalTokens: 2_000_000,
			},
			{
				estimatedCost: 1.3125,
				id: "gpt-5.4-mini",
				inputTokens: 250_000,
				label: "gpt-5.4-mini",
				outputTokens: 250_000,
				totalTokens: 500_000,
			},
		]);
	});

	test("builds chart rows with shortened model labels", () => {
		const chartData = buildDashboardTokenModelChartData([
			{
				estimatedCost: 18,
				id: "claude-sonnet-4-6-20250514",
				inputTokens: 1_000_000,
				label: "claude-sonnet-4-6-20250514",
				outputTokens: 1_000_000,
				totalTokens: 2_000_000,
			},
		]);

		expect(chartData).toEqual([
			{
				estimatedCost: 18,
				id: "claude-sonnet-4-6-20250514",
				inputTokens: 1_000_000,
				label: "claude-sonnet-4-6-20250514",
				outputTokens: 1_000_000,
				shortLabel: "sonnet-4-6",
				value: 2_000_000,
			},
		]);
	});
});
