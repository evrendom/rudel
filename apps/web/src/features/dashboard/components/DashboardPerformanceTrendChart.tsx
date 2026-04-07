"use client";

import type { UserDailyTrendData } from "@rudel/api-routes";
import { format, parseISO } from "date-fns";
import { useMemo } from "react";
import {
	CartesianGrid,
	Line,
	LineChart,
	ReferenceDot,
	XAxis,
	YAxis,
} from "recharts";
import { type ChartConfig, ChartContainer, ChartTooltip } from "@/app/ui/chart";
import { ToggleGroup, ToggleGroupItem } from "@/app/ui/toggle-group";
import {
	type DashboardPerformanceTrendMetric,
	type DashboardPerformanceTrendSeries,
	getDashboardPerformanceTrendValue,
} from "@/features/dashboard/data/dashboard-performance-trend";
import { cn } from "@/lib/utils";

type TrendChartRow = {
	date: string;
	fullLabel: string;
} & Record<string, number | string>;

function getTickLabel(dateValue: string, index: number, total: number) {
	const parsedDate = parseISO(dateValue);

	if (Number.isNaN(parsedDate.getTime())) {
		return "";
	}

	if (total <= 7) {
		return format(parsedDate, "EEE d");
	}

	const interval = Math.max(1, Math.ceil(total / 5));
	const isBoundaryTick = index === 0 || index === total - 1;

	if (!isBoundaryTick && index % interval !== 0) {
		return "";
	}

	return format(parsedDate, "MMM d");
}

function buildFullLabel(dateValue: string) {
	const parsedDate = parseISO(dateValue);

	if (Number.isNaN(parsedDate.getTime())) {
		return dateValue;
	}

	return format(parsedDate, "EEEE, MMM d");
}

function PerformanceTrendTooltip({
	active,
	metric,
	payload,
}: {
	active?: boolean;
	metric: DashboardPerformanceTrendMetric;
	payload?: Array<{
		color?: string;
		dataKey?: string;
		name?: string;
		value?: number | string;
		payload?: TrendChartRow;
	}>;
}) {
	if (!active || !payload?.length) {
		return null;
	}

	const point = payload[0]?.payload;

	if (!point) {
		return null;
	}

	return (
		<div className="grid min-w-52 gap-2 rounded-xl bg-popover px-3 py-2 text-xs text-popover-foreground shadow-lg ring-1 ring-foreground/5 dark:ring-foreground/10">
			<p className="font-medium text-foreground">{point.fullLabel}</p>
			<div className="grid gap-1.5">
				{payload.map((item) => (
					<div
						key={String(item.dataKey ?? item.name ?? "value")}
						className="flex items-center justify-between gap-6"
					>
						<div className="flex min-w-0 items-center gap-2.5">
							<span
								aria-hidden="true"
								className="size-2 shrink-0 rounded-full"
								style={{ backgroundColor: item.color }}
							/>
							<span className="truncate text-muted-foreground">
								{item.name}
							</span>
						</div>
						<span className="shrink-0 font-mono font-medium tabular-nums text-foreground">
							{typeof item.value === "number"
								? `${item.value.toLocaleString()} ${metric}`
								: item.value}
						</span>
					</div>
				))}
			</div>
		</div>
	);
}

