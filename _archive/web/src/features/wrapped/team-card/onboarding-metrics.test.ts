import type { DeveloperDetails, WrappedV1 } from "@rudel/api-routes";
import { describe, expect, it } from "vitest";
import { buildWrappedOnboardingMetrics } from "./onboarding-metrics";

describe("buildWrappedOnboardingMetrics", () => {
	it("uses wrapped all-time totals when recent developer details lag", () => {
		const metrics = buildWrappedOnboardingMetrics({
			commitBreakdown: undefined,
			developerDetails: createDeveloperDetails({
				active_days: 9,
				cost: 42,
				total_sessions: 73,
				total_tokens: 12_000,
			}),
			developerFeatures: undefined,
			developerProjects: undefined,
			developerSessions: undefined,
			wrappedMetrics: createWrappedMetrics({
				active_days: 14,
				estimated_spend_usd: 91,
				total_sessions: 135,
				total_tokens: 38_000,
			}),
		});

		expect(metrics.totalSessions).toBe(135);
		expect(metrics.activeDays).toBe(14);
		expect(metrics.totalTokens).toBe(38_000);
		expect(metrics.estimatedCostUsd).toBe(91);
		expect(metrics.estimatedCostTokenBasis).toBe(38_000);
	});
});

function createDeveloperDetails(
	overrides: Partial<DeveloperDetails> = {},
): DeveloperDetails {
	return {
		active_days: 1,
		avg_session_duration_min: 10,
		cost: 1,
		distinct_projects: 1,
		error_count: 0,
		favorite_model: null,
		input_tokens: 100,
		last_active_date: "2026-04-21",
		output_tokens: 200,
		success_rate: 100,
		success_rate_trend: 0,
		total_duration_min: 10,
		total_sessions: 1,
		total_tokens: 300,
		user_id: "user_1",
		...overrides,
	} satisfies DeveloperDetails;
}

function createWrappedMetrics(
	overrides: Partial<WrappedV1["metrics"]> = {},
): WrappedV1["metrics"] {
	return {
		active_days: 1,
		days_since_first_session: 1,
		estimated_spend_usd: 1,
		favorite_model: null,
		first_session_at: "2026-04-20T00:00:00Z",
		last_session_at: "2026-04-21T00:00:00Z",
		longest_session_min: 10,
		model_by_month: [],
		source_split: [],
		total_sessions: 1,
		total_tokens: 300,
		...overrides,
	} satisfies WrappedV1["metrics"];
}
