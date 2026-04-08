import type { SessionAnalytics } from "@rudel/api-routes";
import { DashboardHeadlineMetricGrid } from "@/features/dashboard/components/DashboardHeadlineMetricGrid";
import { DashboardTokenPatternChart } from "@/features/dashboard/components/DashboardTokenPatternChart";
import { DashboardTokenRecentSessionsTable } from "@/features/dashboard/components/DashboardTokenRecentSessionsTable";
import type { DashboardHeadlineMetric } from "@/features/dashboard/data/dashboard-static-data";
import type { DashboardTokenDailyPoint } from "@/features/dashboard/data/dashboard-tab-adapters";

export function DashboardTokenSnapshotSection({
	dailyPattern,
	isRecentSessionsPending,
	metrics,
	recentSessions,
	totalSessionCount,
}: {
	dailyPattern: DashboardTokenDailyPoint[];
	isRecentSessionsPending: boolean;
	metrics: DashboardHeadlineMetric[];
	recentSessions: SessionAnalytics[] | undefined;
	totalSessionCount: number;
}) {
	return (
		<div className="flex flex-col gap-8">
			<div className="flex flex-1 flex-col border-b border-[color:var(--dashboardy-divider)] lg:flex-row lg:items-center lg:gap-0">
				<div className="flex flex-1 flex-col justify-center pb-4 pt-0 lg:pb-4">
					<DashboardHeadlineMetricGrid
						metrics={metrics}
						className="pb-0"
						showDelta={false}
					/>
				</div>
				<div className="flex flex-1 items-center pt-0 lg:max-w-[760px] 2xl:max-w-[820px]">
					<DashboardTokenPatternChart data={dailyPattern} className="min-w-0" />
				</div>
			</div>
			<DashboardTokenRecentSessionsTable
				isLoading={isRecentSessionsPending}
				sessions={recentSessions}
				totalSessionCount={totalSessionCount}
			/>
		</div>
	);
}
