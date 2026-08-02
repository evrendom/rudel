import type { UserDailyTrendData } from "@rudel/api-routes";
import { describe, expect, it } from "vitest";
import type { DashboardPerformanceUserComparison } from "@/features/dashboard/data/dashboard-performance-adapter";
import { buildDashboardTokenDeveloperRows } from "./DashboardTokenDeveloperTable";

describe("buildDashboardTokenDeveloperRows", () => {
	it("uses one daily window for every value when a date is highlighted", () => {
		const users: DashboardPerformanceUserComparison[] = [
			{
				commits: 7,
				cost: 99,
				inputTokens: 9000,
				label: "Ada",
				modelsUsed: ["range-model"],
				outputTokens: 1000,
				repositoriesTouched: ["rudel"],
				sessions: 10,
				totalTokens: 10_000,
				userId: "user-1",
			},
		];
		const dailyRows: UserDailyTrendData[] = [
			{
				avg_success_rate: 90,
				date: "2026-08-01",
				distinct_skills: 1,
				distinct_slash_commands: 0,
				estimated_cost: 2.5,
				input_tokens: 1200,
				models_used: ["daily-model"],
				output_tokens: 300,
				repositories_touched: ["rudel"],
				sessions: 2,
				total_commits: 1,
				total_hours: 1,
				total_tokens: 1500,
				unpriced_session_count: 0,
				unpriced_token_count: 0,
				user_id: "user-1",
			},
		];

		expect(
			buildDashboardTokenDeveloperRows(users, "2026-08-01", dailyRows)[0],
		).toMatchObject({
			cost: 2.5,
			inputTokens: 1200,
			modelsUsed: ["daily-model"],
			outputTokens: 300,
			sessions: 2,
			totalTokens: 1500,
		});
	});
});
