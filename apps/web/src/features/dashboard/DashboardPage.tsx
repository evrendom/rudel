import { CliSetupHint } from "@/components/analytics/CliSetupHint";
import { DashboardRepositoryUploadStatus } from "@/features/dashboard/components/DashboardRepositoryUploadStatus";
import { DashboardHomeLayoutPlaceholder } from "@/features/dashboard/components/dashboard-home-layout-placeholder";
import { useDashboardPageData } from "@/features/dashboard/use-dashboard-page-data";

export function DashboardPage() {
	const {
		isOverviewKpisPending,
		isRepositoryUploadStatusPending,
		projectInvestment,
		totalSessionCount,
	} = useDashboardPageData();

	if (!isOverviewKpisPending && totalSessionCount === 0) {
		return (
			<div className="dashboardy-page flex h-full min-h-0 flex-1 overflow-y-auto px-4 pb-6 pt-2 sm:px-6 lg:px-[76px] lg:pb-8">
				<div className="mx-auto flex w-full flex-col">
					<CliSetupHint />
				</div>
			</div>
		);
	}

	return (
		<div className="dashboardy-page flex h-full min-h-0 min-w-0 flex-1 overflow-y-auto @5xl/main:overflow-hidden">
			<div className="@container/dashboard-page flex min-h-0 min-w-0 flex-1">
				<div className="grid min-h-0 min-w-0 flex-1 grid-cols-1 items-start @5xl/dashboard-page:grid-cols-[minmax(0,3fr)_minmax(20rem,1fr)] @5xl/dashboard-page:items-stretch @5xl/dashboard-page:overflow-hidden">
					<main className="flex min-w-0 flex-col px-4 sm:px-6 lg:pl-[76px] lg:pr-6 @5xl/dashboard-page:min-h-0 @5xl/dashboard-page:overflow-y-auto @5xl/dashboard-page:overscroll-contain">
						<DashboardHomeLayoutPlaceholder />
					</main>
					<DashboardRepositoryUploadStatus
						isPending={isRepositoryUploadStatusPending}
						projects={projectInvestment}
					/>
				</div>
			</div>
		</div>
	);
}
