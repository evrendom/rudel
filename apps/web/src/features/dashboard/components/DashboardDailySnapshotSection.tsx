import type { RepositoryDailyTrendData } from "@rudel/api-routes";
import { startTransition, useCallback, useRef, useState } from "react";
import { DashboardDailyOverviewTable } from "@/features/dashboard/components/DashboardDailyOverviewTable";
import { DashboardDailyPatternChart } from "@/features/dashboard/components/DashboardDailyPatternChart";
import { DashboardHeadlineMetricGrid } from "@/features/dashboard/components/DashboardHeadlineMetricGrid";
import type {
	DashboardDailyPatternPoint,
	DashboardHeadlineMetric,
} from "@/features/dashboard/data/dashboard-static-data";

export function DashboardDailySnapshotSection({
	chartMode = "commit-flow",
	dailyPattern,
	metrics,
	repositoryDailyTrend,
	showDelta = false,
}: {
	chartMode?: "commit-flow" | "repository-stack";
	dailyPattern: DashboardDailyPatternPoint[];
	metrics: DashboardHeadlineMetric[];
	repositoryDailyTrend?: RepositoryDailyTrendData[] | undefined;
	showDelta?: boolean;
}) {
	const [highlightedDate, setHighlightedDate] = useState<string | null>(null);
	const highlightedDateRef = useRef<string | null>(null);

	const handleHighlightDateChange = useCallback((date: string | null) => {
		if (highlightedDateRef.current === date) {
			return;
		}

		highlightedDateRef.current = date;
		startTransition(() => {
			setHighlightedDate(date);
		});
	}, []);

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
					<DashboardDailyPatternChart
						data={dailyPattern}
						className="min-w-0"
						highlightedDate={highlightedDate}
						highlightSource={highlightedDate ? "table" : null}
						mode={chartMode}
						repositoryDailyTrend={repositoryDailyTrend}
					/>
				</div>
			</div>
			<DashboardDailyOverviewTable
				data={dailyPattern}
				highlightedDate={highlightedDate}
				highlightSource={highlightedDate ? "table" : null}
				onHighlightDateChange={handleHighlightDateChange}
			/>
		</div>
	);
}
