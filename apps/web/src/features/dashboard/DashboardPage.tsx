import { useState } from "react";
import { DashboardInsightsPanel } from "@/features/dashboard/components/DashboardInsightsPanel";
import { DashboardPerformancePanel } from "@/features/dashboard/components/DashboardPerformancePanel";
import { useDashboardPageData } from "@/features/dashboard/use-dashboard-page-data";
import type { DashboardMetricId } from "@/features/dashboard/data/dashboard-static-data";

export function DashboardPage() {
	const {
		endDate,
		metrics,
		breakdownGroups,
		timeComposition,
		comparisonNotes,
		toolCards,
	} = useDashboardPageData();
	const [selectedMetricId, setSelectedMetricId] = useState<DashboardMetricId>(
		metrics[0]?.id ?? "output",
	);

	return (
		<div className="px-4 pb-2 pt-2 lg:px-[72px]">
			<div className="flex flex-col gap-6">
				<DashboardPerformancePanel
					metrics={metrics}
					endDate={endDate}
					selectedMetricId={selectedMetricId}
					onSelectedMetricChange={setSelectedMetricId}
				/>
				<DashboardInsightsPanel
					breakdownGroups={breakdownGroups}
					timeComposition={timeComposition}
					comparisonNotes={comparisonNotes}
					toolCards={toolCards}
				/>
			</div>
		</div>
	);
}
