import type {
	DeveloperError,
	DeveloperProject,
	DimensionAnalysisDataPoint,
	UserTokenUsageData,
} from "@rudel/api-routes";
import { useMemo } from "react";
import { useAnalyticsQuery } from "@/features/analytics/queries/useAnalyticsQuery";
import { useFullOrganization } from "@/features/workspace/hooks/useFullOrganization";
import { useOrganization } from "@/features/workspace/organization/useOrganization";
import { authClient } from "@/lib/auth-client";
import { formatIsoDate } from "@/lib/format";
import { orpc } from "@/lib/orpc";

const WRAPPED_DAYS = 365;

type WrappedRankSet = {
	commitRank: number | null;
	sessionRank: number | null;
	spendRank: number | null;
	tokenRank: number | null;
};

export type FifaWrappedStoryData = {
	commitRate: number;
	displayName: string;
	dominantArchetype: string;
	errorCount: number;
	favoriteModel: string | null;
	firstName: string;
	imageUrl: string | null;
	initials: string;
	lastActiveDate: string | null;
	longestSessionMin: number;
	longestStreakDays: number;
	modelCount: number;
	modelsUsed: readonly string[];
	overallRating: number;
	peakDayDate: string | null;
	peakDaySessions: number;
	peakDayTokens: number;
	periodEnd: string;
	periodLabel: string;
	periodStart: string;
	planModeRate: number;
	primaryErrorPattern: string | null;
	projectCount: number;
	repositoryCount: number;
	seasonRole: string;
	sessionCount: number;
	successRate: number;
	successRateTrend: number;
	topProjectName: string;
	topProjectSessions: number;
	topProjectTokens: number;
	topSessionTokens: number;
	topSkill: string;
	topSlashCommand: string;
	topSubagent: string;
	totalCommits: number;
	totalCost: number;
	totalDurationMin: number;
	totalTokens: number;
	activeDays: number;
	avgSessionDurationMin: number;
	distinctProjects: number;
	distinctSkills: number;
	distinctSlashCommands: number;
	featureAdoptionRates: {
		skills: number;
		slashCommands: number;
		subagents: number;
	};
	ranks: WrappedRankSet;
	repositoriesTouched: readonly string[];
	workspaceSize: number;
};

type WrappedDataState = {
	diagnostics: WrappedDiagnostics;
	error: unknown;
	isError: boolean;
	isLoading: boolean;
	story: FifaWrappedStoryData | null;
};

export type WrappedQueryDiagnostic = {
	error: unknown;
	errorMessage: string | null;
	hasData: boolean;
	isError: boolean;
	isPending: boolean;
	name: string;
};

export type WrappedDiagnostics = {
	activeOrgId: string | null;
	currentUserId: string | null;
	isSessionPending: boolean;
	isWorkspaceLoading: boolean;
	queries: readonly WrappedQueryDiagnostic[];
};

function createWrappedError(message: string) {
	return new Error(message);
}

function getWrappedErrorMessage(error: unknown) {
	if (error instanceof Error && error.message.trim().length > 0) {
		return error.message;
	}

	if (
		typeof error === "object" &&
		error !== null &&
		"message" in error &&
		typeof error.message === "string" &&
		error.message.trim().length > 0
	) {
		return error.message;
	}

	return null;
}

function getWrappedRange(days: number) {
	const endDate = new Date();
	const startDate = new Date(endDate);
	startDate.setDate(endDate.getDate() - (days - 1));

	return {
		days,
		endDate: formatIsoDate(endDate),
		startDate: formatIsoDate(startDate),
	};
}

function formatTitleLabel(value: string | null | undefined, fallback: string) {
	const trimmedValue = value?.trim();

	if (!trimmedValue) {
		return fallback;
	}

	return trimmedValue
		.replaceAll(/[_-]+/g, " ")
		.replaceAll(/\s+/g, " ")
		.trim()
		.replaceAll(/\b\w/g, (character) => character.toUpperCase());
}

function getInitials(name: string) {
	const parts = name.split(/\s+/).filter(Boolean);

	if (parts.length === 0) {
		return "AI";
	}

	if (parts.length === 1) {
		return parts[0]?.slice(0, 2).toUpperCase() ?? "AI";
	}

	return `${parts[0]?.[0] ?? ""}${parts.at(-1)?.[0] ?? ""}`.toUpperCase();
}

function getMetricValue(row: DimensionAnalysisDataPoint) {
	return Number(row.metric_value) || 0;
}

