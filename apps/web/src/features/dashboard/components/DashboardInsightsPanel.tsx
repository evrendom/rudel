import type { RepositoryDailyTrendData } from "@rudel/api-routes";
import { DashboardRepositoryPanel } from "@/features/dashboard/components/DashboardRepositoryPanel";
import type { DashboardRankedOutputRow } from "@/features/dashboard/data/dashboard-static-data";

export function DashboardInsightsPanel({
	isRepositoryChartPending,
	repositories,
	repositoryDailyTrend,
}: {
	isRepositoryChartPending: boolean;
	repositories: DashboardRankedOutputRow[];
	repositoryDailyTrend: RepositoryDailyTrendData[] | undefined;
}) {
	return (
		<section className="@container/insights-panel grid gap-4">
			<div className="flex flex-col gap-8">
				<DashboardRepositoryPanel
					isChartPending={isRepositoryChartPending}
					repositories={repositories}
					repositoryDailyTrend={repositoryDailyTrend}
				/>
			</div>
		</section>
	);
}
