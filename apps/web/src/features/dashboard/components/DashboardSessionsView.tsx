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
import { resolveActiveSessionDateRangeOptionId } from "@/features/sessions/session-date-ranges";
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
	const {
		meta,
		state: { endDate, startDate },
	} = useDateRange();
	const headlineMetrics = useMemo(
		() => buildDashboardSessionTabMetrics(sessionSummaryComparison),
		[sessionSummaryComparison],
	);
	const activeDateRangeOptionId = resolveActiveSessionDateRangeOptionId({
		endDate,
		startDate,
	});
	const { data: snapshotSessions, isPending: isSnapshotSessionsPending } =
		useAnalyticsQuery(
			orpc.analytics.sessions.list.queryOptions({
				input: {
					days: activeDateRangeOptionId === "24-hours" ? 2 : meta.dayCount,
					limit: 1000,
					sortBy: "session_date",
					sortOrder: "desc",
				},
			}),
		);
	const sortedSnapshotSessions = useMemo(
		() =>
			[...(snapshotSessions ?? [])].sort(
				(left: SessionAnalytics, right: SessionAnalytics) =>
					new Date(right.session_date).getTime() -
					new Date(left.session_date).getTime(),
			),
		[snapshotSessions],
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
				endDate={endDate}
				dateRangeDays={meta.dayCount}
				isMetricsPending={isSnapshotPending}
				isSessionsPending={isSnapshotSessionsPending}
				metrics={headlineMetrics}
				sessions={sortedSnapshotSessions}
				showDelta
				startDate={startDate}
				totalSessionCount={
					sessionSummaryComparison?.current.total_sessions ??
					snapshotSessions?.length ??
					0
				}
				useRolling24Hours={activeDateRangeOptionId === "24-hours"}
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
