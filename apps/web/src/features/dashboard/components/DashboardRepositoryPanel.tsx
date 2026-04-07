import type { RepositoryDailyTrendData } from "@rudel/api-routes";
import { FolderGit2Icon } from "lucide-react";
import { lazy, Suspense, useMemo, useState } from "react";
import { Skeleton } from "@/app/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/app/ui/toggle-group";
import { buildDashboardRepositoryChartData } from "@/features/dashboard/components/DashboardRepositoryChart";
import { DashboardRepositoryTable } from "@/features/dashboard/components/DashboardRepositoryTable";
import {
	buildDashboardRepositorySummaryRows,
	buildDashboardRepositoryTrendSeries,
	type DashboardRepositoryTrendMetric,
} from "@/features/dashboard/data/dashboard-repository-trend";
import type { DashboardRankedOutputRow } from "@/features/dashboard/data/dashboard-static-data";

type RepositoryChartView = "total" | "over-time";
const MAX_VISIBLE_REPOSITORY_SERIES = 7;

const CHART_FALLBACK_BAR_KEYS = [
	"repository-chart-bar-1",
	"repository-chart-bar-2",
	"repository-chart-bar-3",
	"repository-chart-bar-4",
	"repository-chart-bar-5",
] as const;

const CHART_FALLBACK_LABEL_KEYS = [
	"repository-chart-label-1",
	"repository-chart-label-2",
	"repository-chart-label-3",
	"repository-chart-label-4",
	"repository-chart-label-5",
] as const;

const DashboardRepositoryChart = lazy(async () => {
	const module = await import(
		"@/features/dashboard/components/DashboardRepositoryChart"
	);

	return { default: module.DashboardRepositoryChart };
});

const DashboardRepositoryTrendChart = lazy(async () => {
	const module = await import(
		"@/features/dashboard/components/DashboardRepositoryTrendChart"
	);

	return { default: module.DashboardRepositoryTrendChart };
});

function DashboardRepositoryChartFallback() {
	return (
		<div className="grid h-full gap-4 p-2">
			<div className="grid grid-cols-5 gap-3">
				{CHART_FALLBACK_BAR_KEYS.map((key) => (
					<Skeleton key={key} className="h-[13.5rem] rounded-[1.2rem]" />
				))}
			</div>
			<div className="grid grid-cols-5 gap-3 px-2">
				{CHART_FALLBACK_LABEL_KEYS.map((key) => (
					<Skeleton key={key} className="h-7 rounded-full" />
				))}
			</div>
		</div>
	);
}

