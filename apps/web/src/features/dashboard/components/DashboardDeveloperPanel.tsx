import type { UserDailyTrendData } from "@rudel/api-routes";
import { GaugeIcon } from "lucide-react";
import { lazy, Suspense, useMemo, useState } from "react";
import { Skeleton } from "@/app/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/app/ui/toggle-group";
import type { DashboardPerformanceDatum } from "@/features/dashboard/components/DashboardPerformanceChart";
import { DashboardPerformanceRosterTable } from "@/features/dashboard/components/DashboardPerformanceRosterTable";
import type { DashboardPerformanceUserComparison } from "@/features/dashboard/data/dashboard-performance-adapter";
import {
	buildDashboardPerformanceTrendSeries,
	type DashboardPerformanceTrendMetric,
} from "@/features/dashboard/data/dashboard-performance-trend";
import { cn } from "@/lib/utils";

type PerformanceChartView = "total" | "over-time";

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
}: {
	isChartPending: boolean;
	performanceUserDailyTrend: UserDailyTrendData[] | undefined;
	performanceUsers: DashboardPerformanceUserComparison[];
}) {
	const [chartView, setChartView] = useState<PerformanceChartView>("total");
	const [hiddenTrendSeriesIds, setHiddenTrendSeriesIds] = useState<string[]>(
		[],
	);
	const [highlightedUserId, setHighlightedUserId] = useState<string | null>(
		null,
	);
	const [trendMetric, setTrendMetric] =
		useState<DashboardPerformanceTrendMetric>("sessions");
	const selectedChartData = useMemo(
		() =>
			buildChartData(performanceUsers).slice(0, MAX_VISIBLE_PERFORMANCE_BARS),
		[performanceUsers],
	);
	const hasChartData = selectedChartData.length > 0;
	const hasTrendData = useMemo(
		() => (performanceUserDailyTrend?.length ?? 0) > 0,
		[performanceUserDailyTrend],
	);
	const trendSeries = useMemo(
		() =>
			buildDashboardPerformanceTrendSeries(
				performanceUsers,
				performanceUserDailyTrend,
				trendMetric,
			),
		[performanceUserDailyTrend, performanceUsers, trendMetric],
	);

	function handleToggleTrendSeries(userId: string) {
		setHiddenTrendSeriesIds((currentIds) =>
			currentIds.includes(userId)
				? currentIds.filter((id) => id !== userId)
				: [...currentIds, userId],
		);
	}

	return (
		<div className="flex flex-col gap-8">
			<div className="grid gap-4">
				<div className="flex flex-col gap-3 px-1 sm:flex-row sm:items-center sm:justify-between">
					<div className="flex items-center gap-2.5">
						<GaugeIcon className="size-5 text-[color:var(--dashboardy-heading)]" />
						<h2 className="dashboardy-section-title text-xl/7">By developer</h2>
					</div>
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
							data-slot="dashboard-performance-chart-shell"
							className="h-[18.5rem] sm:h-[20rem]"
						>
							{isChartPending ? (
								<DashboardPerformanceChartFallback />
							) : chartView === "over-time" ? (
								hasTrendData ? (
									<Suspense fallback={<DashboardPerformanceChartFallback />}>
										<DashboardPerformanceTrendChart
											highlightedSeriesId={highlightedUserId}
											hiddenSeriesIds={hiddenTrendSeriesIds}
											metric={trendMetric}
											onMetricChange={setTrendMetric}
											onToggleSeries={handleToggleTrendSeries}
											trendData={performanceUserDailyTrend}
											trendSeries={trendSeries}
										/>
									</Suspense>
								) : (
									<div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
										No developer activity in the selected range.
									</div>
								)
							) : hasChartData ? (
								<Suspense fallback={<DashboardPerformanceChartFallback />}>
									<DashboardPerformanceChart
										activeId={highlightedUserId}
										data={selectedChartData}
									/>
								</Suspense>
							) : (
								<div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
									No developer activity in the selected range.
								</div>
							)}
						</div>
					</div>
				</div>
			</div>
			<div className="border-t border-[color:var(--dashboardy-divider)] pt-8">
				<DashboardPerformanceRosterTable
					highlightedDate={null}
					onHighlightUserChange={setHighlightedUserId}
					performanceUsers={performanceUsers}
					trendData={performanceUserDailyTrend}
				/>
			</div>
		</div>
	);
}
