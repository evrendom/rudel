import { useMemo } from "react";
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
	const { data: fullOrganization } = useFullOrganization(
		workspaceState.activeOrg?.id,
	);
	const { data: overviewKpis, isPending: isOverviewKpisPending } =
		useAnalyticsQuery(
			orpc.analytics.overview.kpis.queryOptions({
				input: {
					startDate: state.startDate,
					endDate: state.endDate,
				},
			}),
		);
	const { data: roiDashboard, isPending: isRoiDashboardPending } =
		useAnalyticsQuery(
			orpc.analytics.roi.dashboard.queryOptions({
				input: {
					startDate: state.startDate,
					endDate: state.endDate,
				},
			}),
		);
	const { data: usersTokenUsage, isPending: isUsersTokenUsagePending } =
		useAnalyticsQuery(
			orpc.analytics.overview.usersTokenUsage.queryOptions({
				input: {
					startDate: state.startDate,
					endDate: state.endDate,
				},
			}),
		);
	const { data: modelTokensTrend, isPending: isModelTokensTrendPending } =
		useAnalyticsQuery(
			orpc.analytics.overview.modelTokensTrend.queryOptions({
				input: {
					startDate: state.startDate,
					endDate: state.endDate,
				},
			}),
		);
	const { data: usersDailyTrend, isPending: isUsersDailyTrendPending } =
		useAnalyticsQuery(
			orpc.analytics.overview.usersDailyTrend.queryOptions({
				input: {
					startDate: state.startDate,
					endDate: state.endDate,
				},
			}),
		);
	const {
		data: repositoriesDailyTrend,
		isPending: isRepositoriesDailyTrendPending,
	} = useAnalyticsQuery(
		orpc.analytics.overview.repositoriesDailyTrend.queryOptions({
			input: {
				startDate: state.startDate,
				endDate: state.endDate,
			},
		}),
	);
	const { data: errorDashboard, isPending: isErrorDashboardPending } =
		useAnalyticsQuery(
			orpc.analytics.errors.dashboard.queryOptions({
				input: {
					startDate: state.startDate,
					endDate: state.endDate,
				},
			}),
		);
	const { data: errorProjectTrend, isPending: isErrorProjectTrendPending } =
		useAnalyticsQuery(
			orpc.analytics.errors.trends.queryOptions({
				input: {
					startDate: state.startDate,
					endDate: state.endDate,
					splitBy: "project_path",
				},
			}),
		);
	const { data: errorDeveloperTrend, isPending: isErrorDeveloperTrendPending } =
		useAnalyticsQuery(
			orpc.analytics.errors.trends.queryOptions({
				input: {
					startDate: state.startDate,
					endDate: state.endDate,
					splitBy: "user_id",
				},
			}),
		);
	const {
		data: sessionSummaryComparison,
		isPending: isSessionSummaryComparisonPending,
	} = useAnalyticsQuery(
		orpc.analytics.sessions.summaryComparison.queryOptions({
			input: {
				days: meta.dayCount,
			},
		}),
	);
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
		isDashboardSnapshotPending: isRoiDashboardPending,
		isPerformanceChartPending:
			isUsersTokenUsagePending || isUsersDailyTrendPending,
		isOverviewKpisPending,
		isTokenChartPending:
			isUsersTokenUsagePending ||
			isUsersDailyTrendPending ||
			isModelTokensTrendPending,
		isSessionSnapshotPending: isSessionSummaryComparisonPending,
		isRepositoryChartPending: isRepositoriesDailyTrendPending,
		isErrorDashboardPending:
			isErrorDashboardPending ||
			isErrorProjectTrendPending ||
			isErrorDeveloperTrendPending,
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
