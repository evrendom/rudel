import { addDays, format, parseISO, startOfWeek } from "date-fns";
import type { CSSProperties } from "react";
import { lazy, Suspense, useMemo } from "react";
import { Card, CardContent } from "@/app/ui/card";
import { Skeleton } from "@/app/ui/skeleton";
import { DashboardDailyPatternChart } from "@/features/dashboard/components/DashboardDailyPatternChart";
import { DashboardDailyRateStrip } from "@/features/dashboard/components/DashboardDailyRateStrip";
import { DashboardDateControls } from "@/features/dashboard/components/DashboardDateControls";
import { DashboardFilterControls } from "@/features/dashboard/components/DashboardFilterControls";
import { DashboardHeadlineMetricGrid } from "@/features/dashboard/components/DashboardHeadlineMetricGrid";
import type { DashboardPerformanceDatum } from "@/features/dashboard/components/DashboardPerformanceChart";
import {
	type DashboardMetricColorFamily,
	dashboardMetricColorFamilies,
} from "@/features/dashboard/data/dashboard-metric-colors";
import type {
	DashboardMetric,
	DashboardMetricId,
	DashboardOutputSnapshot,
} from "@/features/dashboard/data/dashboard-static-data";
import { cn } from "@/lib/utils";

const DashboardPerformanceChart = lazy(async () => {
	const module = await import(
		"@/features/dashboard/components/DashboardPerformanceChart"
	);

	return { default: module.DashboardPerformanceChart };
});

function resolveWeekStart(endDate: string) {
	const parsedEndDate = parseISO(endDate);

	if (Number.isNaN(parsedEndDate.getTime())) {
		return startOfWeek(new Date(), { weekStartsOn: 1 });
	}

	return startOfWeek(parsedEndDate, { weekStartsOn: 1 });
}

function buildChartData(
	metric: DashboardMetric,
	endDate: string,
): DashboardPerformanceDatum[] {
	const weekStart = resolveWeekStart(endDate);
	const trendByDate = new Map(
		metric.trend.map((point) => [point.date, point.value] as const),
	);

	return Array.from({ length: 7 }, (_, index) => {
		const slotDate = addDays(weekStart, index);
		const slotKey = format(slotDate, "yyyy-MM-dd");
		const metricValue = trendByDate.get(slotKey) ?? null;

		return {
			id: slotKey,
			axisLabel: format(slotDate, "EEEE"),
			fullLabel: format(slotDate, "EEEE, MMMM d"),
			isPlaceholder: metricValue == null,
			metricValue,
		};
	});
}

function DashboardMetricButton({
	isSelected,
	colors,
	metric,
	onSelect,
}: {
	isSelected: boolean;
	colors: DashboardMetricColorFamily;
	metric: DashboardMetric;
	onSelect: (metricId: DashboardMetricId) => void;
}) {
	return (
		<button
			type="button"
			aria-pressed={isSelected}
			data-selected={isSelected}
			onClick={() => onSelect(metric.id)}
			style={
				{
					"--dashboard-01-metric-button-shadow-color": colors.cardShadow,
				} as CSSProperties
			}
			className="team-lineup-metric-button"
		>
			<div className="team-lineup-metric-button__label">{metric.label}</div>
		</button>
	);
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

export function DashboardPerformancePanel({
	endDate,
	metrics,
	selectedMetricId,
	onSelectedMetricChange,
	snapshot,
}: {
	endDate: string;
	metrics: DashboardMetric[];
	selectedMetricId: DashboardMetricId;
	onSelectedMetricChange: (metricId: DashboardMetricId) => void;
	snapshot: DashboardOutputSnapshot;
}) {
	const selectedMetric =
		metrics.find((metric) => metric.id === selectedMetricId) ?? metrics[0];
	const selectedChartData = useMemo(
		() => (selectedMetric ? buildChartData(selectedMetric, endDate) : []),
		[selectedMetric, endDate],
	);

	if (!selectedMetric) {
		return null;
	}

	const selectedMetricColors = dashboardMetricColorFamilies[selectedMetric.id];

	return (
		<section className="@container/performance-panel grid gap-5">
			<div className="grid gap-4">
				<div className="grid gap-1 pb-1">
					<h2 className="dashboard-big-number text-2xl/8 text-[color:var(--dashboardy-heading)]">
						AI delivery at a glance
					</h2>
					<p className="dashboardy-footnote max-w-2xl text-sm/6">
						Daily output, session load, and conversion quality gathered into one
						operating view.
					</p>
				</div>
				<div className="sticky top-[72px] z-10">
					<div className="flex h-[62px] w-full items-center overflow-x-auto border-b border-[color:var(--dashboardy-border)] bg-[color:var(--dashboardy-surface)] md:overflow-visible">
						<div className="flex w-full min-w-max items-center gap-2.5 px-4 sm:gap-8 sm:px-0">
							<fieldset className="flex flex-1 items-center gap-2">
								<legend className="sr-only">Select performance metric</legend>
								{metrics.map((metric) => (
									<DashboardMetricButton
										key={metric.id}
										colors={dashboardMetricColorFamilies[metric.id]}
										isSelected={metric.id === selectedMetric.id}
										metric={metric}
										onSelect={onSelectedMetricChange}
									/>
								))}
							</fieldset>
							<div className="flex items-center gap-2">
								<DashboardDateControls className="h-[38px] px-3 text-sm" />
								<DashboardFilterControls
									className="shrink-0"
									buttonClassName="h-[38px] px-3 text-sm"
								/>
							</div>
						</div>
					</div>
				</div>
				<div className="flex flex-1 flex-col border-b border-[color:var(--dashboardy-divider)] lg:flex-row lg:gap-5">
					<div className="flex flex-1 flex-col gap-4 pb-4 pt-6">
						<DashboardHeadlineMetricGrid
							metrics={snapshot.headlineMetrics}
							className="pb-0"
							showDelta={false}
						/>
					</div>
					<div className="flex flex-1 pt-0 md:pt-3 lg:max-w-[664px]">
						<DashboardDailyPatternChart
							data={snapshot.dailyPattern}
							className="min-w-0"
						/>
					</div>
				</div>
			</div>

			<Card className="dashboardy-card overflow-hidden rounded-[1.9rem] border py-0 shadow-none">
				<CardContent className="px-5 py-4">
					<div className="overflow-hidden rounded-[1.4rem] border border-[color:var(--dashboardy-border)] bg-[color:var(--dashboardy-subsurface)]">
						<div className="px-3 py-2 sm:px-4 sm:py-3">
							<div
								data-slot="dashboard-performance-chart-shell"
								className="h-[18.5rem] sm:h-[20rem]"
							>
								<Suspense fallback={<DashboardPerformanceChartFallback />}>
									<DashboardPerformanceChart
										colors={selectedMetricColors}
										data={selectedChartData}
										metricLabel={selectedMetric.label}
									/>
								</Suspense>
							</div>
						</div>
					</div>
					<div className="mt-4 border-t border-[color:var(--dashboardy-divider)] pt-4">
						<DashboardDailyRateStrip data={snapshot.dailyPattern} />
					</div>
				</CardContent>
			</Card>

		</section>
	);
}
