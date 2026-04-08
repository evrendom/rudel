import { describe, expect, test } from "bun:test";
import { ESTIMATED_PRICING_MODE } from "../model-pricing.js";
import {
	DaysInputSchema,
	DeveloperDetailsInputSchema,
	DeveloperSessionsInputSchema,
	DeveloperSummarySchema,
	DeveloperTeamCardSchema,
	DimensionAnalysisInputSchema,
	ErrorsDashboardSchema,
	RecurringErrorsInputSchema,
	ROIDashboardSchema,
	SessionDetailInputSchema,
	SessionListInputSchema,
} from "../schemas/analytics.js";

describe("analytics input schemas", () => {
	test("reject oversized free-form analytics filters", () => {
		expect(() =>
			DeveloperDetailsInputSchema.parse({
				days: 7,
				userId: "a".repeat(513),
			}),
		).toThrow();
		expect(() =>
			SessionListInputSchema.parse({
				days: 7,
				projectPath: "a".repeat(4097),
			}),
		).toThrow();
		expect(() =>
			SessionDetailInputSchema.parse({
				sessionId: "a".repeat(513),
			}),
		).toThrow();
	});

	test("days capped at 365", () => {
		expect(DaysInputSchema.safeParse({ days: 365 }).success).toBe(true);
		expect(DaysInputSchema.safeParse({ days: 366 }).success).toBe(false);
	});

	test("limit capped at 1000 on session list", () => {
		expect(SessionListInputSchema.safeParse({ limit: 1000 }).success).toBe(
			true,
		);
		expect(SessionListInputSchema.safeParse({ limit: 1001 }).success).toBe(
			false,
		);
	});

	test("limit capped at 1000 on dimension analysis", () => {
		expect(
			DimensionAnalysisInputSchema.safeParse({
				dimension: "user_id",
				metric: "session_count",
				limit: 1000,
			}).success,
		).toBe(true);
		expect(
			DimensionAnalysisInputSchema.safeParse({
				dimension: "user_id",
				metric: "session_count",
				limit: 1001,
			}).success,
		).toBe(false);
	});

	test("limit capped at 1000 on developer sessions", () => {
		expect(
			DeveloperSessionsInputSchema.safeParse({
				userId: "u1",
				limit: 1000,
			}).success,
		).toBe(true);
		expect(
			DeveloperSessionsInputSchema.safeParse({
				userId: "u1",
				limit: 1001,
			}).success,
		).toBe(false);
	});

	test("limit capped at 1000 on recurring errors", () => {
		expect(RecurringErrorsInputSchema.safeParse({ limit: 1000 }).success).toBe(
			true,
		);
		expect(RecurringErrorsInputSchema.safeParse({ limit: 1001 }).success).toBe(
			false,
		);
	});

	test("team card output schema accepts nullable models and skill counts", () => {
		expect(
			DeveloperTeamCardSchema.safeParse({
				user_id: "u1",
				display_name: "User One",
				cost: 1.23,
				input_tokens: 9000,
				output_tokens: 3000,
				total_tokens: 12345,
				total_sessions: 12,
				active_days: 5,
				last_active_date: "2026-03-24 10:00:00.000",
				favorite_model: null,
				top_skills: [{ name: "shadcn", count: 3 }],
			}).success,
		).toBe(true);
	});

	test("developer summary schema accepts nullable favorite model", () => {
		expect(
			DeveloperSummarySchema.safeParse({
				user_id: "u1",
				total_sessions: 12,
				active_days: 5,
				total_tokens: 12345,
				input_tokens: 9000,
				output_tokens: 3345,
				total_duration_min: 42.5,
				avg_session_duration_min: 3.54,
				last_active_date: "2026-03-24 10:00:00.000",
				success_rate: 0.92,
				cost: 1.23,
				success_rate_trend: 0.04,
				favorite_model: null,
			}).success,
		).toBe(true);
	});

	test("errors dashboard schema accepts summary and recurring rows", () => {
		expect(
			ErrorsDashboardSchema.safeParse({
				start_date: "2026-03-01",
				end_date: "2026-03-24",
				summary: {
					total_errors: 12,
					distinct_patterns: 3,
					high_severity_patterns: 1,
					max_affected_users: 4,
					top_error_pattern: "Timeout",
				},
				recurring: [
					{
						error_pattern: "Timeout",
						occurrences: 12,
						affected_sessions: 8,
						affected_users: 4,
						last_seen: "2026-03-24 10:00:00.000",
						severity: "high",
						repositories: ["github.com/acme/app"],
					},
				],
			}).success,
		).toBe(true);
	});

	test("roi dashboard schema accepts summary, assumptions, trend, and breakdowns", () => {
		expect(
			ROIDashboardSchema.safeParse({
				start_date: "2026-03-01",
				end_date: "2026-03-24",
				comparison_start_date: "2026-02-06",
				comparison_end_date: "2026-02-28",
				summary: {
					total_cost: 12.34,
					total_cost_change_pct: 5.6,
					dollar_value_saved: 123.45,
					dollar_value_saved_change_pct: 10.2,
					roi_percentage: 900.1,
					roi_percentage_change_pct: 15.3,
					dev_hours_saved: 4.5,
					dev_hours_saved_change_pct: 12.1,
					commits_per_dollar: 2.1,
					sessions_per_dollar: 3.2,
					total_sessions: 20,
					total_commits: 8,
					active_developers: 4,
					avg_success_score: 87.4,
				},
				assumptions: {
					pricing_mode: ESTIMATED_PRICING_MODE,
					priced_model_entries: 20,
					fallback_input_price_per_million: 3,
					fallback_output_price_per_million: 15,
					code_percentage: 0.65,
					tokens_per_loc: 15,
					loc_per_hour: 30,
					developer_hourly_rate: 100,
				},
				trend_interval: "day",
				trend: [
					{
						bucket_start: "2026-03-24",
						bucket_label: "Mar 24",
						total_cost: 1.23,
						dollar_value_saved: 12.34,
						roi_percentage: 902.1,
						dev_hours_saved: 0.4,
						commits_per_dollar: 1.5,
						sessions_per_dollar: 2.5,
						total_sessions: 4,
						total_commits: 2,
					},
				],
				developer_breakdown: [
					{
						user_id: "u1",
						sessions: 4,
						total_tokens: 1000,
						cost: 1.23,
						cost_percentage: 50,
						avg_success_score: 88,
					},
				],
				project_breakdown: [
					{
						project_path: "app",
						sessions: 4,
						total_tokens: 1000,
						cost: 1.23,
						cost_percentage: 50,
						avg_success_score: 88,
					},
				],
			}).success,
		).toBe(true);
	});
});
