import { DashboardTokenDailyOverviewTable } from "@/features/dashboard/components/DashboardTokenDailyOverviewTable";
import { DashboardTokenPatternChart } from "@/features/dashboard/components/DashboardTokenPatternChart";
import { DashboardInteractiveTopChartSection } from "@/features/dashboard/components/DashboardTopChartSection";
import type { DashboardHeadlineMetric } from "@/features/dashboard/data/dashboard-static-data";
import type { DashboardTokenDailyPoint } from "@/features/dashboard/data/dashboard-token-adapters";

export function DashboardTokenSnapshotSection({
	dailyPattern,
	isMetricsPending = false,
	metrics,
}: {
	dailyPattern: DashboardTokenDailyPoint[];
	isMetricsPending?: boolean;
	metrics: DashboardHeadlineMetric[];
}) {
	return (
		<DashboardInteractiveTopChartSection
			isMetricsLoading={isMetricsPending}
			metrics={metrics}
			renderChart={({
				highlightedItemId,
				highlightSource,
				onHighlightItemChange,
			}) => (
				<DashboardTokenPatternChart
					data={dailyPattern}
					className="min-w-0"
					highlightedDate={highlightedItemId}
					highlightSource={highlightSource}
					onHighlightDateChange={onHighlightItemChange}
				/>
			)}
			renderDetail={({
				highlightedItemId,
				highlightSource,
				onHighlightItemChange,
			}) => (
				<DashboardTokenDailyOverviewTable
					data={dailyPattern}
					highlightedDate={highlightedItemId}
					highlightSource={highlightSource}
					onHighlightDateChange={onHighlightItemChange}
				/>
			)}
		/>
	);
}
