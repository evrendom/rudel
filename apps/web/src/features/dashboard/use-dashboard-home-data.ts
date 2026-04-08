import { useDateRange } from "@/contexts/DateRangeContext";
import { useAnalyticsQuery } from "@/hooks/useAnalyticsQuery";
import { orpc } from "@/lib/orpc";

export function useDashboardHomeData() {
	const { endDate, startDate } = useDateRange();
	const kpisQuery = useAnalyticsQuery(
		orpc.analytics.overview.kpis.queryOptions({
			input: { startDate, endDate },
		}),
	);
	const usageTrendQuery = useAnalyticsQuery(
		orpc.analytics.overview.usageTrend.queryOptions({
			input: { startDate, endDate },
		}),
	);
	const modelTokensQuery = useAnalyticsQuery(
		orpc.analytics.overview.modelTokensTrend.queryOptions({
			input: { startDate, endDate },
		}),
	);
	const insightsQuery = useAnalyticsQuery(
		orpc.analytics.overview.insights.queryOptions({
			input: { startDate, endDate },
		}),
	);

	return {
		endDate,
		hasAnySessions: (kpisQuery.data?.total_sessions ?? 0) > 0,
		hasData: (kpisQuery.data?.distinct_sessions ?? 0) > 0,
		insights: insightsQuery.data ?? [],
		insightsError: insightsQuery.isError,
		insightsLoading: insightsQuery.isPending,
		kpis: kpisQuery.data,
		kpisError: kpisQuery.isError,
		kpisLoading: kpisQuery.isPending,
		kpisQueryError: kpisQuery.error,
		modelTokensData: modelTokensQuery.data ?? [],
		modelTokensError: modelTokensQuery.isError,
		modelTokensLoading: modelTokensQuery.isPending,
		startDate,
		usageTrendData: usageTrendQuery.data ?? [],
		usageTrendError: usageTrendQuery.isError,
		usageTrendLoading: usageTrendQuery.isPending,
	};
}
