import type { UserDailyTrendData } from "@rudel/api-routes";
import { GaugeIcon } from "lucide-react";
import { lazy, Suspense, useMemo, useState } from "react";
import { Skeleton } from "@/app/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/app/ui/toggle-group";
import { DashboardAnalysisPanel } from "@/features/dashboard/components/DashboardAnalysisPanel";
import type { DashboardPerformanceDatum } from "@/features/dashboard/components/DashboardPerformanceChart";
import { DashboardPerformanceRosterTable } from "@/features/dashboard/components/DashboardPerformanceRosterTable";
import {
	DashboardTokenDeveloperChart,
	type DashboardTokenDeveloperDatum,
} from "@/features/dashboard/components/DashboardTokenDeveloperChart";
import { useDashboardHighlightState } from "@/features/dashboard/components/dashboard-highlight-state";
import type { DashboardPerformanceUserComparison } from "@/features/dashboard/data/dashboard-performance-adapter";
import {
	buildDashboardPerformanceTrendSeries,
	type DashboardPerformanceTrendMetric,
} from "@/features/dashboard/data/dashboard-performance-trend";
import { cn } from "@/lib/utils";

type PerformanceChartView = "total" | "over-time";
type DashboardDeveloperPanelVariant = "commits" | "repositories";

const MAX_VISIBLE_PERFORMANCE_BARS = 20;

const DashboardPerformanceChart = lazy(async () => {
	const module = await import(
		"@/features/dashboard/components/DashboardPerformanceChart"
	);

	return { default: module.DashboardPerformanceChart };
});

const DashboardPerformanceTrendChart = lazy(async () => {
	const module = await import(
		"@/features/dashboard/components/DashboardPerformanceTrendChart"
	);

	return { default: module.DashboardPerformanceTrendChart };
});

function getMemberAxisLabel(fullLabel: string) {
	const emailSafeLabel = fullLabel.includes("@")
		? (fullLabel.split("@")[0] ?? fullLabel)
		: fullLabel;

	return emailSafeLabel.split(" ")[0] ?? emailSafeLabel;
}

function getMemberAxisLabels(memberLabels: string[]) {
	const labelCounts = new Map<string, number>();

	for (const fullLabel of memberLabels) {
		const axisLabel = getMemberAxisLabel(fullLabel);
		labelCounts.set(axisLabel, (labelCounts.get(axisLabel) ?? 0) + 1);
	}

	return memberLabels.map((fullLabel) => {
		const axisLabel = getMemberAxisLabel(fullLabel);

		if ((labelCounts.get(axisLabel) ?? 0) <= 1) {
			return axisLabel;
		}

		const fallbackToken = fullLabel.includes("@")
			? (fullLabel.split("@")[0] ?? fullLabel)
			: fullLabel;
		const [firstName, lastName] = fallbackToken.split(/\s+/);
		const lastInitial = lastName?.[0]?.toUpperCase();

		return lastInitial ? `${firstName} ${lastInitial}.` : fallbackToken;
	});
}

function buildChartData(
	performanceUsers: DashboardPerformanceUserComparison[],
): DashboardPerformanceDatum[] {
	const axisLabels = getMemberAxisLabels(
		performanceUsers.map((user) => user.label),
	);

	return performanceUsers.map((user, index) => ({
		commits: user.commits,
		id:
			user.userId ||
			`${user.label.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}-${index}`,
		axisLabel: axisLabels[index] ?? user.label,
		fullLabel: user.label,
		imageUrl: user.imageUrl ?? undefined,
		sessions: user.sessions,
	}));
}

function buildRepositoryBreadthChartData(
	performanceUsers: DashboardPerformanceUserComparison[],
): DashboardTokenDeveloperDatum[] {
	const axisLabels = getMemberAxisLabels(
		performanceUsers.map((user) => user.label),
	);

	return performanceUsers.map((user, index) => ({
		axisLabel: axisLabels[index] ?? user.label,
		fullLabel: user.label,
		id:
			user.userId ||
			`${user.label.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}-${index}`,
		imageUrl: user.imageUrl ?? undefined,
		sessions: user.sessions,
		totalTokens: user.repositoriesTouched.length,
	}));
}

function DashboardPerformanceChartFallback() {
	const skeletonHeights = [
		"h-[8.25rem]",
		"h-[10rem]",
		"h-[7rem]",
		"h-[12rem]",
		"h-[9rem]",
		"h-[11rem]",
		"h-[8rem]",
	];

	return (
		<div className="flex h-full items-end gap-3 px-4 pb-8 pt-4">
			{skeletonHeights.map((heightClassName) => (
				<div
					key={heightClassName}
					className="flex min-w-0 flex-1 flex-col items-center gap-3"
				>
					<Skeleton
						className={cn(
							"w-full max-w-[34px] rounded-xl bg-muted/70",
							heightClassName,
						)}
					/>
					<Skeleton className="h-3 w-12 rounded-full bg-muted/60" />
				</div>
			))}
		</div>
	);
}

