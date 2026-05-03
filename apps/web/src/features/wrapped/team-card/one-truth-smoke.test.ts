import type {
	DeveloperDetails,
	DeveloperFeatureUsage,
	DeveloperProject,
	DeveloperSession,
	DimensionAnalysisDataPoint,
	WrappedV1,
} from "@rudel/api-routes";
import { describe, expect, it } from "vitest";
import type { TeamPageMemberRow } from "@/features/team/use-team-page-data";
import { buildWrappedTeamCardBackMetrics } from "./back-metrics";
import { buildWrappedOnboardingMetrics } from "./onboarding-metrics";
import { buildResolvedTeamCardRow } from "./row";
import { buildWrappedStatItems } from "./stat-items";

describe("wrapped one-truth smoke", () => {
	it("keeps reveal, share card, and team card data on the newest uploaded-session snapshot", () => {
		const freshWrappedMetrics = createWrappedMetrics({
			active_days: 14,
			days_since_first_session: 44,
			estimated_spend_usd: 91,
			favorite_model: "gpt-5.1-codex",
			longest_session_min: 48,
			source_split: [
				{
					session_count: 79,
					session_share_percent: 60,
					source: "claude_code",
				},
				{
					session_count: 53,
					session_share_percent: 40,
					source: "codex",
				},
			],
			total_sessions: 132,
			total_tokens: 3_800_000,
		});
		const newDeveloperDetails = createDeveloperDetails({
			active_days: 14,
			avg_session_duration_min: 24,
			cost: 91,
			distinct_projects: 8,
			favorite_model: "gpt-5.1-codex",
			input_tokens: 1_500_000,
			output_tokens: 2_300_000,
			success_rate: 96,
			total_duration_min: 3_168,
			total_sessions: 132,
			total_tokens: 3_800_000,
		});
		const newDeveloperFeatures = createDeveloperFeatures();
		const newDeveloperProjects = [
			createDeveloperProject({
				project_path: "/repos/new-repo",
				sessions: 88,
				total_tokens: 2_400_000,
			}),
			createDeveloperProject({
				project_path: "/repos/old-repo",
				sessions: 44,
				total_tokens: 1_400_000,
			}),
		];
		const newDeveloperSessions = [
			createDeveloperSession({
				duration_min: 24,
				project_path: "/repos/new-repo",
				session_id: "new-session-1",
				total_tokens: 1_900_000,
			}),
			createDeveloperSession({
				duration_min: 18,
				project_path: "/repos/new-repo",
				session_id: "new-session-2",
				total_tokens: 1_900_000,
			}),
		];
		const newCommitBreakdown = [
			{
				dimension_value: "true",
				metric_value: 73,
			},
		] satisfies DimensionAnalysisDataPoint[];

		const row = buildResolvedTeamCardRow({
			accountLabel: "Session User",
			developerDetails: newDeveloperDetails,
			guestPreviewDisplayName: undefined,
			guestPreviewImageUrl: undefined,
			profileImageFallbackSrc: "/favicon-dark.png",
			sessionUserEmail: "session@example.com",
			sessionUserId: "user_1",
			sessionUserImage: undefined,
			sessionUserName: "Session User",
			teamMemberRows: [],
			wrappedMetrics: freshWrappedMetrics,
		});
		const onboardingMetrics = buildWrappedOnboardingMetrics({
			commitBreakdown: newCommitBreakdown,
			developerDetails: newDeveloperDetails,
			developerFeatures: newDeveloperFeatures,
			developerProjects: newDeveloperProjects,
			developerSessions: newDeveloperSessions,
			wrappedMetrics: freshWrappedMetrics,
		});
		const statItems = buildWrappedStatItems(
			row,
			onboardingMetrics.distinctProjectCount,
			onboardingMetrics.sourceSplit,
		);
		const backMetrics = buildWrappedTeamCardBackMetrics({
			onboardingMetrics,
			row,
			shareCardCreatedAtLabel: "May 3, 2026",
		});

		expect.soft(row.totalSessions).toBe(132);
		expect.soft(row.activeDays).toBe(14);
		expect.soft(row.totalTokens).toBe(3_800_000);
		expect.soft(row.cost).toBe(91);
		expect.soft(row.favoriteModel).toBe("gpt-5.1-codex");

		expect.soft(onboardingMetrics.totalSessions).toBe(132);
		expect.soft(onboardingMetrics.activeDays).toBe(14);
		expect.soft(onboardingMetrics.totalTokens).toBe(3_800_000);
		expect.soft(onboardingMetrics.estimatedCostUsd).toBe(91);
		expect.soft(onboardingMetrics.favoriteModel).toBe("Gpt 5.1 Codex");
		expect.soft(onboardingMetrics.topProjectName).toBe("/repos/new-repo");
		expect.soft(onboardingMetrics.topSkills[0]?.name).toBe("New Skill");
		expect.soft(onboardingMetrics.sourceSplit).toEqual([
			{
				session_count: 79,
				session_share_percent: 60,
				source: "claude_code",
			},
			{
				session_count: 53,
				session_share_percent: 40,
				source: "codex",
			},
		]);

		expect.soft(findStatItemValue(statItems, "sessions")).toBe("132");
		expect.soft(findStatItemValue(statItems, "repos")).toBe("8");
		expect.soft(findStatItemValue(statItems, "claude-share")).toBe("60%");
		expect.soft(findStatItemValue(statItems, "codex-share")).toBe("40%");

		expect.soft(findBackMetricValue(backMetrics, "Sessions")).toBe("132");
		expect.soft(findBackMetricValue(backMetrics, "Active days")).toBe("14");
		expect
			.soft(findBackMetricValue(backMetrics, "Claude/Codex %"))
			.toBe("60%/40%");
		expect
			.soft(findBackMetricValue(backMetrics, "FAV SKILL"))
			.toBe("New Skill");

		const teamOverviewRow = createTeamOverviewRow(newDeveloperDetails);
		expect.soft(teamOverviewRow.totalSessions).toBe(132);
		expect.soft(teamOverviewRow.favoriteModel).toBe("gpt-5.1-codex");
	});
});

