import type {
	ModelTokensTrendData,
	SessionAnalytics,
	UserDailyTrendData,
	UserTokenUsageData,
} from "@rudel/api-routes";
import { useMemo } from "react";
import { useAnalyticsQuery } from "@/features/analytics/queries/useAnalyticsQuery";
import { DashboardTokenDeveloperPanel } from "@/features/dashboard/components/DashboardTokenDeveloperPanel";
import { DashboardTokenModelsPanel } from "@/features/dashboard/components/DashboardTokenModelsPanel";
import { DashboardTokenSnapshotSection } from "@/features/dashboard/components/DashboardTokenSnapshotSection";
import type { DashboardPerformanceUserComparison } from "@/features/dashboard/data/dashboard-performance-adapter";
import {
	buildDashboardTokenDailyPattern,
	buildDashboardTokenTabMetrics,
} from "@/features/dashboard/data/dashboard-tab-adapters";
import { orpc } from "@/lib/orpc";

export function DashboardTokensView({
	endDate,
	isDeveloperChartPending,
	modelTokensTrend,
	performanceUserDailyTrend,
	performanceUsers,
	startDate,
	usersTokenUsage,
}: {
	endDate: string;
	isDeveloperChartPending: boolean;
	modelTokensTrend: ModelTokensTrendData[] | undefined;
	performanceUserDailyTrend: UserDailyTrendData[] | undefined;
	performanceUsers: DashboardPerformanceUserComparison[];
	startDate: string;
	usersTokenUsage: UserTokenUsageData[] | undefined;
}) {
	const totalSessionCount = useMemo(
		() =>
			(usersTokenUsage ?? []).reduce((sum, row) => sum + row.total_sessions, 0),
		[usersTokenUsage],
	);
	const dailyPattern = useMemo(
		() =>
			buildDashboardTokenDailyPattern(
				startDate,
				endDate,
				performanceUserDailyTrend,
				modelTokensTrend,
			),
		[endDate, modelTokensTrend, performanceUserDailyTrend, startDate],
	);
	const headlineMetrics = useMemo(
		() => buildDashboardTokenTabMetrics(usersTokenUsage, dailyPattern),
		[dailyPattern, usersTokenUsage],
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
		<section className="@container/tokens-view flex flex-col gap-8">
			<DashboardTokenSnapshotSection
				dailyPattern={dailyPattern}
				isRecentSessionsPending={isRecentSessionsPending}
				metrics={headlineMetrics}
				recentSessions={sortedRecentSessions}
				totalSessionCount={totalSessionCount}
			/>
			<DashboardTokenDeveloperPanel
				isChartPending={isDeveloperChartPending}
				performanceUserDailyTrend={performanceUserDailyTrend}
				performanceUsers={performanceUsers}
			/>
			<DashboardTokenModelsPanel modelTokensTrend={modelTokensTrend} />
		</section>
	);
}
