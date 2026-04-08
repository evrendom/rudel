import type {
	SessionAnalytics,
	SessionHourlyActivityDataPoint,
} from "@rudel/api-routes";
import { DashboardHeadlineMetricGrid } from "@/features/dashboard/components/DashboardHeadlineMetricGrid";
import { DashboardRecentSessionsPanel } from "@/features/dashboard/components/DashboardRecentSessionsPanel";
import { DashboardSessionHourlyChart } from "@/features/dashboard/components/DashboardSessionHourlyChart";
import type { DashboardHeadlineMetric } from "@/features/dashboard/data/dashboard-static-data";

export function DashboardSessionsSnapshotSection({
	hourlyActivity,
	isHourlyActivityPending,
	isRecentSessionsPending,
	metrics,
	recentSessions,
	showDelta = false,
}: {
	hourlyActivity: SessionHourlyActivityDataPoint[] | undefined;
	isHourlyActivityPending: boolean;
	isRecentSessionsPending: boolean;
	metrics: DashboardHeadlineMetric[];
	recentSessions: SessionAnalytics[] | undefined;
	showDelta?: boolean;
}) {
	return (
		<div className="flex flex-col gap-8">
			<div className="flex flex-1 flex-col border-b border-[color:var(--dashboardy-divider)] lg:flex-row lg:items-center lg:gap-0">
				<div className="flex flex-1 flex-col justify-center pb-4 pt-0 lg:pb-4">
					<DashboardHeadlineMetricGrid
						metrics={metrics}
						className="pb-0"
						showDelta={showDelta}
					/>
				</div>
				<div className="flex flex-1 items-center pt-0 lg:max-w-[760px] 2xl:max-w-[820px]">
					<DashboardSessionHourlyChart
						className="min-w-0"
						data={hourlyActivity}
						isLoading={isHourlyActivityPending}
					/>
				</div>
			</div>
			<DashboardRecentSessionsPanel
				isLoading={isRecentSessionsPending}
				sessions={recentSessions}
			/>
		</div>
	);
}