function findBooleanDimensionCount(
	rows: readonly DimensionAnalysisDataPoint[] | undefined,
	target: boolean,
) {
	const match = rows?.find((row) => {
		const normalizedValue = row.dimension_value.trim().toLowerCase();
		return target
			? normalizedValue === "true" || normalizedValue === "1"
			: normalizedValue === "false" || normalizedValue === "0";
	});

	return match ? getMetricValue(match) : 0;
}

function findTopDimensionValue(
	rows: readonly DimensionAnalysisDataPoint[] | undefined,
	fallback: string,
) {
	const topRow = [...(rows ?? [])].sort(
		(leftRow, rightRow) =>
			getMetricValue(rightRow) - getMetricValue(leftRow) ||
			leftRow.dimension_value.localeCompare(rightRow.dimension_value),
	)[0];

	return formatTitleLabel(topRow?.dimension_value, fallback);
}

function findLongestStreakDays(
	timeline: readonly { date: string }[] | undefined,
) {
	const sortedDates = [
		...new Set((timeline ?? []).map((row) => row.date)),
	].sort();

	if (sortedDates.length === 0) {
		return 0;
	}

	let longestStreak = 1;
	let currentStreak = 1;

	for (let dateIndex = 1; dateIndex < sortedDates.length; dateIndex += 1) {
		const previousDate = new Date(`${sortedDates[dateIndex - 1]}T00:00:00Z`);
		const currentDate = new Date(`${sortedDates[dateIndex]}T00:00:00Z`);
		const diffDays = Math.round(
			(currentDate.getTime() - previousDate.getTime()) / 86_400_000,
		);

		if (diffDays === 1) {
			currentStreak += 1;
			longestStreak = Math.max(longestStreak, currentStreak);
			continue;
		}

		currentStreak = 1;
	}

	return longestStreak;
}

function findPeakDay(
	timeline:
		| readonly {
				date: string;
				sessions: number;
				total_tokens: number;
		  }[]
		| undefined,
) {
	return [...(timeline ?? [])].sort(
		(leftRow, rightRow) =>
			rightRow.total_tokens - leftRow.total_tokens ||
			rightRow.sessions - leftRow.sessions ||
			leftRow.date.localeCompare(rightRow.date),
	)[0];
}

function findTopProject(projects: readonly DeveloperProject[] | undefined) {
	return [...(projects ?? [])].sort(
		(leftRow, rightRow) =>
			rightRow.total_tokens - leftRow.total_tokens ||
			rightRow.sessions - leftRow.sessions ||
			leftRow.project_path.localeCompare(rightRow.project_path),
	)[0];
}

function findTopError(errors: readonly DeveloperError[] | undefined) {
	return [...(errors ?? [])].sort(
		(leftRow, rightRow) =>
			rightRow.occurrences - leftRow.occurrences ||
			leftRow.error_pattern.localeCompare(rightRow.error_pattern),
	)[0];
}

function findCurrentUsageRow(
	usersTokenUsage: readonly UserTokenUsageData[] | undefined,
	userId: string | null,
) {
	if (!userId) {
		return null;
	}

	return usersTokenUsage?.find((row) => row.user_id === userId) ?? null;
}

function findRank<TItem>(
	rows: readonly TItem[] | undefined,
	getValue: (item: TItem) => number,
	isCurrent: (item: TItem) => boolean,
) {
	const sortedRows = [...(rows ?? [])].sort(
		(leftRow, rightRow) => getValue(rightRow) - getValue(leftRow),
	);
	const index = sortedRows.findIndex(isCurrent);

	return index >= 0 ? index + 1 : null;
}

function findOverallRating({
	commitRank,
	sessionRank,
	spendRank,
	successRate,
	tokenRank,
	workspaceSize,
}: WrappedRankSet & {
	successRate: number;
	workspaceSize: number;
}) {
	if (workspaceSize <= 1) {
		return 91;
	}

	function normalizeRank(rank: number | null) {
		if (rank === null) {
			return 0.5;
		}

		return 1 - (rank - 1) / Math.max(1, workspaceSize - 1);
	}

	const weightedScore =
		normalizeRank(tokenRank) * 0.34 +
		normalizeRank(spendRank) * 0.14 +
		normalizeRank(sessionRank) * 0.2 +
		normalizeRank(commitRank) * 0.18 +
		Math.min(1, Math.max(0, successRate / 100)) * 0.14;

	return Math.max(72, Math.min(99, Math.round(72 + weightedScore * 27)));
}

