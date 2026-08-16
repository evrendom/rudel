import { useMemo } from "react";
import {
	announceFrontendFixturesEnabled,
	buildDashboardFixtureData,
	type FrontendFixtureMember,
	isFrontendFixturesEnabled,
} from "@/dev/frontend-fixtures";
import { useDateRange } from "@/features/analytics/date-range/useDateRange";
import { useAnalyticsQuery } from "@/features/analytics/queries/useAnalyticsQuery";
import { buildDashboardPerformanceUsers } from "@/features/dashboard/data/dashboard-performance-adapter";
import { mergeDashboardSnapshotWithRoi } from "@/features/dashboard/data/dashboard-roi-adapter";
import { createDashboardOutputSnapshot } from "@/features/dashboard/data/dashboard-static-data";
import { useFullOrganization } from "@/features/workspace/hooks/useFullOrganization";
import { useOrganization } from "@/features/workspace/organization/useOrganization";
import { orpc } from "@/lib/orpc";

export type DashboardView =
	| "tokens"
	| "commits"
	| "errors"
	| "repos"
	| "sessions";

export function getDashboardQueryRequirements(activeView: DashboardView) {
	const performance =
		activeView === "tokens" ||
		activeView === "commits" ||
		activeView === "repos";
	const repositoryTrend =
		activeView === "commits" ||
		activeView === "repos" ||
		activeView === "sessions";

	return {
		errors: activeView === "errors",
		modelTokens: activeView === "tokens",
		performance,
		repositoryTrend,
		roi: repositoryTrend,
		sessionSummary: activeView === "sessions",
	};
}

