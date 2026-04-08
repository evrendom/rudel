import type { UserDailyTrendData } from "@rudel/api-routes";
import { GaugeIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { Skeleton } from "@/app/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/app/ui/toggle-group";
import { DashboardAnalysisPanel } from "@/features/dashboard/components/DashboardAnalysisPanel";
import { DashboardPerformanceTrendChart } from "@/features/dashboard/components/DashboardPerformanceTrendChart";
import {
	DashboardTokenDeveloperChart,
	type DashboardTokenDeveloperDatum,
} from "@/features/dashboard/components/DashboardTokenDeveloperChart";
import { DashboardTokenDeveloperTable } from "@/features/dashboard/components/DashboardTokenDeveloperTable";
import { useDashboardHighlightState } from "@/features/dashboard/components/dashboard-highlight-state";
import type { DashboardPerformanceUserComparison } from "@/features/dashboard/data/dashboard-performance-adapter";
import {
	buildDashboardPerformanceTrendSeries,
	type DashboardPerformanceTrendMetric,
} from "@/features/dashboard/data/dashboard-performance-trend";

type TokenDeveloperChartView = "total" | "over-time";

const MAX_VISIBLE_DEVELOPER_BARS = 20;

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
		totalTokens: user.totalTokens,
	}));
}

function DashboardTokenDeveloperChartFallback() {
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
						className={`w-full max-w-[34px] rounded-xl bg-muted/70 ${heightClassName}`}
					/>
					<Skeleton className="h-3 w-12 rounded-full bg-muted/60" />
				</div>
			))}
		</div>
	);
}

export function DashboardTokenDeveloperPanel({
	isChartPending,
	performanceUserDailyTrend,
	performanceUsers,
}: {
	isChartPending: boolean;
	performanceUserDailyTrend: UserDailyTrendData[] | undefined;
	performanceUsers: DashboardPerformanceUserComparison[];
}) {
	const [chartView, setChartView] = useState<TokenDeveloperChartView>("total");
	const [hiddenTrendSeriesIds, setHiddenTrendSeriesIds] = useState<string[]>(
		[],
	);
	const { highlightSource, highlightedItemId, setHighlight } =
		useDashboardHighlightState();
	const [trendMetric, setTrendMetric] =
		useState<DashboardPerformanceTrendMetric>("tokens");
	const selectedChartData = useMemo(
		() =>
			buildChartData(
				[...performanceUsers].sort(
					(left, right) =>
						right.totalTokens - left.totalTokens ||
						right.sessions - left.sessions ||
						left.label.localeCompare(right.label),
				),
			).slice(0, MAX_VISIBLE_DEVELOPER_BARS),
		[performanceUsers],
	);
	const hasChartData = selectedChartData.length > 0;
	const hasTrendData = (performanceUserDailyTrend?.length ?? 0) > 0;
	const trendSeries = useMemo(
		() =>
			buildDashboardPerformanceTrendSeries(
				[...performanceUsers].sort(
					(left, right) =>
						right.totalTokens - left.totalTokens ||
						right.sessions - left.sessions ||
						left.label.localeCompare(right.label),
				),
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
		<DashboardAnalysisPanel
			title="By developer"
			icon={
				<GaugeIcon className="size-5 text-[color:var(--dashboardy-heading)]" />
			}
			controls={
				<ToggleGroup
					aria-label="Developer token view"
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
					<DashboardTokenDeveloperChartFallback />
				) : chartView === "over-time" ? (
					hasTrendData ? (
						<DashboardPerformanceTrendChart
							availableMetrics={["tokens"]}
							highlightedSeriesId={highlightedItemId}
							hiddenSeriesIds={hiddenTrendSeriesIds}
							metric={trendMetric}
							onHighlightSeriesChange={setHighlight}
							onMetricChange={setTrendMetric}
							onToggleSeries={handleToggleTrendSeries}
							trendData={performanceUserDailyTrend}
							trendSeries={trendSeries}
						/>
					) : (
						<div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
							No developer token activity in the selected range.
						</div>
					)
				) : hasChartData ? (
					<DashboardTokenDeveloperChart
						activeId={highlightedItemId}
						data={selectedChartData}
						highlightSource={highlightSource}
						onHighlightUserChange={setHighlight}
					/>
				) : (
					<div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
						No developer token activity in the selected range.
					</div>
				)
			}
			tableContent={
				<DashboardTokenDeveloperTable
					highlightSource={highlightSource}
					highlightedDate={null}
					highlightedUserId={highlightedItemId}
					onHighlightUserChange={setHighlight}
					performanceUsers={performanceUsers}
					trendData={performanceUserDailyTrend}
				/>
			}
		/>
	);
}
