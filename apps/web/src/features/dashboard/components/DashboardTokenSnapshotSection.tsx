import { DashboardTokenDailyOverviewTable } from "@/features/dashboard/components/DashboardTokenDailyOverviewTable";
import { DashboardTokenPatternChart } from "@/features/dashboard/components/DashboardTokenPatternChart";
import { DashboardInteractiveTopChartSection } from "@/features/dashboard/components/DashboardTopChartSection";
import type { DashboardHeadlineMetric } from "@/features/dashboard/data/dashboard-static-data";
import type { DashboardTokenDailyPoint } from "@/features/dashboard/data/dashboard-tab-adapters";

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
			renderChart={({ highlightedItemId, highlightSource }) => (
				<DashboardTokenPatternChart
					data={dailyPattern}
					className="min-w-0"
					highlightedDate={highlightedItemId}
					highlightSource={highlightSource}
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