export function DashboardDeveloperPanel({
	isChartPending,
	performanceUserDailyTrend,
	performanceUsers,
	variant = "commits",
}: {
	isChartPending: boolean;
	performanceUserDailyTrend: UserDailyTrendData[] | undefined;
	performanceUsers: DashboardPerformanceUserComparison[];
	variant?: DashboardDeveloperPanelVariant;
}) {
	const [chartView, setChartView] = useState<PerformanceChartView>("total");
	const [hiddenTrendSeriesIds, setHiddenTrendSeriesIds] = useState<string[]>(
		[],
	);
	const { highlightSource, highlightedItemId, setHighlight } =
		useDashboardHighlightState();
	const [trendMetric, setTrendMetric] =
		useState<DashboardPerformanceTrendMetric>(
			variant === "repositories" ? "repositories" : "sessions",
		);
	const repositoryChartData = useMemo(
		() =>
			buildRepositoryBreadthChartData(
				[...performanceUsers].sort(
					(left, right) =>
						right.repositoriesTouched.length -
							left.repositoriesTouched.length ||
						right.sessions - left.sessions ||
						left.label.localeCompare(right.label),
				),
			).slice(0, MAX_VISIBLE_PERFORMANCE_BARS),
		[performanceUsers],
	);
	const commitChartData = useMemo(
		() =>
			buildChartData(performanceUsers).slice(0, MAX_VISIBLE_PERFORMANCE_BARS),
		[performanceUsers],
	);
	const hasChartData =
		variant === "repositories"
			? repositoryChartData.length > 0
			: commitChartData.length > 0;
	const hasTrendData = useMemo(
		() => (performanceUserDailyTrend?.length ?? 0) > 0,
		[performanceUserDailyTrend],
	);
	const trendSeries = useMemo(
		() =>
			buildDashboardPerformanceTrendSeries(
				variant === "repositories"
					? [...performanceUsers].sort(
							(left, right) =>
								right.repositoriesTouched.length -
									left.repositoriesTouched.length ||
								right.sessions - left.sessions ||
								left.label.localeCompare(right.label),
						)
					: performanceUsers,
				performanceUserDailyTrend,
				trendMetric,
			),
		[performanceUserDailyTrend, performanceUsers, trendMetric, variant],
	);

	function handleToggleTrendSeries(userId: string) {
		setHiddenTrendSeriesIds((currentIds) =>
			currentIds.includes(userId)
				? currentIds.filter((id) => id !== userId)
				: [...currentIds, userId],
		);
	}

	return (
		<DashboardAnalysisPanel
			title="By developer"
			icon={
				<GaugeIcon className="size-5 text-[color:var(--dashboardy-heading)]" />
			}
			chartShellDataSlot="dashboard-performance-chart-shell"
			controls={
				<ToggleGroup
					aria-label="Developer performance view"
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
					<DashboardPerformanceChartFallback />
				) : chartView === "over-time" ? (
					hasTrendData ? (
						<Suspense fallback={<DashboardPerformanceChartFallback />}>
							<DashboardPerformanceTrendChart
								availableMetrics={
									variant === "repositories"
										? ["repositories", "sessions"]
										: ["sessions", "commits"]
								}
								highlightedSeriesId={highlightedItemId}
								hiddenSeriesIds={hiddenTrendSeriesIds}
								metric={trendMetric}
								onHighlightSeriesChange={setHighlight}
								onMetricChange={setTrendMetric}
								onToggleSeries={handleToggleTrendSeries}
								trendData={performanceUserDailyTrend}
								trendSeries={trendSeries}
							/>
						</Suspense>
					) : (
						<div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
							{variant === "repositories"
								? "No repository activity in the selected range."
								: "No developer activity in the selected range."}
						</div>
					)
				) : hasChartData ? (
					variant === "repositories" ? (
						<DashboardTokenDeveloperChart
							activeId={highlightedItemId}
							barColor="#1949A9"
							data={repositoryChartData}
							primaryLabel="Active repos"
							secondaryLabel="Sessions"
							derivedLabel="Avg / repo"
							formatPrimaryValue={(value) => value.toLocaleString()}
							formatSecondaryValue={(value) => value.toLocaleString()}
							formatDerivedValue={(primaryValue, secondaryValue) =>
								primaryValue > 0
									? Math.round(secondaryValue / primaryValue).toLocaleString()
									: "—"
							}
							highlightSource={highlightSource}
							onHighlightUserChange={setHighlight}
							yAxisTickFormatter={(value) => Math.round(value).toLocaleString()}
						/>
					) : (
						<Suspense fallback={<DashboardPerformanceChartFallback />}>
							<DashboardPerformanceChart
								activeId={highlightedItemId}
								data={commitChartData}
								highlightSource={highlightSource}
								onHighlightUserChange={setHighlight}
							/>
						</Suspense>
					)
				) : (
					<div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
						{variant === "repositories"
							? "No repository activity in the selected range."
							: "No developer activity in the selected range."}
					</div>
				)
			}
			tableContent={
				<DashboardPerformanceRosterTable
					highlightSource={highlightSource}
					highlightedDate={null}
					highlightedUserId={highlightedItemId}
					onHighlightUserChange={setHighlight}
					performanceUsers={performanceUsers}
					trendData={performanceUserDailyTrend}
					variant={variant}
				/>
			}
		/>
	);
}
