import type { UserDailyTrendData } from "@rudel/api-routes";
import { DashboardDailySnapshotSection } from "@/features/dashboard/components/DashboardDailySnapshotSection";
import { DashboardDeveloperPanel } from "@/features/dashboard/components/DashboardDeveloperPanel";
import type { DashboardPerformanceUserComparison } from "@/features/dashboard/data/dashboard-performance-adapter";
import type { DashboardOutputSnapshot } from "@/features/dashboard/data/dashboard-static-data";

export function DashboardPerformancePanel({
	isChartPending,
	isSnapshotPending = false,
	performanceUserDailyTrend,
	performanceUsers,
	snapshot,
}: {
	isChartPending: boolean;
	isSnapshotPending?: boolean;
	performanceUserDailyTrend: UserDailyTrendData[] | undefined;
	performanceUsers: DashboardPerformanceUserComparison[];
	snapshot: DashboardOutputSnapshot;
}) {
	return (
		<section className="@container/performance-panel flex flex-col gap-8">
			<DashboardDailySnapshotSection
				dailyPattern={snapshot.dailyPattern}
				isMetricsLoading={isSnapshotPending}
				metrics={snapshot.headlineMetrics}
			/>
			<DashboardDeveloperPanel
				isChartPending={isChartPending}
				performanceUserDailyTrend={performanceUserDailyTrend}
				performanceUsers={performanceUsers}
			/>
		</section>
	);
}