export function DashboardPerformanceTrendChart({
	className,
	hiddenSeriesIds,
	metric,
	onHighlightDateChange,
	onMetricChange,
	onToggleSeries,
	trendData,
	trendSeries,
}: {
	className?: string;
	hiddenSeriesIds: string[];
	metric: DashboardPerformanceTrendMetric;
	onHighlightDateChange: (date: string | null) => void;
	onMetricChange: (metric: DashboardPerformanceTrendMetric) => void;
	onToggleSeries: (userId: string) => void;
	trendData: UserDailyTrendData[] | undefined;
	trendSeries: DashboardPerformanceTrendSeries[];
}) {
	const hiddenSeriesSet = useMemo(
		() => new Set(hiddenSeriesIds),
		[hiddenSeriesIds],
	);

	const { allSeries, axisMax, chartConfig, chartData, visibleSeries } =
		useMemo(() => {
			const rows = trendData ?? [];

			if (rows.length === 0) {
				return {
					allSeries: [] as DashboardPerformanceTrendSeries[],
					axisMax: 1,
					chartConfig: {} satisfies ChartConfig,
					chartData: [] as TrendChartRow[],
					visibleSeries: [] as DashboardPerformanceTrendSeries[],
				};
			}

			const allDates = Array.from(new Set(rows.map((row) => row.date))).sort();
			const rowMap = new Map(
				rows.map((row) => [`${row.user_id}:${row.date}`, row] as const),
			);
			const allSeries = trendSeries;
			const visibleSeries = allSeries.filter(
				(series) => !hiddenSeriesSet.has(series.userId),
			);
			const chartData = allDates.map((date) => {
				const nextRow: TrendChartRow = {
					date,
					fullLabel: buildFullLabel(date),
				};

				for (const series of allSeries) {
					nextRow[series.userId] = getDashboardPerformanceTrendValue(
						rowMap.get(`${series.userId}:${date}`),
						metric,
					);
				}

				return nextRow;
			});
			const chartConfig = Object.fromEntries(
				allSeries.map((series) => [
					series.userId,
					{
						color: series.color,
						label: series.label,
					},
				]),
			) satisfies ChartConfig;
			const axisMax = Math.max(
				1,
				...chartData.flatMap((row) =>
					visibleSeries.map((series) => Number(row[series.userId] ?? 0)),
				),
			);

			return {
				allSeries,
				axisMax,
				chartConfig,
				chartData,
				visibleSeries,
			};
		}, [hiddenSeriesSet, metric, trendData, trendSeries]);

	if (allSeries.length === 0) {
		return (
			<div
				className={cn(
					"flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground",
					className,
				)}
			>
				No developer activity in the selected range.
			</div>
		);
	}

	return (
		<div className={cn("flex h-full min-h-0 flex-col gap-3", className)}>
			<div className="flex flex-col gap-3 px-1 sm:flex-row sm:items-start sm:justify-between">
				<ToggleGroup
					aria-label="Developer performance metric"
					className="dashboardy-toggle-group self-start"
					size="sm"
					spacing={0}
					value={[metric]}
					variant="outline"
					onValueChange={(nextValue) => {
						const nextMetric = nextValue[0];

						if (nextMetric === "sessions" || nextMetric === "commits") {
							onMetricChange(nextMetric);
						}
					}}
				>
					<ToggleGroupItem value="sessions" className="dashboardy-toggle-item">
						Sessions
					</ToggleGroupItem>
					<ToggleGroupItem value="commits" className="dashboardy-toggle-item">
						Commits
					</ToggleGroupItem>
				</ToggleGroup>
				<div className="flex flex-wrap items-center gap-1.5 sm:max-w-[65%] sm:justify-end">
					{allSeries.map((series) => {
						const isHidden = hiddenSeriesSet.has(series.userId);

						return (
							<button
								key={series.userId}
								type="button"
								aria-pressed={!isHidden}
								aria-label={`${isHidden ? "Show" : "Hide"} ${series.label} in chart`}
								className={cn(
									"inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors",
									isHidden
										? "border-[color:var(--dashboardy-border)] bg-transparent text-[color:var(--dashboardy-muted)]"
										: "border-[color:var(--dashboardy-border)] bg-[color:var(--dashboardy-surface)] text-[color:var(--dashboardy-heading)]",
								)}
								onClick={() => onToggleSeries(series.userId)}
							>
								<span
									aria-hidden="true"
									className="size-2 rounded-full transition-opacity"
									style={{
										backgroundColor: series.color,
										opacity: isHidden ? 0.35 : 1,
									}}
								/>
								<span className="truncate">{series.label}</span>
							</button>
						);
					})}
				</div>
			</div>

			<div className="min-h-0 flex-1">
				{visibleSeries.length === 0 ? (
					<div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
						Select at least one developer.
					</div>
				) : (
					<ChartContainer
						config={chartConfig}
						className="h-full w-full aspect-auto [&_.recharts-cartesian-grid-vertical_line]:stroke-transparent [&_.recharts-curve]:drop-shadow-none"
						initialDimension={{ width: 664, height: 206 }}
					>
						<LineChart
							data={chartData}
							margin={{ top: 12, right: 12, bottom: 8, left: 0 }}
							onMouseLeave={() => onHighlightDateChange(null)}
							onMouseMove={(state: { activeLabel?: unknown }) => {
								onHighlightDateChange(
									typeof state.activeLabel === "string"
										? state.activeLabel
										: null,
								);
							}}
						>
							<CartesianGrid
								stroke="color-mix(in srgb, var(--dashboardy-divider) 68%, transparent)"
								strokeDasharray="0"
								vertical={false}
							/>
							<XAxis
								dataKey="date"
								axisLine={false}
								minTickGap={24}
								tickFormatter={(value, index) =>
									getTickLabel(String(value), index, chartData.length)
								}
								tickLine={false}
								tickMargin={8}
								tick={{
									fontSize: 12,
									fontWeight: 500,
									fill: "var(--dashboardy-muted)",
									opacity: 0.65,
								}}
							/>
							<YAxis
								orientation="right"
								allowDecimals={false}
								axisLine={false}
								domain={[0, axisMax]}
								tickLine={false}
								tickMargin={8}
								width={34}
								tick={{
									fontSize: 12,
									fontWeight: 500,
									fill: "var(--dashboardy-muted)",
									opacity: 0.65,
								}}
							/>
							<ChartTooltip
								cursor={{
									stroke:
										"color-mix(in srgb, var(--dashboardy-divider) 85%, transparent)",
									strokeWidth: 1,
								}}
								content={<PerformanceTrendTooltip metric={metric} />}
							/>
							{visibleSeries.map((series) => (
								<Line
									key={series.userId}
									dataKey={series.userId}
									animationDuration={480}
									animationEasing="ease-out"
									name={series.label}
									type="monotone"
									stroke={series.color}
									strokeWidth={2.5}
									connectNulls
									dot={false}
									activeDot={{
										fill: series.color,
										r: 4,
										stroke: "var(--dashboardy-subsurface)",
										strokeWidth: 2,
									}}
								/>
							))}
							{(() => {
								const lastRow = chartData.at(-1);

								if (!lastRow) {
									return null;
								}

								return visibleSeries.map((series) => (
									<ReferenceDot
										key={`${series.userId}-endpoint`}
										x={lastRow.date}
										y={Number(lastRow[series.userId] ?? 0)}
										r={3.5}
										fill={series.color}
										stroke="var(--dashboardy-subsurface)"
										strokeWidth={2}
										ifOverflow="extendDomain"
										zIndex={10}
									/>
								));
							})()}
						</LineChart>
					</ChartContainer>
				)}
			</div>
		</div>
	);
}
