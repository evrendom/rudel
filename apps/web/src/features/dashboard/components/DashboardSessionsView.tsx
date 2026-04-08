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
import {
	buildDashboardDailyPatternFromUserTrend,
	buildDashboardSessionTabMetrics,
} from "@/features/dashboard/data/dashboard-tab-adapters";
import { orpc } from "@/lib/orpc";

export function DashboardSessionsView({
	isDeveloperChartPending,
	isRepositoryChartPending,
	isSnapshotPending = false,
	performanceUserDailyTrend,
	performanceUsers,
	repositories,
	repositoryDailyTrend,
	sessionSummaryComparison,
}: {
	isDeveloperChartPending: boolean;
	isRepositoryChartPending: boolean;
	isSnapshotPending?: boolean;
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
	const dailyPattern = useMemo(
		() =>
			buildDashboardDailyPatternFromUserTrend(
				state.startDate,
				state.endDate,
				performanceUserDailyTrend,
			),
		[performanceUserDailyTrend, state.endDate, state.startDate],
	);

	return (
		<section className="@container/sessions-view flex flex-col gap-8">
			<DashboardSessionsSnapshotSection
				dailyPattern={dailyPattern}
				hourlyActivity={sessionHourlyActivity}
				isHourlyActivityPending={isSessionHourlyActivityPending}
				isMetricsPending={isSnapshotPending}
				metrics={headlineMetrics}
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
