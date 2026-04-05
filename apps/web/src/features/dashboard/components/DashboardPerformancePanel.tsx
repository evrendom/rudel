import { addDays, format, parseISO, startOfWeek } from "date-fns";
import type { CSSProperties } from "react";
import { lazy, Suspense, useMemo } from "react";
import { cn } from "@/lib/utils";
import { DashboardDateControls } from "@/features/dashboard/components/DashboardDateControls";
import { DashboardFilterControls } from "@/features/dashboard/components/DashboardFilterControls";
import { DashboardMetricDetailSection } from "@/features/dashboard/components/DashboardMetricDetailSection";
import type { DashboardPerformanceDatum } from "@/features/dashboard/components/DashboardPerformanceChart";
import {
	type DashboardMetricColorFamily,
	dashboardMetricColorFamilies,
} from "@/features/dashboard/data/dashboard-metric-colors";
import type {
	DashboardMetric,
	DashboardMetricId,
} from "@/features/dashboard/data/dashboard-static-data";
import { createDashboardMetricDetail } from "@/features/dashboard/data/dashboard-static-data";
import { Card, CardContent } from "@/app/ui/card";
import { Skeleton } from "@/app/ui/skeleton";

const DashboardPerformanceChart = lazy(async () => {
	const module = await import(
		"@/features/dashboard/components/DashboardPerformanceChart"
	);

	return { default: module.DashboardPerformanceChart };
});

const deltaToneClassNames = {
	positive: "team-lineup-metric-button__delta--positive",
	negative: "team-lineup-metric-button__delta--negative",
	neutral: "team-lineup-metric-button__delta--neutral",
} as const;

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
			<div className="team-lineup-metric-button__metrics">
				<div className="team-lineup-metric-button__value tabular-nums">
					{metric.value}
				</div>
				<div
					className={cn(
						"team-lineup-metric-button__delta tabular-nums",
						deltaToneClassNames[metric.deltaTone],
					)}
				>
					{metric.deltaLabel}
				</div>
			</div>
		</button>
	);
}

function DashboardPerformanceChartFallback() {
	return (
		<div className="flex h-full items-end gap-3 px-4 pb-8 pt-4">
			{Array.from({ length: 7 }, (_, index) => {
				const heightClassName = [
					"h-[8.25rem]",
					"h-[10rem]",
					"h-[7rem]",
					"h-[12rem]",
					"h-[9rem]",
					"h-[11rem]",
					"h-[8rem]",
				][index];

				return (
					<div
						key={index}
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
				);
			})}
		</div>
	);
}

export function DashboardPerformancePanel({
	metrics,
	endDate,
	selectedMetricId,
	onSelectedMetricChange,
}: {
	metrics: DashboardMetric[];
	endDate: string;
	selectedMetricId: DashboardMetricId;
	onSelectedMetricChange: (metricId: DashboardMetricId) => void;
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
		<div className="flex flex-col gap-4">
			<div className="flex flex-wrap items-stretch justify-between gap-4">
				<div className="min-w-0">
					<fieldset className="flex flex-wrap items-start gap-2">
						<legend className="sr-only">Select performance metric</legend>
						{metrics.map((metric) => (
							<DashboardMetricButton
								colors={dashboardMetricColorFamilies[metric.id]}
								key={metric.id}
								isSelected={metric.id === selectedMetric.id}
								metric={metric}
								onSelect={onSelectedMetricChange}
							/>
						))}
					</fieldset>
				</div>

				<div className="flex min-w-fit basis-full flex-col gap-2 sm:basis-auto sm:justify-end sm:self-stretch">
					<div className="flex justify-end">
						<DashboardDateControls />
					</div>
					<div className="flex justify-end">
						<DashboardFilterControls />
					</div>
				</div>
			</div>

			<Card size="sm" className="bg-card/95 shadow-none ring-1 ring-border/60">
				<CardContent>
					<div className="flex flex-col gap-4">
						<Card
							size="sm"
							className="bg-muted/20 shadow-none ring-1 ring-border/60"
						>
							<CardContent>
								<div className="h-[18.5rem] sm:h-[20rem]">
									<Suspense fallback={<DashboardPerformanceChartFallback />}>
										<DashboardPerformanceChart
											colors={selectedMetricColors}
											data={selectedChartData}
											metricLabel={selectedMetric.label}
										/>
									</Suspense>
								</div>
							</CardContent>
						</Card>

						{selectedDetailData ? (
							<DashboardMetricDetailSection detail={selectedDetailData} />
						) : null}
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