function findStatItemValue(
	items: readonly { key: string; value: string }[],
	key: string,
) {
	return items.find((item) => item.key === key)?.value;
}

function findBackMetricValue(
	items: readonly { label: string; value: string }[],
	label: string,
) {
	return items.find((item) => item.label === label)?.value;
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
		last_active_date: "2026-05-03",
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

function createDeveloperFeatures(
	overrides: Partial<DeveloperFeatureUsage> = {},
): DeveloperFeatureUsage {
	return {
		skills_adoption_rate: 55,
		slash_commands_adoption_rate: 44,
		subagents_adoption_rate: 33,
		top_skills: [{ count: 44, name: "new-skill" }],
		top_slash_commands: [{ count: 22, name: "new-command" }],
		top_subagents: [{ count: 18, name: "new-agent" }],
		...overrides,
	} satisfies DeveloperFeatureUsage;
}

function createDeveloperProject(
	overrides: Partial<DeveloperProject> = {},
): DeveloperProject {
	return {
		first_session: "2026-04-20T00:00:00Z",
		last_session: "2026-05-03T00:00:00Z",
		project_path: "/repos/new-repo",
		sessions: 1,
		total_duration_min: 10,
		total_tokens: 300,
		...overrides,
	} satisfies DeveloperProject;
}

function createDeveloperSession(
	overrides: Partial<DeveloperSession> = {},
): DeveloperSession {
	return {
		duration_min: 10,
		has_errors: false,
		has_skills: true,
		has_slash_commands: true,
		has_subagents: true,
		likely_success: true,
		project_path: "/repos/new-repo",
		session_date: "2026-05-03",
		session_id: "session_1",
		total_tokens: 300,
		...overrides,
	} satisfies DeveloperSession;
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

function createTeamOverviewRow(
	developerDetails: DeveloperDetails,
): TeamPageMemberRow {
	return {
		activeDays: developerDetails.active_days,
		cost: developerDetails.cost,
		displayName: "Session User",
		email: "session@example.com",
		favoriteModel: developerDetails.favorite_model,
		hasActivity: developerDetails.total_sessions > 0,
		imageUrl: "/favicon-dark.png",
		inputTokens: developerDetails.input_tokens,
		lastActiveDate: developerDetails.last_active_date,
		outputTokens: developerDetails.output_tokens,
		role: "Tracked collaborator",
		totalSessions: developerDetails.total_sessions,
		totalTokens: developerDetails.total_tokens,
		userId: developerDetails.user_id,
	};
}
