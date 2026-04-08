import type {
	SessionAnalytics,
	SessionHourlyActivityDataPoint,
} from "@rudel/api-routes";
import { DashboardRecentSessionsPanel } from "@/features/dashboard/components/DashboardRecentSessionsPanel";
import { DashboardSessionHourlyChart } from "@/features/dashboard/components/DashboardSessionHourlyChart";
import { DashboardTopChartSection } from "@/features/dashboard/components/DashboardTopChartSection";
import type { DashboardHeadlineMetric } from "@/features/dashboard/data/dashboard-static-data";

export function DashboardSessionsSnapshotSection({
	hourlyActivity,
	isHourlyActivityPending,
	isMetricsPending = false,
	isRecentSessionsPending,
	metrics,
	recentSessions,
	showDelta = false,
}: {
	hourlyActivity: SessionHourlyActivityDataPoint[] | undefined;
	isHourlyActivityPending: boolean;
	isMetricsPending?: boolean;
	isRecentSessionsPending: boolean;
	metrics: DashboardHeadlineMetric[];
	recentSessions: SessionAnalytics[] | undefined;
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
			detail={
				<DashboardRecentSessionsPanel
					isLoading={isRecentSessionsPending}
					sessions={recentSessions}
				/>
			}
		/>
	);
}
