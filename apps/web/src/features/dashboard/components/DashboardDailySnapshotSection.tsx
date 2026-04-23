import type { RepositoryDailyTrendData } from "@rudel/api-routes";
import type { ReactNode } from "react";
import { DashboardDailyOverviewTable } from "@/features/dashboard/components/DashboardDailyOverviewTable";
import { DashboardDailyPatternChart } from "@/features/dashboard/components/DashboardDailyPatternChart";
import {
	DashboardInteractiveTopChartSection,
	type DashboardTopChartRenderProps,
} from "@/features/dashboard/components/DashboardTopChartSection";
import type {
	DashboardDailyPatternPoint,
	DashboardHeadlineMetric,
} from "@/features/dashboard/data/dashboard-static-data";

export function DashboardDailySnapshotSection({
	chartMode = "commit-flow",
	dailyPattern,
	isMetricsLoading = false,
	metrics,
	renderDetail,
	repositoryDailyTrend,
	showDelta = false,
}: {
	chartMode?: "commit-flow" | "repository-stack";
	dailyPattern: DashboardDailyPatternPoint[];
	isMetricsLoading?: boolean;
	metrics: DashboardHeadlineMetric[];
	renderDetail?: (props: DashboardTopChartRenderProps) => ReactNode;
	repositoryDailyTrend?: RepositoryDailyTrendData[] | undefined;
	showDelta?: boolean;
}) {
	return (
		<DashboardInteractiveTopChartSection
			isMetricsLoading={isMetricsLoading}
			metrics={metrics}
			showDelta={showDelta}
			renderChart={({
				highlightedItemId,
				highlightSource,
				onHighlightItemChange,
			}) => (
				<DashboardDailyPatternChart
					data={dailyPattern}
					className="min-w-0"
					highlightedDate={highlightedItemId}
					highlightSource={highlightSource}
					mode={chartMode}
					onHighlightDateChange={onHighlightItemChange}
					repositoryDailyTrend={repositoryDailyTrend}
				/>
			)}
			renderDetail={({
				highlightedItemId,
				highlightSource,
				onHighlightItemChange,
			}) =>
				renderDetail?.({
					highlightedItemId,
					highlightSource,
					onHighlightItemChange,
				}) ?? (
					<DashboardDailyOverviewTable
						data={dailyPattern}
						highlightedDate={highlightedItemId}
						highlightSource={highlightSource}
						onHighlightDateChange={onHighlightItemChange}
					/>
				)
			}
		/>
	);
}
