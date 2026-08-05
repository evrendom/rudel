import { CliSetupHint } from "@/components/analytics/CliSetupHint";
import { DashboardCostControl } from "@/features/dashboard/components/DashboardCostControl";
import { DashboardRepositoryUploadStatus } from "@/features/dashboard/components/DashboardRepositoryUploadStatus";
import { useDashboardPageData } from "@/features/dashboard/use-dashboard-page-data";

export function DashboardPage() {
	const {
		isCostControlPending,
		isOverviewKpisPending,
		isRepositoryUploadStatusPending,
		errorDeveloperTrend,
		errorModelTrend,
		errorProjectTrend,
		modelTokensTrend,
		performanceUsers,
		projectInvestment,
		repositoriesDailyTrend,
		totalSessionCount,
		userDailyTrend,
	} = useDashboardPageData();

	if (!isOverviewKpisPending && totalSessionCount === 0) {
		return (
			<div className="dashboardy-page flex min-h-full flex-1 px-4 pb-6 pt-2 sm:px-6 lg:px-[76px] lg:pb-8">
				<div className="mx-auto flex w-full flex-col">
					<CliSetupHint />
				</div>
			</div>
		);
	}

	return (
		<div className="dashboardy-page flex min-h-full flex-1 px-4 pb-6 pt-2 sm:px-6 lg:px-[76px] lg:pb-8 @5xl/main:h-full @5xl/main:min-h-0 @5xl/main:overflow-hidden">
			<div className="@container/dashboard-page mx-auto flex min-h-0 w-full flex-1 flex-col">
				<div className="grid min-h-0 flex-1 grid-cols-1 items-start gap-4 @5xl/dashboard-page:grid-cols-[minmax(0,1.65fr)_minmax(19rem,0.75fr)] @5xl/dashboard-page:items-stretch @5xl/dashboard-page:overflow-hidden">
					<DashboardCostControl
						errorDeveloperTrend={errorDeveloperTrend}
						errorModelTrend={errorModelTrend}
						errorProjectTrend={errorProjectTrend}
						isPending={isCostControlPending}
						modelTokensTrend={modelTokensTrend}
						performanceUsers={performanceUsers}
						projects={projectInvestment}
						repositoryDailyTrend={repositoriesDailyTrend}
						userDailyTrend={userDailyTrend}
					/>
					<DashboardRepositoryUploadStatus
						isPending={isRepositoryUploadStatusPending}
						projects={projectInvestment}
					/>
				</div>
			</div>
		</div>
	);
}