function findSeasonRole({
	longestStreakDays,
	planModeRate,
	subagentsRate,
	successRate,
	tokenRank,
	workspaceSize,
}: {
	longestStreakDays: number;
	planModeRate: number;
	subagentsRate: number;
	successRate: number;
	tokenRank: number | null;
	workspaceSize: number;
}) {
	if (workspaceSize > 1 && tokenRank === 1) {
		return "Tunnel Dominator";
	}

	if (longestStreakDays >= 14) {
		return "Ironman Playmaker";
	}

	if (subagentsRate >= 45) {
		return "Automation Striker";
	}

	if (planModeRate >= 40) {
		return "Systems Captain";
	}

	if (successRate >= 85) {
		return "Clinical Finisher";
	}

	return "All-Action Midfielder";
}

function collectWrappedError(
	queries: readonly { error: unknown; isError: boolean }[],
) {
	return queries.find((query) => query.isError)?.error ?? null;
}

function createWrappedQueryDiagnostic({
	data,
	error,
	isError,
	isPending,
	name,
}: {
	data: unknown;
	error: unknown;
	isError: boolean;
	isPending: boolean;
	name: string;
}) {
	return {
		error,
		errorMessage: getWrappedErrorMessage(error),
		hasData: data !== undefined,
		isError,
		isPending,
		name,
	} satisfies WrappedQueryDiagnostic;
}

