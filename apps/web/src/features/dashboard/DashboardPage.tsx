import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/app/ui/tabs";
import { DashboardDateControls } from "@/features/dashboard/components/DashboardDateControls";
import { DashboardFilterControls } from "@/features/dashboard/components/DashboardFilterControls";
import { DashboardInsightsPanel } from "@/features/dashboard/components/DashboardInsightsPanel";
import { DashboardPerformancePanel } from "@/features/dashboard/components/DashboardPerformancePanel";
import { useDashboardPageData } from "@/features/dashboard/use-dashboard-page-data";
import "@/features/dashboardy/dashboardy.css";

type DashboardView = "commits" | "errors" | "repos" | "sessions";

function DashboardPlaceholderView({
	eyebrow,
	title,
	description,
	previewCards,
}: {
	eyebrow: string;
	title: string;
	description: string;
	previewCards: Array<{ label: string; title: string; value: string }>;
}) {
	return (
		<section className="@container/dashboard-placeholder grid gap-4">
			<Card className="dashboardy-card overflow-hidden rounded-[1.9rem] border py-0 shadow-none">
				<CardHeader className="gap-2 border-b border-[color:var(--dashboardy-border)] px-5 py-4">
					<div className="grid gap-1">
						<p className="dashboardy-label">{eyebrow}</p>
						<CardTitle className="dashboardy-section-title text-xl/7">
							{title}
						</CardTitle>
					</div>
					<p className="dashboardy-footnote max-w-2xl text-pretty">
						{description}
					</p>
				</CardHeader>
				<CardContent className="grid gap-4 px-5 py-4 @xl/dashboard-placeholder:grid-cols-3">
					{previewCards.map((card) => (
						<div
							key={card.title}
							className="rounded-[1.4rem] border border-[color:var(--dashboardy-border)] bg-[color:var(--dashboardy-subsurface)] px-4 py-4"
						>
							<p className="dashboardy-footnote">{card.label}</p>
							<p className="dashboardy-section-title pt-3 text-lg/6">
								{card.title}
							</p>
							<p className="pt-2 text-sm/6 text-[color:var(--dashboardy-muted)]">
								{card.value}
							</p>
						</div>
					))}
				</CardContent>
			</Card>
		</section>
	);
}

export function DashboardPage() {
	const {
		isPerformanceChartPending,
		isRepositoryChartPending,
		performanceUserDailyTrend,
		performanceUsers,
		repositoryDailyTrend,
		snapshot,
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

				{activeView === "commits" ? (
					<>
						<DashboardPerformancePanel
							isChartPending={isPerformanceChartPending}
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
					<DashboardPlaceholderView
						eyebrow="Errors"
						title="Failure patterns will live here"
						description="This will become the error view for the dashboard. For now it is a placeholder shell so the page-switching behavior is in place."
						previewCards={[
							{
								label: "Trend",
								title: "Error spikes",
								value: "Daily regressions, hot sessions, and noisy windows.",
							},
							{
								label: "Impact",
								title: "Affected developers",
								value:
									"Who is getting blocked, and where failure clusters form.",
							},
							{
								label: "Surface",
								title: "Runtime hotspots",
								value:
									"The repos, models, and flows creating the most friction.",
							},
						]}
					/>
				) : null}

				{activeView === "repos" ? (
					<DashboardPlaceholderView
						eyebrow="Repos"
						title="Repository health will live here"
						description="This view will eventually focus on repository-level ownership, throughput, and AI-assisted output quality. For now it is a placeholder."
						previewCards={[
							{
								label: "Coverage",
								title: "Repos touched",
								value:
									"Which repositories are active and how contribution is distributed.",
							},
							{
								label: "Momentum",
								title: "Commit concentration",
								value: "Where AI output is clustering across the codebase.",
							},
							{
								label: "Quality",
								title: "Repo benchmarks",
								value:
									"Compare velocity, stability, and commit outcomes by repo.",
							},
						]}
					/>
				) : null}

				{activeView === "sessions" ? (
					<DashboardPlaceholderView
						eyebrow="Sessions"
						title="Session analytics will live here"
						description="This will become the session-focused dashboard. The placeholder keeps the navigation behavior stable while the real view is designed."
						previewCards={[
							{
								label: "Cadence",
								title: "Session rhythm",
								value:
									"How often developers start, pause, and finish focused work.",
							},
							{
								label: "Quality",
								title: "Completion shape",
								value: "The characteristics shared by sessions that ship.",
							},
							{
								label: "Flow",
								title: "Interaction depth",
								value:
									"How long, how costly, and how iterative sessions become.",
							},
						]}
					/>
				) : null}
			</div>
		</div>
	);
}
