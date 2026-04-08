import { useMemo } from "react";
import { useDateRange } from "@/contexts/DateRangeContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import { buildDashboardPerformanceUsers } from "@/features/dashboard/data/dashboard-performance-adapter";
import { mergeDashboardSnapshotWithRoi } from "@/features/dashboard/data/dashboard-roi-adapter";
import { createDashboardOutputSnapshot } from "@/features/dashboard/data/dashboard-static-data";
import { useAnalyticsQuery } from "@/hooks/useAnalyticsQuery";
import { useFullOrganization } from "@/hooks/useFullOrganization";
import { orpc } from "@/lib/orpc";

export function useDashboardHomeData() {
	const { activeOrg } = useOrganization();
	const { endDate, startDate } = useDateRange();
	const { data: fullOrganization } = useFullOrganization(activeOrg?.id);
	const roiDashboardQuery = useAnalyticsQuery(
		orpc.analytics.roi.dashboard.queryOptions({
			input: { startDate, endDate },
		}),
	);
	const usersTokenUsageQuery = useAnalyticsQuery(
		orpc.analytics.overview.usersTokenUsage.queryOptions({
			input: { startDate, endDate },
		}),
	);
	const usersDailyTrendQuery = useAnalyticsQuery(
		orpc.analytics.overview.usersDailyTrend.queryOptions({
			input: { startDate, endDate },
		}),
	);
	const repositoriesDailyTrendQuery = useAnalyticsQuery(
		orpc.analytics.overview.repositoriesDailyTrend.queryOptions({
			input: { startDate, endDate },
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
				usersTokenUsageQuery.data,
				usersDailyTrendQuery.data,
				userImageById,
				fullOrganization?.members ?? [],
			),
		[
			fullOrganization?.members,
			userImageById,
			usersDailyTrendQuery.data,
			usersTokenUsageQuery.data,
		],
	);

	const snapshot = useMemo(() => {
		const baseSnapshot = createDashboardOutputSnapshot(startDate, endDate);

		return mergeDashboardSnapshotWithRoi(baseSnapshot, roiDashboardQuery.data);
	}, [endDate, roiDashboardQuery.data, startDate]);

	return {
		endDate,
		isDashboardSnapshotPending: roiDashboardQuery.isPending,
		isPerformanceChartPending:
			usersTokenUsageQuery.isPending || usersDailyTrendQuery.isPending,
		isRepositoryChartPending: repositoriesDailyTrendQuery.isPending,
		performanceUserDailyTrend: usersDailyTrendQuery.data,
		performanceUsers,
		repositoryDailyTrend: repositoriesDailyTrendQuery.data,
		snapshot,
		startDate,
	};
}
