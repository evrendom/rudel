import type {
	RepositoryDailyTrendData,
	SessionAnalytics,
	SessionAnalyticsSummaryComparison,
} from "@rudel/api-routes";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { appRoutes } from "@/app/routes";
import { useDateRange } from "@/features/analytics/date-range/useDateRange";
import { useAnalyticsQuery } from "@/features/analytics/queries/useAnalyticsQuery";
import { DashboardRepositoryPanel } from "@/features/dashboard/components/DashboardRepositoryPanel";
import { DashboardSessionsSnapshotSection } from "@/features/dashboard/components/DashboardSessionsSnapshotSection";
import type { DashboardRankedOutputRow } from "@/features/dashboard/data/dashboard-static-data";
import { buildDashboardSessionTabMetrics } from "@/features/dashboard/data/dashboard-tab-adapters";
import { orpc } from "@/lib/orpc";

export function DashboardSessionsView({
	isRepositoryChartPending,
	isSnapshotPending = false,
	repositories,
	repositoryDailyTrend,
	sessionSummaryComparison,
}: {
	isRepositoryChartPending: boolean;
	isSnapshotPending?: boolean;
	repositories: DashboardRankedOutputRow[];
	repositoryDailyTrend: RepositoryDailyTrendData[] | undefined;
	sessionSummaryComparison: SessionAnalyticsSummaryComparison | undefined;
}) {
	const { meta } = useDateRange();
	const headlineMetrics = useMemo(
		() => buildDashboardSessionTabMetrics(sessionSummaryComparison),
		[sessionSummaryComparison],
	);
	const { data: recentSessions, isPending: isRecentSessionsPending } =
		useAnalyticsQuery(
			orpc.analytics.sessions.list.queryOptions({
				input: {
					days: meta.dayCount,
					limit: 10,
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
			<div className="flex justify-end px-1">
				<Link
					to={appRoutes.dashboardSessions()}
					className="dashboardy-action-button inline-flex h-8 items-center rounded-full border border-[color:var(--dashboardy-border)] bg-transparent px-3 text-[13px] font-medium text-[color:var(--dashboardy-heading)] shadow-none"
				>
					Open full sessions view
				</Link>
			</div>
			<DashboardSessionsSnapshotSection
				isMetricsPending={isSnapshotPending}
				isSessionsPending={isRecentSessionsPending}
				metrics={headlineMetrics}
				recentSessions={sortedRecentSessions}
				showDelta
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
