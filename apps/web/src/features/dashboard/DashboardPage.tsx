import { useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/app/ui/tabs";
import { DashboardDateControls } from "@/features/dashboard/components/DashboardDateControls";
import { DashboardErrorsView } from "@/features/dashboard/components/DashboardErrorsView";
import { DashboardFilterControls } from "@/features/dashboard/components/DashboardFilterControls";
import { DashboardInsightsPanel } from "@/features/dashboard/components/DashboardInsightsPanel";
import { DashboardPerformancePanel } from "@/features/dashboard/components/DashboardPerformancePanel";
import { DashboardRepositoriesView } from "@/features/dashboard/components/DashboardRepositoriesView";
import { DashboardSessionsView } from "@/features/dashboard/components/DashboardSessionsView";
import { DashboardTokensView } from "@/features/dashboard/components/DashboardTokensView";
import { useDashboardPageData } from "@/features/dashboard/use-dashboard-page-data";
import "@/features/dashboardy/dashboardy.css";

type DashboardView = "tokens" | "commits" | "errors" | "repos" | "sessions";

export function DashboardPage() {
	const {
		endDate,
		errorDashboard,
		errorDeveloperTrend,
		errorProjectTrend,
		isDashboardSnapshotPending,
		isErrorDashboardPending,
		isPerformanceChartPending,
		isRepositoryChartPending,
		isSessionSnapshotPending,
		isTokenChartPending,
		modelTokensTrend,
		performanceUserDailyTrend,
		performanceUsers,
		repositoryDailyTrend,
		sessionSummaryComparison,
		snapshot,
		startDate,
		userLabelById,
		usersTokenUsage,
	} = useDashboardPageData();
	const [activeView, setActiveView] = useState<DashboardView>("commits");

	return (
		<div className="dashboardy-page px-4 pb-6 pt-2 sm:px-6 lg:px-[76px] lg:pb-8">
			<div className="@container/dashboard-page mx-auto flex w-full flex-col gap-5">
				<div className="sticky top-0 z-20 -mx-4 bg-[color:var(--dashboardy-surface)]/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-[color:var(--dashboardy-surface)]/85 sm:-mx-6 sm:px-6 lg:-mx-[76px] lg:px-[76px]">
					<div className="flex h-[54px] w-full items-center overflow-x-auto border-b border-[color:var(--dashboardy-border)] md:overflow-visible">
						<div className="flex w-full min-w-max items-center gap-2.5 px-3 sm:gap-10 sm:px-0">
							<Tabs
								value={activeView}
								onValueChange={(nextValue) => {
									if (
										nextValue === "tokens" ||
										nextValue === "commits" ||
										nextValue === "errors" ||
										nextValue === "repos" ||
										nextValue === "sessions"
									) {
										setActiveView(nextValue);
									}
								}}
								className="dashboardy-sticky-tabs flex-1"
							>
								<TabsList className="dashboardy-sticky-tabs-list">
									<TabsTrigger value="tokens" className="dashboardy-sticky-tab">
										Tokens
									</TabsTrigger>
									<TabsTrigger
										value="commits"
										className="dashboardy-sticky-tab"
									>
										Commits
									</TabsTrigger>
									<TabsTrigger value="errors" className="dashboardy-sticky-tab">
										Errors
									</TabsTrigger>
									<TabsTrigger value="repos" className="dashboardy-sticky-tab">
										Repos
									</TabsTrigger>
									<TabsTrigger
										value="sessions"
										className="dashboardy-sticky-tab"
									>
										Sessions
									</TabsTrigger>
								</TabsList>
							</Tabs>
							<DashboardDateControls className="h-[34px] px-2.5 text-[13px]" />
							<DashboardFilterControls
								className="shrink-0"
								buttonClassName="h-[34px] px-2.5 text-[13px]"
							/>
						</div>
					</div>
				</div>

				{activeView === "tokens" ? (
					<DashboardTokensView
						endDate={endDate}
						isDeveloperChartPending={isTokenChartPending}
						isSnapshotPending={isTokenChartPending}
						modelTokensTrend={modelTokensTrend}
						performanceUserDailyTrend={performanceUserDailyTrend}
						performanceUsers={performanceUsers}
						startDate={startDate}
						usersTokenUsage={usersTokenUsage}
					/>
				) : null}

				{activeView === "commits" ? (
					<>
						<DashboardPerformancePanel
							isChartPending={isPerformanceChartPending}
							isSnapshotPending={isDashboardSnapshotPending}
							performanceUserDailyTrend={performanceUserDailyTrend}
							performanceUsers={performanceUsers}
							snapshot={snapshot}
						/>
						<DashboardInsightsPanel
							isRepositoryChartPending={isRepositoryChartPending}
							repositories={snapshot.repositories}
							repositoryDailyTrend={repositoryDailyTrend}
						/>
					</>
				) : null}

				{activeView === "errors" ? (
					<DashboardErrorsView
						endDate={endDate}
						errorDashboard={errorDashboard}
						errorDeveloperTrend={errorDeveloperTrend}
						errorProjectTrend={errorProjectTrend}
						isPending={isErrorDashboardPending}
						startDate={startDate}
						userLabelById={userLabelById}
					/>
				) : null}

				{activeView === "repos" ? (
					<DashboardRepositoriesView
						endDate={endDate}
						isDeveloperChartPending={isPerformanceChartPending}
						isMetricsPending={
							isDashboardSnapshotPending || isRepositoryChartPending
						}
						isRepositoryChartPending={isRepositoryChartPending}
						performanceUserDailyTrend={performanceUserDailyTrend}
						performanceUsers={performanceUsers}
						repositories={snapshot.repositories}
						repositoryDailyTrend={repositoryDailyTrend}
						startDate={startDate}
					/>
				) : null}

				{activeView === "sessions" ? (
					<DashboardSessionsView
						isDeveloperChartPending={isPerformanceChartPending}
						isRepositoryChartPending={isRepositoryChartPending}
						isSnapshotPending={isSessionSnapshotPending}
						performanceUserDailyTrend={performanceUserDailyTrend}
						performanceUsers={performanceUsers}
						repositories={snapshot.repositories}
						repositoryDailyTrend={repositoryDailyTrend}
						sessionSummaryComparison={sessionSummaryComparison}
					/>
				) : null}
			</div>
		</div>
	);
}
