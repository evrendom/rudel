import type { RepositoryDailyTrendData } from "@rudel/api-routes";
import { FolderGit2Icon } from "lucide-react";
import { useMemo, useState } from "react";
import { Skeleton } from "@/app/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/app/ui/toggle-group";
import { DashboardAnalysisPanel } from "@/features/dashboard/components/DashboardAnalysisPanel";
import {
	buildDashboardRepositoryChartData,
	DashboardRepositoryChart,
} from "@/features/dashboard/components/DashboardRepositoryChart";
import { DashboardRepositoryTable } from "@/features/dashboard/components/DashboardRepositoryTable";
import { DashboardRepositoryTrendChart } from "@/features/dashboard/components/DashboardRepositoryTrendChart";
import { useDashboardHighlightState } from "@/features/dashboard/components/dashboard-highlight-state";
import {
	buildDashboardRepositorySummaryRows,
	buildDashboardRepositoryTrendSeries,
	type DashboardRepositoryTrendMetric,
} from "@/features/dashboard/data/dashboard-repository-trend";
import type { DashboardRankedOutputRow } from "@/features/dashboard/data/dashboard-static-data";

type RepositoryChartView = "total" | "over-time";
type DashboardRepositoryPanelVariant = "commits" | "sessions";
const MAX_VISIBLE_REPOSITORY_SERIES = 7;
const MAX_VISIBLE_REPOSITORY_BARS = 20;

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
	variant = "commits",
}: {
	isChartPending: boolean;
	repositories: DashboardRankedOutputRow[];
	repositoryDailyTrend: RepositoryDailyTrendData[] | undefined;
	variant?: DashboardRepositoryPanelVariant;
}) {
	const [chartView, setChartView] = useState<RepositoryChartView>("total");
	const [hiddenTrendSeriesIds, setHiddenTrendSeriesIds] = useState<string[]>(
		[],
	);
	const { highlightSource, highlightedItemId, setHighlight } =
		useDashboardHighlightState();
	const [trendMetric, setTrendMetric] =
		useState<DashboardRepositoryTrendMetric>("sessions");
	const repositoryRows = useMemo(
		() =>
			buildDashboardRepositorySummaryRows(
				repositories,
				repositoryDailyTrend,
				variant === "sessions" ? "sessions" : "commits",
			),
		[repositories, repositoryDailyTrend, variant],
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
		() =>
			buildDashboardRepositoryChartData(
				repositoryRows.slice(0, MAX_VISIBLE_REPOSITORY_BARS),
			),
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
		<DashboardAnalysisPanel
			title="By repository"
			titleLevel="h3"
			icon={
				<FolderGit2Icon className="size-5 text-[color:var(--dashboardy-heading)]" />
			}
			chartShellDataSlot="dashboard-repository-chart-shell"
			controls={
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
					<ToggleGroupItem value="over-time" className="dashboardy-toggle-item">
						Over time
					</ToggleGroupItem>
				</ToggleGroup>
			}
			chartContent={
				isChartPending ? (
					<DashboardRepositoryChartFallback />
				) : chartView === "over-time" ? (
					hasTrendData ? (
						<DashboardRepositoryTrendChart
							availableMetrics={
								variant === "sessions" ? ["sessions"] : ["sessions", "commits"]
							}
							highlightedSeriesId={highlightedItemId}
							hiddenRows={hiddenChartRows}
							hiddenSeriesIds={hiddenTrendSeriesIds}
							metric={trendMetric}
							onHighlightSeriesChange={setHighlight}
							onMetricChange={setTrendMetric}
							onToggleSeries={handleToggleTrendSeries}
							trendData={repositoryDailyTrend}
							trendSeries={trendSeries}
						/>
					) : (
						<div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
							No repository activity in the selected range.
						</div>
					)
				) : hasChartData ? (
					<DashboardRepositoryChart
						activeId={highlightedItemId}
						data={chartData}
						highlightSource={highlightSource}
						onHighlightRepositoryChange={setHighlight}
						variant={variant}
					/>
				) : (
					<div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
						No repository activity in the selected range.
					</div>
				)
			}
			tableContent={
				<DashboardRepositoryTable
					highlightSource={highlightSource}
					highlightedDate={null}
					highlightedRepositoryId={highlightedItemId}
					onHighlightRepositoryChange={setHighlight}
					rows={repositoryRows}
					trendData={repositoryDailyTrend}
					variant={variant}
				/>
			}
		/>
	);
}
