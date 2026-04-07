import { DashboardInsightsPanel } from "@/features/dashboard/components/DashboardInsightsPanel";
import { DashboardPerformancePanel } from "@/features/dashboard/components/DashboardPerformancePanel";
import { useDashboardPageData } from "@/features/dashboard/use-dashboard-page-data";
import "@/features/dashboardy/dashboardy.css";

export function DashboardPage() {
	const { isPerformanceChartPending, performanceUsers, snapshot } =
		useDashboardPageData();

	return (
		<div className="dashboardy-page px-4 pb-6 pt-2 sm:px-6 lg:px-[76px] lg:pb-8">
			<div className="@container/dashboard-page mx-auto flex w-full flex-col gap-5">
				<DashboardPerformancePanel
					isChartPending={isPerformanceChartPending}
					performanceUsers={performanceUsers}
					snapshot={snapshot}
				/>
				<DashboardInsightsPanel
					repositories={snapshot.repositories}
					models={snapshot.models}
					sources={snapshot.sources}
					sessionProfile={snapshot.sessionProfile}
					impactComparisons={snapshot.impactComparisons}
					commitCostMetrics={snapshot.commitCostMetrics}
					activeBranches={snapshot.activeBranches}
					reposTouched={snapshot.reposTouched}
				/>
			</div>
		</div>
	);
}
