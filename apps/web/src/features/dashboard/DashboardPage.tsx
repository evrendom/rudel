import { useState } from "react";
import { DashboardInsightsPanel } from "@/features/dashboard/components/DashboardInsightsPanel";
import { DashboardPerformancePanel } from "@/features/dashboard/components/DashboardPerformancePanel";
import type { DashboardMetricId } from "@/features/dashboard/data/dashboard-static-data";
import { useDashboardPageData } from "@/features/dashboard/use-dashboard-page-data";
import "@/features/dashboardy/dashboardy.css";

export function DashboardPage() {
	const { endDate, metrics, snapshot } = useDashboardPageData();
	const [selectedMetricId, setSelectedMetricId] = useState<DashboardMetricId>(
		metrics[0]?.id ?? "output",
	);

	return (
		<div className="dashboardy-page px-4 pb-6 pt-2 lg:px-6 lg:pb-8">
			<div className="@container/dashboard-page mx-auto flex max-w-[1180px] flex-col gap-5">
				<DashboardPerformancePanel
					endDate={endDate}
					metrics={metrics}
					selectedMetricId={selectedMetricId}
					onSelectedMetricChange={setSelectedMetricId}
					snapshot={snapshot}
				/>
				<DashboardInsightsPanel
					workTypes={snapshot.workTypes}
					players={snapshot.players}
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
