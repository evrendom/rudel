import { addDays, format, parseISO, startOfWeek } from "date-fns";
import type { CSSProperties } from "react";
import { lazy, Suspense, useMemo } from "react";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/app/ui/card";
import { Skeleton } from "@/app/ui/skeleton";
import { DashboardDailyPatternChart } from "@/features/dashboard/components/DashboardDailyPatternChart";
import { DashboardDailyRateStrip } from "@/features/dashboard/components/DashboardDailyRateStrip";
import { DashboardDateControls } from "@/features/dashboard/components/DashboardDateControls";
import { DashboardFilterControls } from "@/features/dashboard/components/DashboardFilterControls";
import { DashboardHeadlineMetricGrid } from "@/features/dashboard/components/DashboardHeadlineMetricGrid";
import { DashboardMetricDetailSection } from "@/features/dashboard/components/DashboardMetricDetailSection";
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
import { createDashboardMetricDetail } from "@/features/dashboard/data/dashboard-static-data";
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
	const selectedDetailData = useMemo(
		() =>
			selectedMetric
				? createDashboardMetricDetail(selectedMetric.id, endDate)
				: null,
		[selectedMetric, endDate],
	);

	if (!selectedMetric) {
		return null;
	}

	const selectedMetricColors = dashboardMetricColorFamilies[selectedMetric.id];

	return (
		<section className="@container/performance-panel grid gap-5">
			<div className="grid gap-4 @xl/performance-panel:grid-cols-[minmax(0,1fr)_18rem]">
				<div className="grid gap-4">
					<div className="grid gap-2">
						<p className="dashboardy-label">Shipping pulse</p>
						<div className="grid gap-1">
							<h2 className="dashboardy-section-title text-2xl/8">
								AI delivery at a glance
							</h2>
							<p className="dashboardy-footnote max-w-2xl text-sm/6">
								Daily output, session load, and conversion quality gathered into
								one operating view.
							</p>
						</div>
					</div>
					<fieldset className="flex flex-wrap items-start gap-2">
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
					<DashboardHeadlineMetricGrid metrics={snapshot.headlineMetrics} />
				</div>

				<div className="dashboardy-card grid gap-4 rounded-[1.9rem] border p-4 shadow-none">
					<div className="grid gap-2">
						<p className="dashboardy-label">Controls</p>
						<DashboardDateControls />
						<DashboardFilterControls className="justify-start" />
					</div>
					<div className="border-t border-[color:var(--dashboardy-divider)] pt-4">
						<p className="dashboardy-label">Last week at this point</p>
						<div className="mt-3 grid gap-3 sm:grid-cols-3">
							<div className="dashboardy-bucket-card min-w-0 rounded-[1.2rem] p-3">
								<p className="dashboardy-label truncate">Commits</p>
								<p className="dashboard-big-number mt-2 text-lg/7 tabular-nums text-[color:var(--dashboardy-heading)]">
									{snapshot.lastWeekSamePoint.commits}
								</p>
							</div>
							<div className="dashboardy-bucket-card min-w-0 rounded-[1.2rem] p-3">
								<p className="dashboardy-label truncate">Sessions</p>
								<p className="dashboard-big-number mt-2 text-lg/7 tabular-nums text-[color:var(--dashboardy-heading)]">
									{snapshot.lastWeekSamePoint.sessions}
								</p>
							</div>
							<div className="dashboardy-bucket-card min-w-0 rounded-[1.2rem] p-3">
								<p className="dashboardy-label truncate">Commit rate</p>
								<p className="dashboard-big-number mt-2 text-lg/7 tabular-nums text-[color:var(--dashboardy-heading)]">
									{snapshot.lastWeekSamePoint.commitRate}%
								</p>
							</div>
						</div>
					</div>
				</div>
			</div>

			<Card className="dashboardy-card overflow-hidden rounded-[1.9rem] border py-0 shadow-none">
				<CardHeader className="gap-2 border-b border-[color:var(--dashboardy-border)] px-5 py-4">
					<div className="grid gap-1">
						<p className="dashboardy-label">Selected insight</p>
						<CardTitle className="dashboardy-section-title text-xl/7">
							{selectedMetric.label} trajectory
						</CardTitle>
					</div>
					<CardDescription className="dashboardy-footnote">
						Use the selector buttons above to swap the signal and compare how it
						moves across the current week.
					</CardDescription>
				</CardHeader>
				<CardContent className="grid gap-4 px-5 py-4">
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

					{selectedDetailData ? (
						<DashboardMetricDetailSection detail={selectedDetailData} />
					) : null}
				</CardContent>
			</Card>

			<Card className="dashboardy-card overflow-hidden rounded-[1.9rem] border py-0 shadow-none">
				<CardHeader className="gap-2 border-b border-[color:var(--dashboardy-border)] px-5 py-4">
					<div className="grid gap-1">
						<p className="dashboardy-label">Volume over time</p>
						<CardTitle className="dashboardy-section-title text-xl/7">
							Daily commits and sessions
						</CardTitle>
					</div>
					<CardDescription className="dashboardy-footnote">
						Current-period shipping volume and the session load behind it.
					</CardDescription>
				</CardHeader>
				<CardContent className="grid gap-4 px-5 py-4">
					<DashboardDailyPatternChart data={snapshot.dailyPattern} />
					<DashboardDailyRateStrip data={snapshot.dailyPattern} />
				</CardContent>
			</Card>
		</section>
	);
}
