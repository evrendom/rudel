"use client";

import type { UserDailyTrendData } from "@rudel/api-routes";
import { format, parseISO } from "date-fns";
import { useMemo } from "react";
import {
	Area,
	CartesianGrid,
	Line,
	LineChart,
	ReferenceDot,
	XAxis,
	YAxis,
} from "recharts";
import { type ChartConfig, ChartContainer, ChartTooltip } from "@/app/ui/chart";
import { ToggleGroup, ToggleGroupItem } from "@/app/ui/toggle-group";
import type { DashboardHighlightChangeHandler } from "@/features/dashboard/components/dashboard-highlight-state";
import {
	type DashboardPerformanceTrendMetric,
	type DashboardPerformanceTrendSeries,
	getDashboardPerformanceTrendValue,
} from "@/features/dashboard/data/dashboard-performance-trend";
import { formatCompactWholeNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

type TrendChartRow = {
	date: string;
	fullLabel: string;
} & Record<string, number | string>;

function formatMetricValue(
	metric: DashboardPerformanceTrendMetric,
	value: number,
) {
	if (metric === "tokens") {
		if (value >= 1_000_000) {
			return `${(value / 1_000_000).toFixed(1)}M`;
		}

		if (value >= 1_000) {
			return `${(value / 1_000).toFixed(1)}K`;
		}
	}

	return value.toLocaleString();
}

function formatMetricAxisValue(
	metric: DashboardPerformanceTrendMetric,
	value: number,
) {
	if (metric === "tokens") {
		return formatCompactWholeNumber(value);
	}

	return Math.round(value).toLocaleString();
}

function getTrendAreaOpacity(
	hasVisibleHighlightedSeries: boolean,
	isHighlighted: boolean,
) {
	if (!hasVisibleHighlightedSeries) {
		return 0.08;
	}

	return isHighlighted ? 0.22 : 0.03;
}

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

	const rankedPayload = [...payload]
		.filter((item) => {
			const numericValue =
				typeof item.value === "number"
					? item.value
					: Number(item.value ?? Number.NaN);
			return Number.isFinite(numericValue) && numericValue > 0;
		})
		.sort((left, right) => Number(right.value ?? 0) - Number(left.value ?? 0));

	return (
		<div className="flex min-w-52 flex-col gap-1 rounded-md bg-black px-2.5 py-1.5 text-[11px] font-medium leading-tight text-white/90 shadow-lg">
			<div className="flex items-start justify-between gap-4">
				<p className="text-white">{point.fullLabel}</p>
				<p className="shrink-0 text-white/65">
					{metric === "commits"
						? "Commits"
						: metric === "tokens"
							? "Tokens"
							: metric === "repositories"
								? "Repos"
								: "Sessions"}
				</p>
			</div>
			<div className="grid gap-1">
				{rankedPayload.length > 0 ? (
					rankedPayload.map((item) => (
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
								<span className="truncate text-white/65">{item.name}</span>
							</div>
							<span className="shrink-0 font-mono tabular-nums text-white">
								{typeof item.value === "number"
									? formatMetricValue(metric, item.value)
									: item.value}
							</span>
						</div>
					))
				) : (
					<p className="text-white/65">No visible activity</p>
				)}
			</div>
		</div>
	);
}

