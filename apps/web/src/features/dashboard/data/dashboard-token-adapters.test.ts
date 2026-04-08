import { describe, expect, test } from "bun:test";
import type {
	ModelTokensTrendData,
	UserDailyTrendData,
	UserTokenUsageData,
} from "@rudel/api-routes";
import {
	buildDashboardTokenDailyPattern,
	buildDashboardTokenTabMetrics,
} from "./dashboard-token-adapters";

describe("dashboard-token-adapters", () => {
	test("falls back to model rows when user trend token breakdown is empty", () => {
		const userRows: UserDailyTrendData[] = [
			{
				avg_success_rate: 100,
				date: "2026-04-01",
				distinct_skills: 1,
				distinct_slash_commands: 0,
				input_tokens: 0,
				models_used: [],
				output_tokens: 0,
				repositories_touched: [],
				sessions: 3,
				total_commits: 2,
				total_hours: 1.5,
				total_tokens: 0,
				user_id: "user-1",
			},
		];
		const modelRows: ModelTokensTrendData[] = [
			{
				date: "2026-04-01",
				input_tokens: 900,
				model: "claude-sonnet-4-6-20250514",
				output_tokens: 300,
				total_tokens: 1200,
			},
			{
				date: "2026-04-01",
				input_tokens: 200,
				model: "gpt-5.4-mini",
				output_tokens: 100,
				total_tokens: 300,
			},
		];

		const dailyPattern = buildDashboardTokenDailyPattern(
			"2026-04-01",
			"2026-04-02",
			userRows,
			modelRows,
		);

		expect(dailyPattern).toHaveLength(2);
		expect(dailyPattern[0]).toMatchObject({
			activeModels: 2,
			avgTokensPerSession: 500,
			date: "2026-04-01",
			dominantModel: "claude-sonnet-4-6-20250514",
			dominantModelTokens: 1200,
			inputTokens: 1100,
			outputTokens: 400,
			sessions: 3,
			totalTokens: 1500,
		});
		expect(dailyPattern[1]).toMatchObject({
			activeModels: 0,
			avgTokensPerSession: null,
			date: "2026-04-02",
			totalTokens: 0,
		});
	});

	test("builds token headline metrics from aggregated usage", () => {
		const usersTokenUsage: UserTokenUsageData[] = [
			{
				cost: 12,
				distinct_skills: 1,
				distinct_slash_commands: 0,
				input_tokens: 1500,
				models_used: ["claude-sonnet-4-6-20250514"],
				output_tokens: 900,
				repositories_touched: ["rudel"],
				success_rate: 100,
				total_commits: 4,
				total_duration_min: 40,
				total_sessions: 3,
				total_tokens: 2400,
				user_id: "user-1",
				user_label: "Ada Lovelace",
			},
		];
		const userTrendRows: UserDailyTrendData[] = [
			{
				avg_success_rate: 100,
				date: "2026-04-01",
				distinct_skills: 1,
				distinct_slash_commands: 0,
				input_tokens: 1500,
				models_used: ["claude-sonnet-4-6-20250514"],
				output_tokens: 900,
				repositories_touched: ["rudel"],
				sessions: 3,
				total_commits: 4,
				total_hours: 2,
				total_tokens: 2400,
				user_id: "user-1",
			},
		];
		const dailyPattern = buildDashboardTokenDailyPattern(
			"2026-04-01",
			"2026-04-02",
			userTrendRows,
			undefined,
		);

		const metrics = buildDashboardTokenTabMetrics(
			usersTokenUsage,
			dailyPattern,
			undefined,
			userTrendRows,
		);

		expect(metrics).toEqual([
			{
				description: "Total input and output tokens in the selected range.",
				deltaLabel: "0",
				deltaTone: "neutral",
				id: "sessions",
				label: "Tokens used",
				valueLabel: "2.4K",
			},
			{
				description:
					"Estimated token cost using the current model pricing catalog.",
				deltaLabel: "0",
				deltaTone: "neutral",
				id: "uncommitted",
				label: "Est. spend",
				valueLabel: "$12",
			},
			{
				description:
					"Developers with token activity in the selected range. Delta shows average daily token load.",
				deltaLabel: "2.4K",
				deltaTone: "neutral",
				id: "commitRate",
				label: "Active developers",
				valueLabel: "1",
			},
		]);
	});
});
