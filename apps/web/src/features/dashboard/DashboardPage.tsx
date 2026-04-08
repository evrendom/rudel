import { Tabs, TabsList, TabsTrigger } from "@/app/ui/tabs";
import { DashboardDateControls } from "@/features/dashboard/components/DashboardDateControls";
import { DashboardPerformancePanel } from "@/features/dashboard/components/DashboardPerformancePanel";
import { DashboardRepositoryPanel } from "@/features/dashboard/components/DashboardRepositoryPanel";
import { useDashboardHomeData } from "@/features/dashboard/use-dashboard-home-data";
import "@/features/dashboard/dashboard-theme.css";

export function DashboardPage() {
	const {
		isDashboardSnapshotPending,
		isPerformanceChartPending,
		isRepositoryChartPending,
		performanceUserDailyTrend,
		performanceUsers,
		repositoryDailyTrend,
		snapshot,
	} = useDashboardHomeData();

	return (
		<div className="dashboardy-page px-4 pb-6 pt-2 sm:px-6 lg:px-[76px] lg:pb-8">
			<div className="@container/dashboard-page mx-auto flex w-full flex-col gap-5">
				<div className="sticky top-0 z-20 -mx-4 bg-[color:var(--dashboardy-surface)]/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-[color:var(--dashboardy-surface)]/85 sm:-mx-6 sm:px-6 lg:-mx-[76px] lg:px-[76px]">
					<div className="flex h-[54px] w-full items-center overflow-x-auto border-b border-[color:var(--dashboardy-border)] md:overflow-visible">
						<div className="flex w-full min-w-max items-center gap-2.5 px-3 sm:px-0">
							<Tabs value="commits" className="dashboardy-sticky-tabs flex-1">
								<TabsList className="dashboardy-sticky-tabs-list">
									<TabsTrigger
										value="tokens"
										disabled
										className="dashboardy-sticky-tab"
									>
										Tokens
									</TabsTrigger>
									<TabsTrigger
										value="commits"
										className="dashboardy-sticky-tab"
									>
										Commits
									</TabsTrigger>
									<TabsTrigger
										value="errors"
										disabled
										className="dashboardy-sticky-tab"
									>
										Errors
									</TabsTrigger>
									<TabsTrigger
										value="repos"
										disabled
										className="dashboardy-sticky-tab"
									>
										Repos
									</TabsTrigger>
									<TabsTrigger
										value="sessions"
										disabled
										className="dashboardy-sticky-tab"
									>
										Sessions
									</TabsTrigger>
								</TabsList>
							</Tabs>
							<DashboardDateControls className="ml-auto h-[34px] shrink-0 px-2.5 text-[13px]" />
						</div>
					</div>
				</div>

				<DashboardPerformancePanel
					isChartPending={isPerformanceChartPending}
					isSnapshotPending={isDashboardSnapshotPending}
					performanceUserDailyTrend={performanceUserDailyTrend}
					performanceUsers={performanceUsers}
					snapshot={snapshot}
				/>
				<DashboardRepositoryPanel
					isChartPending={isRepositoryChartPending}
					repositories={snapshot.repositories}
					repositoryDailyTrend={repositoryDailyTrend}
				/>
			</div>
		</div>
	);
}
