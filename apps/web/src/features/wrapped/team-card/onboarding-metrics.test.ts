import type {
	DeveloperDetails,
	DeveloperSession,
	WrappedV1,
} from "@rudel/api-routes";
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
				input_tokens: 30_000,
				output_tokens: 8_000,
				total_sessions: 135,
				total_tokens: 38_000,
			}),
		});

		expect(metrics.totalSessions).toBe(135);
		expect(metrics.activeDays).toBe(14);
		expect(metrics.totalTokens).toBe(38_000);
		expect(metrics.estimatedCostUsd).toBe(91);
		expect(metrics.estimatedCostTokenBasis).toBe(38_000);
		expect(metrics.inputTokens + metrics.outputTokens).toBe(
			metrics.totalTokens,
		);
		expect(metrics.coreWindow).toBe("all_time");
	});

	it("sums server-priced session costs by repo and discloses the page cap", () => {
		const metrics = buildWrappedOnboardingMetrics({
			commitBreakdown: undefined,
			developerDetails: createDeveloperDetails({ total_sessions: 1001 }),
			developerFeatures: undefined,
			developerProjects: undefined,
			developerSessions: [
				createDeveloperSession({ estimated_cost: 1.25 }),
				createDeveloperSession({
					estimated_cost: 2.5,
					session_id: "session-2",
				}),
			],
			wrappedMetrics: undefined,
		});

		expect(metrics.repoPulse.entries[0]?.totalSpendLabel).toBe(
			"$3.75 estimated share",
		);
		expect(metrics.repoPulse.isTruncated).toBe(true);
		expect(metrics.repoPulse.sampledSessions).toBe(2);
		expect(metrics.repoPulse.availableSessions).toBe(1001);
	});
});

function createDeveloperSession(
	overrides: Partial<DeveloperSession> = {},
): DeveloperSession {
	return {
		duration_min: 10,
		estimated_cost: 1,
		has_errors: false,
		has_skills: false,
		has_slash_commands: false,
		has_subagents: false,
		likely_success: true,
		project_path: "/workspace/rudel",
		session_date: "2026-08-01T00:00:00.000Z",
		session_id: "session-1",
		total_tokens: 300,
		...overrides,
	} satisfies DeveloperSession;
}

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
		unpriced_session_count: 0,
		unpriced_token_count: 0,
		user_id: "user_1",
		...overrides,
	} satisfies DeveloperDetails;
}

function createWrappedMetrics(
	overrides: Partial<WrappedV1["metrics"]> = {},
): WrappedV1["metrics"] {
	return {
		active_days: 1,
		avg_session_min: 10,
		commit_rate: 100,
		commit_sessions: 1,
		days_since_first_session: 1,
		distinct_project_count: 1,
		estimated_spend_usd: 1,
		favorite_model: null,
		first_session_at: "2026-04-20T00:00:00Z",
		input_tokens: 100,
		last_session_at: "2026-04-21T00:00:00Z",
		longest_session_min: 10,
		model_by_month: [],
		output_tokens: 200,
		source_split: [],
		total_sessions: 1,
		total_tokens: 300,
		success_rate: 100,
		unpriced_session_count: 0,
		unpriced_token_count: 0,
		...overrides,
	} satisfies WrappedV1["metrics"];
}
