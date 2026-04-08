import type { RepositoryDailyTrendData } from "@rudel/api-routes";
import { DashboardDailyOverviewTable } from "@/features/dashboard/components/DashboardDailyOverviewTable";
import { DashboardDailyPatternChart } from "@/features/dashboard/components/DashboardDailyPatternChart";
import { DashboardInteractiveTopChartSection } from "@/features/dashboard/components/DashboardTopChartSection";
import type {
	DashboardDailyPatternPoint,
	DashboardHeadlineMetric,
} from "@/features/dashboard/data/dashboard-static-data";

export function DashboardDailySnapshotSection({
	chartMode = "commit-flow",
	dailyPattern,
	isMetricsLoading = false,
	metrics,
	repositoryDailyTrend,
	showDelta = false,
}: {
	chartMode?: "commit-flow" | "repository-stack";
	dailyPattern: DashboardDailyPatternPoint[];
	isMetricsLoading?: boolean;
	metrics: DashboardHeadlineMetric[];
	repositoryDailyTrend?: RepositoryDailyTrendData[] | undefined;
	showDelta?: boolean;
}) {
	return (
		<DashboardInteractiveTopChartSection
			isMetricsLoading={isMetricsLoading}
			metrics={metrics}
			showDelta={showDelta}
			renderChart={({ highlightedItemId, highlightSource }) => (
				<DashboardDailyPatternChart
					data={dailyPattern}
					className="min-w-0"
					highlightedDate={highlightedItemId}
					highlightSource={highlightSource}
					mode={chartMode}
					repositoryDailyTrend={repositoryDailyTrend}
				/>
			)}
			renderDetail={({
				highlightedItemId,
				highlightSource,
				onHighlightItemChange,
			}) => (
				<DashboardDailyOverviewTable
					data={dailyPattern}
					highlightedDate={highlightedItemId}
					highlightSource={highlightSource}
					onHighlightDateChange={onHighlightItemChange}
				/>
			)}
		/>
	);
}
