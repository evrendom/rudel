import type { SessionHourlyActivityDataPoint } from "@rudel/api-routes";
import { DashboardSessionHourlyChart } from "@/features/dashboard/components/DashboardSessionHourlyChart";
import { DashboardSessionHourlyOverviewTable } from "@/features/dashboard/components/DashboardSessionHourlyOverviewTable";
import { DashboardInteractiveTopChartSection } from "@/features/dashboard/components/DashboardTopChartSection";
import type { DashboardHeadlineMetric } from "@/features/dashboard/data/dashboard-static-data";
import { buildDashboardSessionHourlyOverviewRows } from "@/features/dashboard/data/dashboard-tab-adapters";

export function DashboardSessionsSnapshotSection({
	hourlyActivity,
	isHourlyActivityPending,
	isMetricsPending = false,
	metrics,
	showDelta = false,
}: {
	hourlyActivity: SessionHourlyActivityDataPoint[] | undefined;
	isHourlyActivityPending: boolean;
	isMetricsPending?: boolean;
	metrics: DashboardHeadlineMetric[];
	showDelta?: boolean;
}) {
	const hourlyRows = buildDashboardSessionHourlyOverviewRows(hourlyActivity);

	return (
		<DashboardInteractiveTopChartSection
			isMetricsLoading={isMetricsPending}
			metrics={metrics}
			showDelta={showDelta}
			renderChart={({ highlightedItemId }) => (
				<DashboardSessionHourlyChart
					activeHour={
						highlightedItemId == null ? null : Number(highlightedItemId)
					}
					className="min-w-0"
					data={hourlyActivity}
					isLoading={isHourlyActivityPending}
				/>
			)}
			renderDetail={({
				highlightSource,
				highlightedItemId,
				onHighlightItemChange,
			}) => (
				<DashboardSessionHourlyOverviewTable
					rows={hourlyRows}
					highlightSource={highlightSource}
					highlightedHour={highlightedItemId}
					isLoading={isHourlyActivityPending}
					onHighlightHourChange={onHighlightItemChange}
				/>
			)}
		/>
	);
}
