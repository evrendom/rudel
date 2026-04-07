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

function getMemberAxisLabel(fullLabel: string) {
	return fullLabel.split(" ")[0] ?? fullLabel;
}

function buildChartData(metric: DashboardMetric): DashboardPerformanceDatum[] {
	return metric.memberValues.map((member, index) => ({
		id: `${member.label.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}-${index}`,
		axisLabel: getMemberAxisLabel(member.label),
		fullLabel: member.label,
		isPlaceholder: member.value == null,
		metricValue: member.value,
	}));
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
	metrics,
	selectedMetricId,
	onSelectedMetricChange,
	snapshot,
}: {
	metrics: DashboardMetric[];
	selectedMetricId: DashboardMetricId;
	onSelectedMetricChange: (metricId: DashboardMetricId) => void;
	snapshot: DashboardOutputSnapshot;
}) {
	const selectedMetric =
		metrics.find((metric) => metric.id === selectedMetricId) ?? metrics[0];
	const selectedChartData = useMemo(
		() => (selectedMetric ? buildChartData(selectedMetric) : []),
		[selectedMetric],
	);

	if (!selectedMetric) {
		return null;
	}

	const selectedMetricColors = dashboardMetricColorFamilies[selectedMetric.id];

	return (
		<section className="@container/performance-panel grid gap-5">
			<div className="grid gap-0">
				<div className="grid gap-1 pb-3">
					<h2 className="dashboard-big-number text-2xl/8 text-[color:var(--dashboardy-heading)]">
						AI delivery at a glance
					</h2>
					<p className="dashboardy-footnote max-w-2xl text-sm/6">
						Daily output, session load, and conversion quality gathered into one
						operating view.
					</p>
				</div>
				<div>
					<div className="flex h-[54px] w-full items-center overflow-x-auto border-b border-[color:var(--dashboardy-border)] bg-[color:var(--dashboardy-surface)] md:overflow-visible">
						<div className="flex w-full min-w-max items-center gap-2 px-3 sm:gap-6 sm:px-0">
							<fieldset className="flex flex-1 items-center gap-1.5">
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
							<div className="flex items-center gap-1.5">
								<DashboardDateControls className="h-[34px] px-2.5 text-[13px]" />
								<DashboardFilterControls
									className="shrink-0"
									buttonClassName="h-[34px] px-2.5 text-[13px]"
								/>
							</div>
						</div>
					</div>
				</div>
				<div className="flex flex-1 flex-col border-b border-[color:var(--dashboardy-divider)] lg:flex-row lg:items-center lg:gap-0">
					<div className="flex flex-1 flex-col justify-center pb-4 pt-0 lg:pb-4">
						<DashboardHeadlineMetricGrid
							metrics={snapshot.headlineMetrics}
							className="pb-0"
							showDelta={false}
						/>
					</div>
					<div className="flex flex-1 items-center pt-0 lg:max-w-[664px]">
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
