import { useMemo } from "react";
import { useDateRange } from "@/contexts/DateRangeContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import { buildDashboardPerformanceUsers } from "@/features/dashboard/data/dashboard-performance-adapter";
import { useAnalyticsQuery } from "@/hooks/useAnalyticsQuery";
import { useFullOrganization } from "@/hooks/useFullOrganization";
import { orpc } from "@/lib/orpc";

type UseDashboardTokensDataOptions = {
	enabled?: boolean;
};

export function useDashboardTokensData(
	options: UseDashboardTokensDataOptions = {},
) {
	const { activeOrg } = useOrganization();
	const { endDate, startDate } = useDateRange();
	const { data: fullOrganization } = useFullOrganization(activeOrg?.id);
	const isEnabled = options.enabled ?? true;

	const usersTokenUsageQuery = useAnalyticsQuery({
		...orpc.analytics.overview.usersTokenUsage.queryOptions({
			input: { endDate, startDate },
		}),
		enabled: isEnabled,
	});
	const modelTokensTrendQuery = useAnalyticsQuery({
		...orpc.analytics.overview.modelTokensTrend.queryOptions({
			input: { endDate, startDate },
		}),
		enabled: isEnabled,
	});
	const usersDailyTrendQuery = useAnalyticsQuery({
		...orpc.analytics.overview.usersDailyTrend.queryOptions({
			input: { endDate, startDate },
		}),
		enabled: isEnabled,
	});

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

	return {
		endDate,
		isDeveloperChartPending:
			usersTokenUsageQuery.isPending || usersDailyTrendQuery.isPending,
		isSnapshotPending:
			usersTokenUsageQuery.isPending ||
			usersDailyTrendQuery.isPending ||
			modelTokensTrendQuery.isPending,
		modelTokensTrend: modelTokensTrendQuery.data,
		performanceUserDailyTrend: usersDailyTrendQuery.data,
		performanceUsers,
		startDate,
		usersTokenUsage: usersTokenUsageQuery.data,
	};
}
