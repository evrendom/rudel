import { keepPreviousData } from "@tanstack/react-query";
import { useMemo } from "react";
import { useDateRange } from "@/features/analytics/date-range/useDateRange";
import { useAnalyticsQuery } from "@/features/analytics/queries/useAnalyticsQuery";
import {
	type PageViewSection,
	useTrackProductPageView,
} from "@/features/analytics/tracking/useTrackProductPageView";
import { buildDashboardSessionTabMetrics } from "@/features/dashboard/data/dashboard-tab-adapters";
import { resolveActiveSessionDateRangeOptionId } from "@/features/sessions/session-date-ranges";
import { orderSessionsForDisplay } from "@/features/sessions/session-ordering";
import { buildSessionsListQueryInput } from "@/features/sessions/sessions-list-query";
import { orpc } from "@/lib/orpc";

export function useSessionsPageData({
	trackPageView,
}: {
	trackPageView: boolean;
}) {
	const {
		meta,
		state: { endDate, startDate },
	} = useDateRange();
	const activeDateRangeOptionId = resolveActiveSessionDateRangeOptionId({
		endDate,
		startDate,
	});
	const { data: overviewKpis } = useAnalyticsQuery({
		...orpc.analytics.overview.kpis.queryOptions({
			input: { endDate, startDate },
		}),
		refetchOnMount: "always",
		refetchOnReconnect: "always",
		refetchOnWindowFocus: "always",
		staleTime: 0,
	});

	const {
		data: summaryComparison,
		isPending: isSummaryPending,
		isError: isSummaryError,
	} = useAnalyticsQuery({
		...orpc.analytics.sessions.summaryComparison.queryOptions({
			input: { days: meta.dayCount },
		}),
		refetchOnMount: "always",
		refetchOnReconnect: "always",
		refetchOnWindowFocus: "always",
		staleTime: 0,
	});

	const {
		data: snapshotSessionsData,
		isPending: isSnapshotSessionsPending,
		isError: isSnapshotSessionsError,
	} = useAnalyticsQuery({
		...orpc.analytics.sessions.list.queryOptions({
			input: buildSessionsListQueryInput({
				dayCount: meta.dayCount,
				endDate,
				startDate,
			}),
		}),
		refetchOnMount: "always",
		refetchOnReconnect: "always",
		refetchOnWindowFocus: "always",
		placeholderData: keepPreviousData,
		staleTime: 0,
	});

	const headlineMetrics = useMemo(
		() => buildDashboardSessionTabMetrics(summaryComparison),
		[summaryComparison],
	);
	const sessionsSections = useMemo<PageViewSection[]>(
		() => [
			{
				id: "summary_cards",
				state:
					isSummaryError || isSnapshotSessionsError
						? "error"
						: headlineMetrics.length > 0 &&
								(snapshotSessionsData?.length ?? 0) > 0
							? "populated"
							: "empty",
				itemCount: headlineMetrics.length,
			},
		],
		[
			headlineMetrics.length,
			isSnapshotSessionsError,
			isSummaryError,
			snapshotSessionsData,
		],
	);

	useTrackProductPageView({
		isLoading: !trackPageView || isSummaryPending || isSnapshotSessionsPending,
		isError: trackPageView && (isSummaryError || isSnapshotSessionsError),
		hasData: trackPageView && (snapshotSessionsData?.length ?? 0) > 0,
		sections: trackPageView ? sessionsSections : [],
		metrics: trackPageView
			? [
					{
						id: "total_sessions",
						value: summaryComparison?.current.total_sessions,
					},
					{
						id: "avg_session_duration_min",
						value: summaryComparison?.current.avg_session_duration_min,
					},
					{
						id: "avg_response_time_sec",
						value: summaryComparison?.current.avg_response_time_sec,
					},
				]
			: [],
	});

	const useRolling24Hours = activeDateRangeOptionId === "24-hours";
	const rangeSessionCount =
		summaryComparison?.current.total_sessions ??
		snapshotSessionsData?.length ??
		0;
	const orderedSessions = useMemo(
		() =>
			orderSessionsForDisplay({
				sessions: snapshotSessionsData,
				useRolling24Hours,
			}),
		[snapshotSessionsData, useRolling24Hours],
	);

	return {
		dateRangeDays: meta.dayCount,
		endDate,
		headlineMetrics,
		organizationSessionCount: overviewKpis?.total_sessions ?? rangeSessionCount,
		isSnapshotSessionsError,
		isSnapshotSessionsPending,
		isSummaryError,
		isSummaryPending,
		orderedSessions,
		snapshotSessionsData,
		startDate,
		totalSessionCount: rangeSessionCount,
		useRolling24Hours,
	};
}

export type SessionsPageData = ReturnType<typeof useSessionsPageData>;
