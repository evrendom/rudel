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
import { useOrganization } from "@/features/workspace/organization/useOrganization";
import { useFullOrganization } from "@/hooks/useFullOrganization";
import { orpc } from "@/lib/orpc";

export function useDashboardPageData() {
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
		enabled: !useFixtures,
	});
	const usersTokenUsageQuery = useAnalyticsQuery({
		...orpc.analytics.overview.usersTokenUsage.queryOptions({
			input: {
				startDate: state.startDate,
				endDate: state.endDate,
			},
		}),
		enabled: !useFixtures,
	});
	const modelTokensTrendQuery = useAnalyticsQuery({
		...orpc.analytics.overview.modelTokensTrend.queryOptions({
			input: {
				startDate: state.startDate,
				endDate: state.endDate,
			},
		}),
		enabled: !useFixtures,
	});
	const usersDailyTrendQuery = useAnalyticsQuery({
		...orpc.analytics.overview.usersDailyTrend.queryOptions({
			input: {
				startDate: state.startDate,
				endDate: state.endDate,
			},
		}),
		enabled: !useFixtures,
	});
	const repositoriesDailyTrendQuery = useAnalyticsQuery({
		...orpc.analytics.overview.repositoriesDailyTrend.queryOptions({
			input: {
				startDate: state.startDate,
				endDate: state.endDate,
			},
		}),
		enabled: !useFixtures,
	});
	const errorDashboardQuery = useAnalyticsQuery({
		...orpc.analytics.errors.dashboard.queryOptions({
			input: {
				startDate: state.startDate,
				endDate: state.endDate,
			},
		}),
		enabled: !useFixtures,
	});
	const errorProjectTrendQuery = useAnalyticsQuery({
		...orpc.analytics.errors.trends.queryOptions({
			input: {
				startDate: state.startDate,
				endDate: state.endDate,
				splitBy: "project_path",
			},
		}),
		enabled: !useFixtures,
	});
	const errorDeveloperTrendQuery = useAnalyticsQuery({
		...orpc.analytics.errors.trends.queryOptions({
			input: {
				startDate: state.startDate,
				endDate: state.endDate,
				splitBy: "user_id",
			},
		}),
		enabled: !useFixtures,
	});
	const sessionSummaryComparisonQuery = useAnalyticsQuery({
		...orpc.analytics.sessions.summaryComparison.queryOptions({
			input: {
				days: meta.dayCount,
			},
		}),
		enabled: !useFixtures,
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
		isDashboardSnapshotPending: !useFixtures && roiDashboardQuery.isPending,
		isPerformanceChartPending:
			!useFixtures &&
			(usersTokenUsageQuery.isPending || usersDailyTrendQuery.isPending),
		isOverviewKpisPending: !useFixtures && overviewKpisQuery.isPending,
		isTokenChartPending:
			!useFixtures &&
			(usersTokenUsageQuery.isPending ||
				usersDailyTrendQuery.isPending ||
				modelTokensTrendQuery.isPending),
		isSessionSnapshotPending:
			!useFixtures && sessionSummaryComparisonQuery.isPending,
		isRepositoryChartPending:
			!useFixtures && repositoriesDailyTrendQuery.isPending,
		isErrorDashboardPending:
			!useFixtures &&
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