export function DashboardPerformanceTrendChart({
	className,
	highlightedSeriesId,
	hiddenSeriesIds,
	metric,
	onHighlightDateChange,
	onHighlightSeriesChange,
	onMetricChange,
	onToggleSeries,
	trendData,
	trendSeries,
	availableMetrics = ["sessions", "commits"],
}: {
	availableMetrics?: DashboardPerformanceTrendMetric[];
	className?: string;
	highlightedSeriesId?: string | null;
	hiddenSeriesIds: string[];
	metric: DashboardPerformanceTrendMetric;
	onHighlightDateChange?: (date: string | null) => void;
	onHighlightSeriesChange?: DashboardHighlightChangeHandler;
	onMetricChange: (metric: DashboardPerformanceTrendMetric) => void;
	onToggleSeries: (userId: string) => void;
	trendData: UserDailyTrendData[] | undefined;
	trendSeries: DashboardPerformanceTrendSeries[];
}) {
	const hiddenSeriesSet = useMemo(
		() => new Set(hiddenSeriesIds),
		[hiddenSeriesIds],
	);
	const hasVisibleHighlightedSeries = useMemo(
		() =>
			highlightedSeriesId != null &&
			trendSeries.some(
				(series) =>
					series.userId === highlightedSeriesId &&
					!hiddenSeriesSet.has(series.userId),
			),
		[hiddenSeriesSet, highlightedSeriesId, trendSeries],
	);
	const {
		allSeries,
		axisMax,
		chartConfig,
		chartData,
		seriesTotals,
		visibleSeries,
	} = useMemo(() => {
		const rows = trendData ?? [];

		if (rows.length === 0) {
			return {
				allSeries: [] as DashboardPerformanceTrendSeries[],
				axisMax: 1,
				chartConfig: {} satisfies ChartConfig,
				chartData: [] as TrendChartRow[],
				seriesTotals: {} as Record<string, number>,
				visibleSeries: [] as DashboardPerformanceTrendSeries[],
			};
		}

		const allDates = Array.from(new Set(rows.map((row) => row.date))).sort();
		const rowMap = new Map(
			rows.map((row) => [`${row.user_id}:${row.date}`, row] as const),
		);
		const allSeries = trendSeries;
		const seriesTotals = Object.fromEntries(
			allSeries.map((series) => [series.userId, 0]),
		) as Record<string, number>;

		for (const row of rows) {
			seriesTotals[row.user_id] =
				(seriesTotals[row.user_id] ?? 0) +
				getDashboardPerformanceTrendValue(row, metric);
		}

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
			seriesTotals,
			visibleSeries,
		};
	}, [hiddenSeriesSet, metric, trendData, trendSeries]);
	const orderedVisibleSeries = useMemo(() => {
		if (
			highlightedSeriesId == null ||
			!visibleSeries.some((series) => series.userId === highlightedSeriesId)
		) {
			return visibleSeries;
		}

		return [
			...visibleSeries.filter(
				(series) => series.userId !== highlightedSeriesId,
			),
			...visibleSeries.filter(
				(series) => series.userId === highlightedSeriesId,
			),
		];
	}, [highlightedSeriesId, visibleSeries]);

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

						if (
							nextMetric === "sessions" ||
							nextMetric === "commits" ||
							nextMetric === "tokens"
						) {
							onMetricChange(nextMetric);
						}
					}}
				>
					{availableMetrics.includes("sessions") ? (
						<ToggleGroupItem
							value="sessions"
							className="dashboardy-toggle-item"
						>
							Sessions
						</ToggleGroupItem>
					) : null}
					{availableMetrics.includes("commits") ? (
						<ToggleGroupItem value="commits" className="dashboardy-toggle-item">
							Commits
						</ToggleGroupItem>
					) : null}
					{availableMetrics.includes("tokens") ? (
						<ToggleGroupItem value="tokens" className="dashboardy-toggle-item">
							Tokens
						</ToggleGroupItem>
					) : null}
				</ToggleGroup>
				<div className="flex flex-wrap items-center gap-1.5 sm:max-w-[65%] sm:justify-end">
					{allSeries.map((series) => {
						const isHidden = hiddenSeriesSet.has(series.userId);
						const isHighlighted = highlightedSeriesId === series.userId;
						const total = seriesTotals[series.userId] ?? 0;

						return (
							<button
								key={series.userId}
								type="button"
								aria-pressed={!isHidden}
								aria-label={`${isHidden ? "Show" : "Hide"} ${series.label} in chart`}
								className={cn(
									"inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[12px] font-medium transition-[opacity,border-color,background-color,color] duration-300",
									isHidden
										? "border-[color:var(--dashboardy-border)] bg-transparent text-[color:var(--dashboardy-muted)]"
										: "border-[color:var(--dashboardy-border)] bg-[color:var(--dashboardy-surface)] text-[color:var(--dashboardy-heading)]",
									hasVisibleHighlightedSeries && !isHighlighted && "opacity-35",
									hasVisibleHighlightedSeries &&
										isHighlighted &&
										"border-[color:var(--dashboardy-heading)]",
								)}
								onClick={() => onToggleSeries(series.userId)}
								onFocus={() =>
									onHighlightSeriesChange?.(series.userId, "chart")
								}
								onBlur={() => onHighlightSeriesChange?.(null)}
								onMouseEnter={() =>
									onHighlightSeriesChange?.(series.userId, "chart")
								}
								onMouseLeave={() => onHighlightSeriesChange?.(null)}
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
								<span className="font-mono text-[11px] tabular-nums text-[color:var(--dashboardy-muted)]">
									{formatMetricValue(metric, total)}
								</span>
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
							onMouseLeave={() => onHighlightDateChange?.(null)}
							onMouseMove={(state: { activeLabel?: unknown }) => {
								onHighlightDateChange?.(
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
								tickFormatter={(value) =>
									formatMetricAxisValue(metric, Number(value))
								}
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
								allowEscapeViewBox={{ x: true, y: true }}
								cursor={{
									stroke:
										"color-mix(in srgb, var(--dashboardy-divider) 85%, transparent)",
									strokeWidth: 1,
								}}
								wrapperStyle={{ pointerEvents: "none", zIndex: 20 }}
								content={<PerformanceTrendTooltip metric={metric} />}
							/>
							{orderedVisibleSeries.map((series) => {
								const isHighlighted = highlightedSeriesId === series.userId;

								return (
									<Area
										key={`${series.userId}-fill`}
										type="monotone"
										dataKey={series.userId}
										stroke="none"
										fill={series.color}
										fillOpacity={getTrendAreaOpacity(
											hasVisibleHighlightedSeries,
											isHighlighted,
										)}
										isAnimationActive={false}
										connectNulls
									/>
								);
							})}
							{orderedVisibleSeries.map((series) => (
								<Line
									key={series.userId}
									dataKey={series.userId}
									animationDuration={480}
									animationEasing="ease-out"
									name={series.label}
									type="monotone"
									stroke={series.color}
									strokeOpacity={
										hasVisibleHighlightedSeries &&
										highlightedSeriesId !== series.userId
											? 0.16
											: 1
									}
									strokeWidth={
										highlightedSeriesId === series.userId ? 3.25 : 2.5
									}
									connectNulls
									dot={false}
									activeDot={{
										fill: series.color,
										r: highlightedSeriesId === series.userId ? 4.5 : 4,
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

								return orderedVisibleSeries.map((series) => (
									<ReferenceDot
										key={`${series.userId}-endpoint`}
										x={lastRow.date}
										y={Number(lastRow[series.userId] ?? 0)}
										r={highlightedSeriesId === series.userId ? 4 : 3.5}
										fill={series.color}
										fillOpacity={
											hasVisibleHighlightedSeries &&
											highlightedSeriesId !== series.userId
												? 0.16
												: 1
										}
										stroke="var(--dashboardy-subsurface)"
										strokeOpacity={
											hasVisibleHighlightedSeries &&
											highlightedSeriesId !== series.userId
												? 0.3
												: 1
										}
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