export function DashboardRepositoryPanel({
	isChartPending,
	repositories,
	repositoryDailyTrend,
}: {
	isChartPending: boolean;
	repositories: DashboardRankedOutputRow[];
	repositoryDailyTrend: RepositoryDailyTrendData[] | undefined;
}) {
	const [chartView, setChartView] = useState<RepositoryChartView>("total");
	const [hiddenTrendSeriesIds, setHiddenTrendSeriesIds] = useState<string[]>(
		[],
	);
	const [highlightedTrendDate, setHighlightedTrendDate] = useState<
		string | null
	>(null);
	const [highlightedRepositoryId, setHighlightedRepositoryId] = useState<
		string | null
	>(null);
	const [trendMetric, setTrendMetric] =
		useState<DashboardRepositoryTrendMetric>("sessions");
	const repositoryRows = useMemo(
		() =>
			buildDashboardRepositorySummaryRows(repositories, repositoryDailyTrend),
		[repositories, repositoryDailyTrend],
	);
	const visibleChartRows = useMemo(
		() => repositoryRows.slice(0, MAX_VISIBLE_REPOSITORY_SERIES),
		[repositoryRows],
	);
	const hiddenChartRows = useMemo(
		() => repositoryRows.slice(MAX_VISIBLE_REPOSITORY_SERIES),
		[repositoryRows],
	);
	const chartData = useMemo(
		() => buildDashboardRepositoryChartData(repositoryRows),
		[repositoryRows],
	);

	const hasChartData = repositoryRows.length > 0;
	const hasTrendData = useMemo(
		() => (repositoryDailyTrend?.length ?? 0) > 0,
		[repositoryDailyTrend],
	);
	const trendSeries = useMemo(
		() =>
			buildDashboardRepositoryTrendSeries(
				visibleChartRows,
				repositoryDailyTrend,
				trendMetric,
			),
		[repositoryDailyTrend, trendMetric, visibleChartRows],
	);

	function handleToggleTrendSeries(repositoryId: string) {
		setHiddenTrendSeriesIds((currentIds) =>
			currentIds.includes(repositoryId)
				? currentIds.filter((id) => id !== repositoryId)
				: [...currentIds, repositoryId],
		);
	}

	return (
		<div className="flex flex-col gap-8">
			<div className="grid gap-4">
				<div className="flex flex-col gap-3 px-1 sm:flex-row sm:items-center sm:justify-between">
					<div className="flex items-center gap-2.5">
						<FolderGit2Icon className="size-5 text-[color:var(--dashboardy-heading)]" />
						<h3 className="dashboardy-section-title text-lg/7">
							By repository
						</h3>
					</div>
					<ToggleGroup
						aria-label="Repository performance view"
						className="dashboardy-toggle-group self-start"
						size="sm"
						spacing={0}
						value={[chartView]}
						variant="outline"
						onValueChange={(nextValue) => {
							const nextView = nextValue[0];

							if (nextView === "total" || nextView === "over-time") {
								setChartView(nextView);
							}
						}}
					>
						<ToggleGroupItem value="total" className="dashboardy-toggle-item">
							Total
						</ToggleGroupItem>
						<ToggleGroupItem
							value="over-time"
							className="dashboardy-toggle-item"
						>
							Over time
						</ToggleGroupItem>
					</ToggleGroup>
				</div>
				<div className="rounded-[1.4rem] border border-[color:var(--dashboardy-border)] bg-[color:var(--dashboardy-subsurface)]">
					<div className="px-3 py-2 sm:px-4 sm:py-3">
						<div
							data-slot="dashboard-repository-chart-shell"
							className="h-[18.5rem] sm:h-[20rem]"
						>
							{isChartPending ? (
								<DashboardRepositoryChartFallback />
							) : chartView === "over-time" ? (
								hasTrendData ? (
									<Suspense fallback={<DashboardRepositoryChartFallback />}>
										<DashboardRepositoryTrendChart
											highlightedSeriesId={highlightedRepositoryId}
											hiddenRows={hiddenChartRows}
											hiddenSeriesIds={hiddenTrendSeriesIds}
											metric={trendMetric}
											onHighlightDateChange={setHighlightedTrendDate}
											onMetricChange={setTrendMetric}
											onToggleSeries={handleToggleTrendSeries}
											trendData={repositoryDailyTrend}
											trendSeries={trendSeries}
										/>
									</Suspense>
								) : (
									<div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
										No repository activity in the selected range.
									</div>
								)
							) : hasChartData ? (
								<Suspense fallback={<DashboardRepositoryChartFallback />}>
									<DashboardRepositoryChart
										activeId={highlightedRepositoryId}
										data={chartData}
									/>
								</Suspense>
							) : (
								<div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
									No repository activity in the selected range.
								</div>
							)}
						</div>
					</div>
				</div>
			</div>
			<div className="border-t border-[color:var(--dashboardy-divider)] pt-8">
				<DashboardRepositoryTable
					highlightedDate={
						chartView === "over-time" ? highlightedTrendDate : null
					}
					onHighlightRepositoryChange={setHighlightedRepositoryId}
					rows={repositoryRows}
					trendData={repositoryDailyTrend}
				/>
			</div>
		</div>
	);
}
