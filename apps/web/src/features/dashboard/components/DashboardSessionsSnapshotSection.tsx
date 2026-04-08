import type { SessionHourlyActivityDataPoint } from "@rudel/api-routes";
import { DashboardDailyOverviewTable } from "@/features/dashboard/components/DashboardDailyOverviewTable";
import { DashboardSessionHourlyChart } from "@/features/dashboard/components/DashboardSessionHourlyChart";
import { DashboardTopChartSection } from "@/features/dashboard/components/DashboardTopChartSection";
import type {
	DashboardDailyPatternPoint,
	DashboardHeadlineMetric,
} from "@/features/dashboard/data/dashboard-static-data";

export function DashboardSessionsSnapshotSection({
	dailyPattern,
	hourlyActivity,
	isHourlyActivityPending,
	isMetricsPending = false,
	metrics,
	showDelta = false,
}: {
	dailyPattern: DashboardDailyPatternPoint[];
	hourlyActivity: SessionHourlyActivityDataPoint[] | undefined;
	isHourlyActivityPending: boolean;
	isMetricsPending?: boolean;
	metrics: DashboardHeadlineMetric[];
	showDelta?: boolean;
}) {
	return (
		<DashboardTopChartSection
			isMetricsLoading={isMetricsPending}
			metrics={metrics}
			showDelta={showDelta}
			chart={
				<DashboardSessionHourlyChart
					className="min-w-0"
					data={hourlyActivity}
					isLoading={isHourlyActivityPending}
				/>
			}
			detail={<DashboardDailyOverviewTable data={dailyPattern} />}
		/>
	);
}