export function useFifaWrappedData(): WrappedDataState {
	const { data: session, isPending: isSessionPending } =
		authClient.useSession();
	const { state: workspaceState } = useOrganization();
	const { data: fullOrganization } = useFullOrganization(
		workspaceState.activeOrg?.id ?? undefined,
	);
	const wrappedRange = useMemo(() => getWrappedRange(WRAPPED_DAYS), []);
	const currentUserId = session?.user.id ?? null;

	const developerDetailsQuery = useAnalyticsQuery({
		...orpc.analytics.developers.details.queryOptions({
			input: {
				userId: currentUserId ?? "",
				days: wrappedRange.days,
			},
		}),
		enabled: Boolean(currentUserId),
	});
	const developerFeaturesQuery = useAnalyticsQuery({
		...orpc.analytics.developers.features.queryOptions({
			input: {
				userId: currentUserId ?? "",
				days: wrappedRange.days,
			},
		}),
		enabled: Boolean(currentUserId),
	});
	const developerProjectsQuery = useAnalyticsQuery({
		...orpc.analytics.developers.projects.queryOptions({
			input: {
				userId: currentUserId ?? "",
				days: wrappedRange.days,
			},
		}),
		enabled: Boolean(currentUserId),
	});
	const developerTimelineQuery = useAnalyticsQuery({
		...orpc.analytics.developers.timeline.queryOptions({
			input: {
				userId: currentUserId ?? "",
				days: wrappedRange.days,
			},
		}),
		enabled: Boolean(currentUserId),
	});
	const developerErrorsQuery = useAnalyticsQuery({
		...orpc.analytics.developers.errors.queryOptions({
			input: {
				userId: currentUserId ?? "",
				days: wrappedRange.days,
			},
		}),
		enabled: Boolean(currentUserId),
	});
	const longestSessionQuery = useAnalyticsQuery({
		...orpc.analytics.developers.sessions.queryOptions({
			input: {
				userId: currentUserId ?? "",
				days: wrappedRange.days,
				outcome: "all",
				limit: 1,
				offset: 0,
				sortBy: "duration",
				sortOrder: "desc",
			},
		}),
		enabled: Boolean(currentUserId),
	});
	const biggestSessionQuery = useAnalyticsQuery({
		...orpc.analytics.developers.sessions.queryOptions({
			input: {
				userId: currentUserId ?? "",
				days: wrappedRange.days,
				outcome: "all",
				limit: 1,
				offset: 0,
				sortBy: "tokens",
				sortOrder: "desc",
			},
		}),
		enabled: Boolean(currentUserId),
	});
	const usersTokenUsageQuery = useAnalyticsQuery({
		...orpc.analytics.overview.usersTokenUsage.queryOptions({
			input: {
				startDate: wrappedRange.startDate,
				endDate: wrappedRange.endDate,
			},
		}),
		enabled: Boolean(currentUserId),
	});
	const planModeBreakdownQuery = useAnalyticsQuery({
		...orpc.analytics.sessions.dimensionAnalysis.queryOptions({
			input: {
				days: wrappedRange.days,
				dimension: "used_plan_mode",
				metric: "session_count",
				limit: 4,
				userId: currentUserId ?? undefined,
			},
		}),
		enabled: Boolean(currentUserId),
	});
	const commitBreakdownQuery = useAnalyticsQuery({
		...orpc.analytics.sessions.dimensionAnalysis.queryOptions({
			input: {
				days: wrappedRange.days,
				dimension: "has_commit",
				metric: "session_count",
				limit: 4,
				userId: currentUserId ?? undefined,
			},
		}),
		enabled: Boolean(currentUserId),
	});
	const archetypeBreakdownQuery = useAnalyticsQuery({
		...orpc.analytics.sessions.dimensionAnalysis.queryOptions({
			input: {
				days: wrappedRange.days,
				dimension: "session_archetype",
				metric: "session_count",
				limit: 8,
				userId: currentUserId ?? undefined,
			},
		}),
		enabled: Boolean(currentUserId),
	});
	const diagnostics = useMemo(() => {
		return {
			activeOrgId: workspaceState.activeOrg?.id ?? null,
			currentUserId,
			isSessionPending,
			isWorkspaceLoading: workspaceState.isLoading,
			queries: [
				createWrappedQueryDiagnostic({
					data: developerDetailsQuery.data,
					error: developerDetailsQuery.error,
					isError: developerDetailsQuery.isError,
					isPending: developerDetailsQuery.isPending,
					name: "analytics.developers.details",
				}),
				createWrappedQueryDiagnostic({
					data: developerFeaturesQuery.data,
					error: developerFeaturesQuery.error,
					isError: developerFeaturesQuery.isError,
					isPending: developerFeaturesQuery.isPending,
					name: "analytics.developers.features",
				}),
				createWrappedQueryDiagnostic({
					data: developerProjectsQuery.data,
					error: developerProjectsQuery.error,
					isError: developerProjectsQuery.isError,
					isPending: developerProjectsQuery.isPending,
					name: "analytics.developers.projects",
				}),
				createWrappedQueryDiagnostic({
					data: developerTimelineQuery.data,
					error: developerTimelineQuery.error,
					isError: developerTimelineQuery.isError,
					isPending: developerTimelineQuery.isPending,
					name: "analytics.developers.timeline",
				}),
				createWrappedQueryDiagnostic({
					data: developerErrorsQuery.data,
					error: developerErrorsQuery.error,
					isError: developerErrorsQuery.isError,
					isPending: developerErrorsQuery.isPending,
					name: "analytics.developers.errors",
				}),
				createWrappedQueryDiagnostic({
					data: longestSessionQuery.data,
					error: longestSessionQuery.error,
					isError: longestSessionQuery.isError,
					isPending: longestSessionQuery.isPending,
					name: "analytics.developers.sessions.duration",
				}),
				createWrappedQueryDiagnostic({
					data: biggestSessionQuery.data,
					error: biggestSessionQuery.error,
					isError: biggestSessionQuery.isError,
					isPending: biggestSessionQuery.isPending,
					name: "analytics.developers.sessions.tokens",
				}),
				createWrappedQueryDiagnostic({
					data: usersTokenUsageQuery.data,
					error: usersTokenUsageQuery.error,
					isError: usersTokenUsageQuery.isError,
					isPending: usersTokenUsageQuery.isPending,
					name: "analytics.overview.usersTokenUsage",
				}),
				createWrappedQueryDiagnostic({
					data: planModeBreakdownQuery.data,
					error: planModeBreakdownQuery.error,
					isError: planModeBreakdownQuery.isError,
					isPending: planModeBreakdownQuery.isPending,
					name: "analytics.sessions.dimensionAnalysis.used_plan_mode",
				}),
				createWrappedQueryDiagnostic({
					data: commitBreakdownQuery.data,
					error: commitBreakdownQuery.error,
					isError: commitBreakdownQuery.isError,
					isPending: commitBreakdownQuery.isPending,
					name: "analytics.sessions.dimensionAnalysis.has_commit",
				}),
				createWrappedQueryDiagnostic({
					data: archetypeBreakdownQuery.data,
					error: archetypeBreakdownQuery.error,
					isError: archetypeBreakdownQuery.isError,
					isPending: archetypeBreakdownQuery.isPending,
					name: "analytics.sessions.dimensionAnalysis.session_archetype",
				}),
			],
		} satisfies WrappedDiagnostics;
	}, [
		archetypeBreakdownQuery.data,
		archetypeBreakdownQuery.error,
		archetypeBreakdownQuery.isError,
		archetypeBreakdownQuery.isPending,
		biggestSessionQuery.data,
		biggestSessionQuery.error,
		biggestSessionQuery.isError,
		biggestSessionQuery.isPending,
		commitBreakdownQuery.data,
		commitBreakdownQuery.error,
		commitBreakdownQuery.isError,
		commitBreakdownQuery.isPending,
		currentUserId,
		developerDetailsQuery.data,
		developerDetailsQuery.error,
		developerDetailsQuery.isError,
		developerDetailsQuery.isPending,
		developerErrorsQuery.data,
		developerErrorsQuery.error,
		developerErrorsQuery.isError,
		developerErrorsQuery.isPending,
		developerFeaturesQuery.data,
		developerFeaturesQuery.error,
		developerFeaturesQuery.isError,
		developerFeaturesQuery.isPending,
		developerProjectsQuery.data,
		developerProjectsQuery.error,
		developerProjectsQuery.isError,
		developerProjectsQuery.isPending,
		developerTimelineQuery.data,
		developerTimelineQuery.error,
		developerTimelineQuery.isError,
		developerTimelineQuery.isPending,
		isSessionPending,
		longestSessionQuery.data,
		longestSessionQuery.error,
		longestSessionQuery.isError,
		longestSessionQuery.isPending,
		planModeBreakdownQuery.data,
		planModeBreakdownQuery.error,
		planModeBreakdownQuery.isError,
		planModeBreakdownQuery.isPending,
		usersTokenUsageQuery.data,
		usersTokenUsageQuery.error,
		usersTokenUsageQuery.isError,
		usersTokenUsageQuery.isPending,
		workspaceState.activeOrg?.id,
		workspaceState.isLoading,
	]);

	const story = useMemo(() => {
		const sessionUser = session?.user ?? null;

		if (!currentUserId || !sessionUser || !workspaceState.activeOrg?.id) {
			return null;
		}

		const details = developerDetailsQuery.data;
		const features = developerFeaturesQuery.data;
		const projects = developerProjectsQuery.data;
		const timeline = developerTimelineQuery.data;
		const errors = developerErrorsQuery.data;
		const userUsage = findCurrentUsageRow(
			usersTokenUsageQuery.data,
			currentUserId,
		);
		const organizationMember =
			fullOrganization?.members.find(
				(member) => member.userId === currentUserId,
			) ?? null;

		if (!details || !features) {
			return null;
		}

		const peakDay = findPeakDay(timeline);
		const topProject = findTopProject(projects);
		const topError = findTopError(errors);
		const workspaceRows = usersTokenUsageQuery.data ?? [];
		const tokenRank = findRank(
			workspaceRows,
			(row) => row.total_tokens,
			(row) => row.user_id === currentUserId,
		);
		const spendRank = findRank(
			workspaceRows,
			(row) => row.cost,
			(row) => row.user_id === currentUserId,
		);
		const sessionRank = findRank(
			workspaceRows,
			(row) => row.total_sessions,
			(row) => row.user_id === currentUserId,
		);
		const commitRank = findRank(
			workspaceRows,
			(row) => row.total_commits,
			(row) => row.user_id === currentUserId,
		);
		const longestStreakDays = findLongestStreakDays(timeline);
		const planModeSessions = findBooleanDimensionCount(
			planModeBreakdownQuery.data,
			true,
		);
		const commitSessions = findBooleanDimensionCount(
			commitBreakdownQuery.data,
			true,
		);
		const planModeRate =
			details.total_sessions > 0
				? (planModeSessions / details.total_sessions) * 100
				: 0;
		const commitRate =
			details.total_sessions > 0
				? (commitSessions / details.total_sessions) * 100
				: 0;
		const ranks: WrappedRankSet = {
			commitRank,
			sessionRank,
			spendRank,
			tokenRank,
		};
		const overallRating = findOverallRating({
			...ranks,
			successRate: details.success_rate,
			workspaceSize: workspaceRows.length,
		});
		const firstName =
			organizationMember?.user.name?.trim().split(/\s+/)[0] ??
			sessionUser.name?.trim().split(/\s+/)[0] ??
			"Operator";
		const displayName =
			organizationMember?.user.name?.trim() ||
			sessionUser.name?.trim() ||
			sessionUser.email ||
			"Wrapped Player";

		return {
			commitRate,
			displayName,
			dominantArchetype: findTopDimensionValue(
				archetypeBreakdownQuery.data,
				"Balanced Operator",
			),
			errorCount: details.error_count,
			favoriteModel: details.favorite_model,
			firstName,
			imageUrl: organizationMember?.user.image ?? sessionUser.image ?? null,
			initials: getInitials(displayName),
			lastActiveDate: details.last_active_date,
			longestSessionMin:
				Number(longestSessionQuery.data?.[0]?.duration_min) || 0,
			longestStreakDays,
			modelCount: userUsage?.models_used.length ?? 0,
			modelsUsed: userUsage?.models_used ?? [],
			overallRating,
			peakDayDate: peakDay?.date ?? null,
			peakDaySessions: peakDay?.sessions ?? 0,
			peakDayTokens: peakDay?.total_tokens ?? 0,
			periodEnd: wrappedRange.endDate,
			periodLabel: `${wrappedRange.startDate} -> ${wrappedRange.endDate}`,
			periodStart: wrappedRange.startDate,
			planModeRate,
			primaryErrorPattern: topError?.error_pattern ?? null,
			projectCount:
				userUsage?.repositories_touched.length ?? details.distinct_projects,
			repositoryCount: userUsage?.repositories_touched.length ?? 0,
			seasonRole: findSeasonRole({
				longestStreakDays,
				planModeRate,
				subagentsRate: features.subagents_adoption_rate,
				successRate: details.success_rate,
				tokenRank,
				workspaceSize: workspaceRows.length,
			}),
			sessionCount: details.total_sessions,
			successRate: details.success_rate,
			successRateTrend: details.success_rate_trend,
			topProjectName: topProject?.package_name?.trim()
				? topProject.package_name
				: topProject?.git_remote?.split("/").pop() ||
					topProject?.project_path ||
					"No project logged",
			topProjectSessions: topProject?.sessions ?? 0,
			topProjectTokens: topProject?.total_tokens ?? 0,
			topSessionTokens:
				Number(biggestSessionQuery.data?.[0]?.total_tokens) || 0,
			topSkill: formatTitleLabel(features.top_skills[0]?.name, "Skill issue"),
			topSlashCommand: formatTitleLabel(
				features.top_slash_commands[0]?.name,
				"No slash command",
			),
			topSubagent: formatTitleLabel(
				features.top_subagents[0]?.name,
				"No subagent",
			),
			totalCommits: userUsage?.total_commits ?? 0,
			totalCost: details.cost,
			totalDurationMin: details.total_duration_min,
			totalTokens: details.total_tokens,
			activeDays: details.active_days,
			avgSessionDurationMin: details.avg_session_duration_min,
			distinctProjects: details.distinct_projects,
			distinctSkills: userUsage?.distinct_skills ?? 0,
			distinctSlashCommands: userUsage?.distinct_slash_commands ?? 0,
			featureAdoptionRates: {
				skills: features.skills_adoption_rate,
				slashCommands: features.slash_commands_adoption_rate,
				subagents: features.subagents_adoption_rate,
			},
			ranks,
			repositoriesTouched: userUsage?.repositories_touched ?? [],
			workspaceSize: workspaceRows.length,
		} satisfies FifaWrappedStoryData;
	}, [
		archetypeBreakdownQuery.data,
		biggestSessionQuery.data,
		commitBreakdownQuery.data,
		currentUserId,
		developerDetailsQuery.data,
		developerErrorsQuery.data,
		developerFeaturesQuery.data,
		developerProjectsQuery.data,
		developerTimelineQuery.data,
		fullOrganization?.members,
		longestSessionQuery.data,
		planModeBreakdownQuery.data,
		session?.user,
		workspaceState.activeOrg?.id,
		usersTokenUsageQuery.data,
		wrappedRange.endDate,
		wrappedRange.startDate,
	]);

	const requiredQueryStates = [
		developerDetailsQuery,
		developerFeaturesQuery,
	] as const;
	const isLoading =
		isSessionPending ||
		workspaceState.isLoading ||
		requiredQueryStates.some((query) => query.isPending);
	const error =
		!isSessionPending && !currentUserId
			? createWrappedError("You need an active session to open Wrapped.")
			: !workspaceState.isLoading && !workspaceState.activeOrg?.id
				? createWrappedError("No active workspace is selected.")
				: collectWrappedError(requiredQueryStates);

	return {
		diagnostics,
		error,
		isError: error !== null,
		isLoading,
		story,
	};
}
