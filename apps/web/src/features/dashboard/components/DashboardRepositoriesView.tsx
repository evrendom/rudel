import type {
	RepositoryDailyTrendData,
	UserDailyTrendData,
} from "@rudel/api-routes";
import { useMemo } from "react";
import { DashboardDailySnapshotSection } from "@/features/dashboard/components/DashboardDailySnapshotSection";
import { DashboardDeveloperPanel } from "@/features/dashboard/components/DashboardDeveloperPanel";
import { DashboardRepositoryDailyOverviewTable } from "@/features/dashboard/components/DashboardRepositoryDailyOverviewTable";
import { DashboardRepositoryPanel } from "@/features/dashboard/components/DashboardRepositoryPanel";
import type { DashboardPerformanceUserComparison } from "@/features/dashboard/data/dashboard-performance-adapter";
import { buildDashboardRepositorySummaryRows } from "@/features/dashboard/data/dashboard-repository-trend";
import type { DashboardRankedOutputRow } from "@/features/dashboard/data/dashboard-static-data";
import {
	buildDashboardDailyPatternFromRepositoryTrend,
	buildDashboardRepositoryDailyOverviewRows,
	buildDashboardRepositoryTabMetrics,
} from "@/features/dashboard/data/dashboard-tab-adapters";

export function DashboardRepositoriesView({
	endDate,
	isDeveloperChartPending,
	isMetricsPending = false,
	isRepositoryChartPending,
	performanceUserDailyTrend,
	performanceUsers,
	repositories,
	repositoryDailyTrend,
	startDate,
}: {
	endDate: string;
	isDeveloperChartPending: boolean;
	isMetricsPending?: boolean;
	isRepositoryChartPending: boolean;
	performanceUserDailyTrend: UserDailyTrendData[] | undefined;
	performanceUsers: DashboardPerformanceUserComparison[];
	repositories: DashboardRankedOutputRow[];
	repositoryDailyTrend: RepositoryDailyTrendData[] | undefined;
	startDate: string;
}) {
	const repositoryRows = useMemo(
		() =>
			buildDashboardRepositorySummaryRows(repositories, repositoryDailyTrend),
		[repositories, repositoryDailyTrend],
	);
	const headlineMetrics = useMemo(
		() => buildDashboardRepositoryTabMetrics(repositoryRows),
		[repositoryRows],
	);
	const dailyPattern = useMemo(
		() =>
			buildDashboardDailyPatternFromRepositoryTrend(
				startDate,
				endDate,
				repositoryDailyTrend,
			),
		[endDate, repositoryDailyTrend, startDate],
	);
	const repositoryDailyRows = useMemo(
		() =>
			buildDashboardRepositoryDailyOverviewRows(
				startDate,
				endDate,
				repositoryDailyTrend,
			),
		[endDate, repositoryDailyTrend, startDate],
	);

	return (
		<section className="@container/repositories-view flex flex-col gap-8">
			<DashboardDailySnapshotSection
				chartMode="repository-stack"
				dailyPattern={dailyPattern}
				isMetricsLoading={isMetricsPending}
				metrics={headlineMetrics}
				renderDetail={({
					highlightSource,
					highlightedItemId,
					onHighlightItemChange,
				}) => (
					<DashboardRepositoryDailyOverviewTable
						rows={repositoryDailyRows}
						highlightSource={highlightSource}
						highlightedDate={highlightedItemId}
						onHighlightDateChange={onHighlightItemChange}
					/>
				)}
				repositoryDailyTrend={repositoryDailyTrend}
			/>
			<DashboardRepositoryPanel
				isChartPending={isRepositoryChartPending}
				repositories={repositories}
				repositoryDailyTrend={repositoryDailyTrend}
			/>
			<div className="grid gap-4 border-t border-[color:var(--dashboardy-divider)] pt-8">
				<DashboardDeveloperPanel
					isChartPending={isDeveloperChartPending}
					performanceUserDailyTrend={performanceUserDailyTrend}
					performanceUsers={performanceUsers}
				/>
			</div>
		</section>
	);
}
