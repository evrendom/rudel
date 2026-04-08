import type { SessionAnalytics } from "@rudel/api-routes";
import { useMemo } from "react";
import { useDateRange } from "@/contexts/DateRangeContext";
import { useAnalyticsQuery } from "@/hooks/useAnalyticsQuery";
import { orpc } from "@/lib/orpc";

type UseDashboardSessionsDataOptions = {
	enabled?: boolean;
};

export function useDashboardSessionsData(
	options: UseDashboardSessionsDataOptions = {},
) {
	const { calculateDays, endDate, startDate } = useDateRange();
	const isEnabled = options.enabled ?? true;

	const summaryComparisonQuery = useAnalyticsQuery({
		...orpc.analytics.sessions.summaryComparison.queryOptions({
			input: {
				days: calculateDays(),
			},
		}),
		enabled: isEnabled,
	});
	const recentSessionsQuery = useAnalyticsQuery({
		...orpc.analytics.sessions.list.queryOptions({
			input: {
				endDate,
				limit: 10,
				startDate,
				sortBy: "session_date",
				sortOrder: "desc",
			},
		}),
		enabled: isEnabled,
	});

	const recentSessions = useMemo(
		() =>
			[...(recentSessionsQuery.data ?? [])].sort(
				(left: SessionAnalytics, right: SessionAnalytics) =>
					new Date(right.session_date).getTime() -
					new Date(left.session_date).getTime(),
			),
		[recentSessionsQuery.data],
	);

	return {
		isRecentSessionsPending: recentSessionsQuery.isPending,
		isSessionSummaryPending: summaryComparisonQuery.isPending,
		recentSessions,
		sessionSummaryComparison: summaryComparisonQuery.data,
	};
}
