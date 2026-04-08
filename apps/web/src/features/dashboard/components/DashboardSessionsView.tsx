import type {
	RepositoryDailyTrendData,
	SessionAnalytics,
	SessionAnalyticsSummaryComparison,
} from "@rudel/api-routes";
import { useMemo } from "react";
import { DashboardRepositoryPanel } from "@/features/dashboard/components/DashboardRepositoryPanel";
import { DashboardSessionsSnapshotSection } from "@/features/dashboard/components/DashboardSessionsSnapshotSection";
import { buildDashboardSessionTabMetrics } from "@/features/dashboard/data/dashboard-session-adapters";
import type { DashboardRankedOutputRow } from "@/features/dashboard/data/dashboard-static-data";

export function DashboardSessionsView({
	isRepositoryChartPending,
	isRecentSessionsPending,
	isSnapshotPending = false,
	recentSessions,
	repositories,
	repositoryDailyTrend,
	sessionSummaryComparison,
}: {
	isRepositoryChartPending: boolean;
	isRecentSessionsPending: boolean;
	isSnapshotPending?: boolean;
	recentSessions: SessionAnalytics[] | undefined;
	repositories: DashboardRankedOutputRow[];
	repositoryDailyTrend: RepositoryDailyTrendData[] | undefined;
	sessionSummaryComparison: SessionAnalyticsSummaryComparison | undefined;
}) {
	const headlineMetrics = useMemo(
		() => buildDashboardSessionTabMetrics(sessionSummaryComparison),
		[sessionSummaryComparison],
	);

	return (
		<section className="@container/sessions-view flex flex-col gap-8">
			<DashboardSessionsSnapshotSection
				isMetricsPending={isSnapshotPending}
				isSessionsPending={isRecentSessionsPending}
				metrics={headlineMetrics}
				recentSessions={recentSessions}
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
