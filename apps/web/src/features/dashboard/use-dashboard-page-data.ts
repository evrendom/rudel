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
	const { state } = useDateRange();
	const { state: workspaceState } = useOrganization();
	const { data: fullOrganization } = useFullOrganization(
		workspaceState.activeOrg?.id,
	);
	const { data: roiDashboard } = useAnalyticsQuery(
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
	const performanceUsers = useMemo(
		() =>
			buildDashboardPerformanceUsers(
				usersTokenUsage,
				userImageById,
				fullOrganization?.members ?? [],
			),
		[fullOrganization?.members, userImageById, usersTokenUsage],
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
		isPerformanceChartPending:
			isUsersTokenUsagePending || isUsersDailyTrendPending,
		isRepositoryChartPending: isRepositoriesDailyTrendPending,
		performanceUserDailyTrend: usersDailyTrend,
		performanceUsers,
		repositoryDailyTrend: repositoriesDailyTrend,
		startDate: state.startDate,
		snapshot,
	};
}