export function useDashboardPageData(activeView: DashboardView) {
	const { meta, state } = useDateRange();
	const { state: workspaceState } = useOrganization();
	const useFixtures = isFrontendFixturesEnabled();
	announceFrontendFixturesEnabled("dashboard");
	const { data: fullOrganization } = useFullOrganization(
		workspaceState.activeOrg?.id,
	);
	const fixtureMembers = useMemo<FrontendFixtureMember[]>(
		() =>
			(fullOrganization?.members ?? []).map((member) => ({
				displayName:
					member.user.name?.trim() ||
					member.user.email?.trim() ||
					member.userId,
				email: member.user.email,
				imageUrl: member.user.image,
				userId: member.userId,
			})),
		[fullOrganization?.members],
	);
	const fixtureData = useMemo(
		() =>
			useFixtures
				? buildDashboardFixtureData({
						endDate: state.endDate,
						members: fixtureMembers,
						startDate: state.startDate,
					})
				: null,
		[fixtureMembers, state.endDate, state.startDate, useFixtures],
	);
	const requirements = getDashboardQueryRequirements(activeView);
	const overviewKpisQuery = useAnalyticsQuery({
		...orpc.analytics.overview.kpis.queryOptions({
			input: {
				startDate: state.startDate,
				endDate: state.endDate,
			},
		}),
		enabled: !useFixtures,
	});
	const roiDashboardQuery = useAnalyticsQuery({
		...orpc.analytics.roi.dashboard.queryOptions({
			input: {
				startDate: state.startDate,
				endDate: state.endDate,
			},
		}),
		enabled: !useFixtures && requirements.roi,
	});
	const usersTokenUsageQuery = useAnalyticsQuery({
		...orpc.analytics.overview.usersTokenUsage.queryOptions({
			input: {
				startDate: state.startDate,
				endDate: state.endDate,
			},
		}),
		enabled: !useFixtures && requirements.performance,
	});
	const modelTokensTrendQuery = useAnalyticsQuery({
		...orpc.analytics.overview.modelTokensTrend.queryOptions({
			input: {
				startDate: state.startDate,
				endDate: state.endDate,
			},
		}),
		enabled: !useFixtures && requirements.modelTokens,
	});
	const usersDailyTrendQuery = useAnalyticsQuery({
		...orpc.analytics.overview.usersDailyTrend.queryOptions({
			input: {
				startDate: state.startDate,
				endDate: state.endDate,
			},
		}),
		enabled: !useFixtures && requirements.performance,
	});
	const repositoriesDailyTrendQuery = useAnalyticsQuery({
		...orpc.analytics.overview.repositoriesDailyTrend.queryOptions({
			input: {
				startDate: state.startDate,
				endDate: state.endDate,
			},
		}),
		enabled: !useFixtures && requirements.repositoryTrend,
	});
	const errorDashboardQuery = useAnalyticsQuery({
		...orpc.analytics.errors.dashboard.queryOptions({
			input: {
				startDate: state.startDate,
				endDate: state.endDate,
			},
		}),
		enabled: !useFixtures && requirements.errors,
	});
	const errorProjectTrendQuery = useAnalyticsQuery({
		...orpc.analytics.errors.trends.queryOptions({
			input: {
				startDate: state.startDate,
				endDate: state.endDate,
				splitBy: "project_path",
			},
		}),
		enabled: !useFixtures && requirements.errors,
	});
	const errorDeveloperTrendQuery = useAnalyticsQuery({
		...orpc.analytics.errors.trends.queryOptions({
			input: {
				startDate: state.startDate,
				endDate: state.endDate,
				splitBy: "user_id",
			},
		}),
		enabled: !useFixtures && requirements.errors,
	});
	const sessionSummaryComparisonQuery = useAnalyticsQuery({
		...orpc.analytics.sessions.summaryComparison.queryOptions({
			input: {
				days: meta.dayCount,
			},
		}),
		enabled: !useFixtures && requirements.sessionSummary,
	});
	const overviewKpis = fixtureData?.overviewKpis ?? overviewKpisQuery.data;
	const roiDashboard = fixtureData?.roiDashboard ?? roiDashboardQuery.data;
	const usersTokenUsage =
		fixtureData?.usersTokenUsage ?? usersTokenUsageQuery.data;
	const modelTokensTrend =
		fixtureData?.modelTokensTrend ?? modelTokensTrendQuery.data;
	const usersDailyTrend =
		fixtureData?.usersDailyTrend ?? usersDailyTrendQuery.data;
	const repositoriesDailyTrend =
		fixtureData?.repositoriesDailyTrend ?? repositoriesDailyTrendQuery.data;
	const errorDashboard =
		fixtureData?.errorDashboard ?? errorDashboardQuery.data;
	const errorProjectTrend =
		fixtureData?.errorProjectTrend ?? errorProjectTrendQuery.data;
	const errorDeveloperTrend =
		fixtureData?.errorDeveloperTrend ?? errorDeveloperTrendQuery.data;
	const sessionSummaryComparison =
		fixtureData?.sessionSummaryComparison ?? sessionSummaryComparisonQuery.data;
	const userImageById = useMemo(
		() =>
			new Map(
				(fullOrganization?.members ?? []).map((member) => [
					member.userId,
					member.user.image,
				]),
			),
		[fullOrganization?.members],
	);
	const userLabelById = useMemo(
		() =>
			new Map(
				(fullOrganization?.members ?? []).map((member) => [
					member.userId,
					member.user.name?.trim() ||
						member.user.email?.trim() ||
						member.userId,
				]),
			),
		[fullOrganization?.members],
	);
	const performanceUsers = useMemo(
		() =>
			buildDashboardPerformanceUsers(
				usersTokenUsage,
				usersDailyTrend,
				userImageById,
				fullOrganization?.members ?? [],
			),
		[
			fullOrganization?.members,
			userImageById,
			usersDailyTrend,
			usersTokenUsage,
		],
	);
	const baseSnapshot = useMemo(
		() => createDashboardOutputSnapshot(state.startDate, state.endDate),
		[state.startDate, state.endDate],
	);
	const snapshot = useMemo(
		() => mergeDashboardSnapshotWithRoi(baseSnapshot, roiDashboard),
		[baseSnapshot, roiDashboard],
	);

	return {
		endDate: state.endDate,
		isDashboardSnapshotPending:
			!useFixtures && requirements.roi && roiDashboardQuery.isPending,
		isPerformanceChartPending:
			!useFixtures &&
			requirements.performance &&
			(usersTokenUsageQuery.isPending || usersDailyTrendQuery.isPending),
		isOverviewKpisPending: !useFixtures && overviewKpisQuery.isPending,
		isTokenChartPending:
			!useFixtures &&
			requirements.modelTokens &&
			(usersTokenUsageQuery.isPending ||
				usersDailyTrendQuery.isPending ||
				modelTokensTrendQuery.isPending),
		isSessionSnapshotPending:
			!useFixtures &&
			requirements.sessionSummary &&
			sessionSummaryComparisonQuery.isPending,
		isRepositoryChartPending:
			!useFixtures &&
			requirements.repositoryTrend &&
			repositoriesDailyTrendQuery.isPending,
		isErrorDashboardPending:
			!useFixtures &&
			requirements.errors &&
			(errorDashboardQuery.isPending ||
				errorProjectTrendQuery.isPending ||
				errorDeveloperTrendQuery.isPending),
		errorDashboard,
		errorProjectTrend,
		errorDeveloperTrend,
		modelTokensTrend,
		performanceUserDailyTrend: usersDailyTrend,
		performanceUsers,
		repositoryDailyTrend: repositoriesDailyTrend,
		sessionSummaryComparison,
		startDate: state.startDate,
		snapshot,
		totalSessionCount: overviewKpis?.total_sessions,
		userLabelById,
		usersTokenUsage,
	};
}
