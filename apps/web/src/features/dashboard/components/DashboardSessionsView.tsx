import type {
	RepositoryDailyTrendData,
	SessionAnalytics,
	SessionAnalyticsSummaryComparison,
} from "@rudel/api-routes";
import { useMemo } from "react";
import { useDateRange } from "@/features/analytics/date-range/useDateRange";
import { useAnalyticsQuery } from "@/features/analytics/queries/useAnalyticsQuery";
import { DashboardRepositoryPanel } from "@/features/dashboard/components/DashboardRepositoryPanel";
import { DashboardSessionPanel } from "@/features/dashboard/components/DashboardSessionPanel";
import { DashboardSessionsSnapshotSection } from "@/features/dashboard/components/DashboardSessionsSnapshotSection";
import type { DashboardRankedOutputRow } from "@/features/dashboard/data/dashboard-static-data";
import { buildDashboardSessionTabMetrics } from "@/features/dashboard/data/dashboard-tab-adapters";
import { orpc } from "@/lib/orpc";

export function DashboardSessionsView({
	endDate,
	isRepositoryChartPending,
	isSnapshotPending = false,
	repositories,
	repositoryDailyTrend,
	startDate,
	sessionSummaryComparison,
}: {
	endDate: string;
	isRepositoryChartPending: boolean;
	isSnapshotPending?: boolean;
	repositories: DashboardRankedOutputRow[];
	repositoryDailyTrend: RepositoryDailyTrendData[] | undefined;
	startDate: string;
	sessionSummaryComparison: SessionAnalyticsSummaryComparison | undefined;
}) {
	const { meta } = useDateRange();
	const timezone = useMemo(
		() => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
		[],
	);
	const headlineMetrics = useMemo(
		() => buildDashboardSessionTabMetrics(sessionSummaryComparison),
		[sessionSummaryComparison],
	);

	const {
		data: sessionHourlyActivity,
		isPending: isSessionHourlyActivityPending,
	} = useAnalyticsQuery(
		orpc.analytics.sessions.hourlyActivity.queryOptions({
			input: {
				days: meta.dayCount,
				timezone,
			},
		}),
	);
	const { data: recentSessions, isPending: isRecentSessionsPending } =
		useAnalyticsQuery(
			orpc.analytics.sessions.list.queryOptions({
				input: {
					endDate,
					limit: 10,
					startDate,
					sortBy: "session_date",
					sortOrder: "desc",
				},
			}),
		);
	const sortedRecentSessions = useMemo(
		() =>
			[...(recentSessions ?? [])].sort(
				(left: SessionAnalytics, right: SessionAnalytics) =>
					new Date(right.session_date).getTime() -
					new Date(left.session_date).getTime(),
			),
		[recentSessions],
	);
	return (
		<section className="@container/sessions-view flex flex-col gap-8">
			<DashboardSessionsSnapshotSection
				hourlyActivity={sessionHourlyActivity}
				isHourlyActivityPending={isSessionHourlyActivityPending}
				isMetricsPending={isSnapshotPending}
				metrics={headlineMetrics}
				showDelta
			/>
			<DashboardSessionPanel
				isLoading={isRecentSessionsPending}
				sessions={sortedRecentSessions}
				totalSessionCount={
					sessionSummaryComparison?.current.total_sessions ??
					recentSessions?.length ??
					0
				}
			/>
			<DashboardRepositoryPanel
				isChartPending={isRepositoryChartPending}
				repositories={repositories}
				repositoryDailyTrend={repositoryDailyTrend}
				variant="sessions"
			/>
		</section>
	);
}
