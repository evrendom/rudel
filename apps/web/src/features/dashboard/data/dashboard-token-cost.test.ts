import type {
	ModelTokensTrendData,
	UserTokenUsageData,
} from "@rudel/api-routes";
import { describe, expect, it } from "vitest";
import { buildDashboardPerformanceUsers } from "./dashboard-performance-adapter";
import {
	buildDashboardTokenDailyPattern,
	buildDashboardTokenTabMetrics,
} from "./dashboard-tab-adapters";
import { buildDashboardTokenModelRows } from "./dashboard-token-model-adapter";

const cacheHeavyAnchor: ModelTokensTrendData = {
	cache_creation_input_tokens: 0,
	cache_creation_5m_input_tokens: 0,
	cache_creation_1h_input_tokens: 0,
	cache_read_input_tokens: 2_735_360,
	date: "2026-08-01",
	estimated_cost: 2.502135,
	input_tokens: 2_853_471,
	model: "gpt-5.6-sol",
	output_tokens: 18_130,
	total_tokens: 2_871_601,
	unpriced_session_count: 0,
	unpriced_token_count: 0,
};

function createUserUsage(
	overrides: Partial<UserTokenUsageData> = {},
): UserTokenUsageData {
	return {
		cost: 2.502135,
		distinct_skills: 0,
		distinct_slash_commands: 0,
		input_tokens: cacheHeavyAnchor.input_tokens,
		models_used: [cacheHeavyAnchor.model],
		output_tokens: cacheHeavyAnchor.output_tokens,
		repositories_touched: [],
		success_rate: 100,
		total_commits: 0,
		total_duration_min: 10,
		total_sessions: 1,
		total_tokens: cacheHeavyAnchor.total_tokens,
		unpriced_session_count: 0,
		unpriced_token_count: 0,
		user_id: "user-1",
		user_label: "User",
		...overrides,
	};
}

describe("dashboard token cost adapters", () => {
	it("keeps the cache-heavy backend estimate identical across daily, model, and KPI surfaces", () => {
		const modelRows = [cacheHeavyAnchor];
		const dailyPattern = buildDashboardTokenDailyPattern(
			"2026-08-01",
			"2026-08-01",
			undefined,
			modelRows,
		);
		const modelSummaries = buildDashboardTokenModelRows(modelRows);
		const metrics = buildDashboardTokenTabMetrics(
			undefined,
			dailyPattern,
			modelRows,
		);

		expect(dailyPattern[0]?.estimatedCost).toBe(2.502135);
		expect(modelSummaries[0]?.estimatedCost).toBe(2.502135);
		expect(
			metrics.find((metric) => metric.label === "Est. spend")?.valueLabel,
		).toBe("$2.50");
		expect(
			buildDashboardPerformanceUsers(
				[createUserUsage()],
				undefined,
				new Map(),
			)[0]?.cost,
		).toBe(dailyPattern[0]?.estimatedCost);
	});

	it("uses a legitimate zero model cost instead of an unrelated fallback", () => {
		const zeroCostRow = {
			...cacheHeavyAnchor,
			estimated_cost: 0,
			input_tokens: 0,
			output_tokens: 0,
			total_tokens: 0,
		};
		const metrics = buildDashboardTokenTabMetrics(
			[createUserUsage({ cost: 999, total_tokens: 0 })],
			[],
			[zeroCostRow],
		);

		expect(
			metrics.find((metric) => metric.label === "Est. spend")?.valueLabel,
		).toBe("$0.00");
		expect(
			buildDashboardPerformanceUsers(
				[createUserUsage({ cost: 0 })],
				undefined,
				new Map(),
			)[0]?.cost,
		).toBe(0);
	});

	it("marks aggregate cost unavailable when any model row is unpriced", () => {
		const unresolvedRow = {
			...cacheHeavyAnchor,
			estimated_cost: null,
			unpriced_session_count: 1,
			unpriced_token_count: cacheHeavyAnchor.total_tokens,
		};
		const dailyPattern = buildDashboardTokenDailyPattern(
			"2026-08-01",
			"2026-08-01",
			undefined,
			[unresolvedRow],
		);
		const metrics = buildDashboardTokenTabMetrics(undefined, dailyPattern, [
			unresolvedRow,
		]);

		expect(dailyPattern[0]?.estimatedCost).toBeNull();
		expect(
			buildDashboardTokenModelRows([unresolvedRow])[0]?.estimatedCost,
		).toBeNull();
		expect(
			metrics.find((metric) => metric.label === "Est. spend")?.valueLabel,
		).toBe("—");
		expect(
			buildDashboardPerformanceUsers(
				[
					createUserUsage({
						unpriced_session_count: 1,
						unpriced_token_count: cacheHeavyAnchor.total_tokens,
					}),
				],
				undefined,
				new Map(),
			)[0]?.cost,
		).toBeNull();
	});
});
