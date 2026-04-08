import type {
	RepositoryDailyTrendData,
	SessionAnalyticsSummaryComparison,
	UserDailyTrendData,
} from "@rudel/api-routes";
import { useMemo } from "react";
import { useDateRange } from "@/features/analytics/date-range/useDateRange";
import { useAnalyticsQuery } from "@/features/analytics/queries/useAnalyticsQuery";
import { DashboardDeveloperPanel } from "@/features/dashboard/components/DashboardDeveloperPanel";
import { DashboardRepositoryPanel } from "@/features/dashboard/components/DashboardRepositoryPanel";
import { DashboardSessionsSnapshotSection } from "@/features/dashboard/components/DashboardSessionsSnapshotSection";
import type { DashboardPerformanceUserComparison } from "@/features/dashboard/data/dashboard-performance-adapter";
import type { DashboardRankedOutputRow } from "@/features/dashboard/data/dashboard-static-data";
import { buildDashboardSessionTabMetrics } from "@/features/dashboard/data/dashboard-tab-adapters";
import { orpc } from "@/lib/orpc";

export function DashboardSessionsView({
	isDeveloperChartPending,
	isRepositoryChartPending,
	performanceUserDailyTrend,
	performanceUsers,
	repositories,
	repositoryDailyTrend,
	sessionSummaryComparison,
}: {
	isDeveloperChartPending: boolean;
	isRepositoryChartPending: boolean;
	performanceUserDailyTrend: UserDailyTrendData[] | undefined;
	performanceUsers: DashboardPerformanceUserComparison[];
	repositories: DashboardRankedOutputRow[];
	repositoryDailyTrend: RepositoryDailyTrendData[] | undefined;
	sessionSummaryComparison: SessionAnalyticsSummaryComparison | undefined;
}) {
	const { meta, state } = useDateRange();
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
					endDate: state.endDate,
					limit: 10,
					startDate: state.startDate,
					sortBy: "session_date",
					sortOrder: "desc",
				},
			}),
		);

	const sortedRecentSessions = useMemo(
		() =>
			[...(recentSessions ?? [])].sort(
				(left, right) =>
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
				isRecentSessionsPending={isRecentSessionsPending}
				metrics={headlineMetrics}
				recentSessions={sortedRecentSessions}
				showDelta
			/>
			<DashboardDeveloperPanel
				isChartPending={isDeveloperChartPending}
				performanceUserDailyTrend={performanceUserDailyTrend}
				performanceUsers={performanceUsers}
			/>
			<DashboardRepositoryPanel
				isChartPending={isRepositoryChartPending}
				repositories={repositories}
				repositoryDailyTrend={repositoryDailyTrend}
			/>
		</section>
	);
}
