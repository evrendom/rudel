"use client";

import type { RepositoryDailyTrendData } from "@rudel/api-routes";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/app/ui/popover";
import { ToggleGroup, ToggleGroupItem } from "@/app/ui/toggle-group";
import {
	type DashboardRepositorySummaryRow,
	type DashboardRepositoryTrendMetric,
	type DashboardRepositoryTrendSeries,
	getDashboardRepositoryTrendValue,
} from "@/features/dashboard/data/dashboard-repository-trend";
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

function getTrendAreaOpacity(
	hasVisibleHighlightedSeries: boolean,
	isHighlighted: boolean,
) {
	if (!hasVisibleHighlightedSeries) {
		return 0.08;
	}

	return isHighlighted ? 0.22 : 0.03;
}

function RepositoryTrendTooltip({
	active,
	metric,
	payload,
}: {
	active?: boolean;
	metric: DashboardRepositoryTrendMetric;
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
		<div className="flex min-w-52 flex-col gap-1 rounded-md bg-black px-2.5 py-1.5 text-[11px] font-medium leading-tight text-white/90 shadow-lg">
			<div className="flex items-start justify-between gap-4">
				<p className="text-white">{point.fullLabel}</p>
				<p className="shrink-0 text-white/65">
					{metric === "commits" ? "Commits" : "Sessions"}
				</p>
			</div>
			<div className="grid gap-1">
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
							<span className="truncate text-white/65">{item.name}</span>
						</div>
						<span className="shrink-0 font-mono tabular-nums text-white">
							{typeof item.value === "number"
								? item.value.toLocaleString()
								: item.value}
						</span>
					</div>
				))}
			</div>
		</div>
	);
}

function DashboardRepositoryTrendOverflowPopover({
	rows,
}: {
	rows: DashboardRepositorySummaryRow[];
}) {
	return (
		<Popover>
			<PopoverTrigger className="rounded-sm text-[11px] font-medium text-[color:var(--dashboardy-muted)] transition-colors hover:text-[color:var(--dashboardy-heading)]">
				({rows.length} more)
			</PopoverTrigger>
			<PopoverContent
				side="bottom"
				align="end"
				sideOffset={6}
				className="max-h-56 min-w-40 max-w-[18rem] gap-1 overflow-y-auto rounded-lg px-2.5 py-2 text-[11px] shadow-md"
			>
				<div className="grid gap-0.5 text-muted-foreground">
					{rows.map((row) => (
						<p key={row.id} className="truncate">
							{row.label}
						</p>
					))}
				</div>
			</PopoverContent>
		</Popover>
	);
}

export function DashboardRepositoryTrendChart({
	availableMetrics = ["sessions", "commits"],
	className,
	highlightedSeriesId,
	hiddenRows,
	hiddenSeriesIds,
	metric,
	onHighlightDateChange,
	onMetricChange,
	onToggleSeries,
	trendData,
	trendSeries,
}: {
	availableMetrics?: DashboardRepositoryTrendMetric[];
	className?: string;
	highlightedSeriesId?: string | null;
	hiddenRows: DashboardRepositorySummaryRow[];
	hiddenSeriesIds: string[];
	metric: DashboardRepositoryTrendMetric;
	onHighlightDateChange?: (date: string | null) => void;
	onMetricChange: (metric: DashboardRepositoryTrendMetric) => void;
	onToggleSeries: (repositoryId: string) => void;
	trendData: RepositoryDailyTrendData[] | undefined;
	trendSeries: DashboardRepositoryTrendSeries[];
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
					series.repositoryId === highlightedSeriesId &&
					!hiddenSeriesSet.has(series.repositoryId),
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
				allSeries: [] as DashboardRepositoryTrendSeries[],
				axisMax: 1,
				chartConfig: {} satisfies ChartConfig,
				chartData: [] as TrendChartRow[],
				seriesTotals: {} as Record<string, number>,
				visibleSeries: [] as DashboardRepositoryTrendSeries[],
			};
		}

		const allDates = Array.from(new Set(rows.map((row) => row.date))).sort();
		const rowMap = new Map(
			rows.map((row) => [`${row.repository}:${row.date}`, row] as const),
		);
		const allSeries = trendSeries;
		const seriesTotals = Object.fromEntries(
			allSeries.map((series) => [series.repositoryId, 0]),
		) as Record<string, number>;

		for (const row of rows) {
			seriesTotals[row.repository] =
				(seriesTotals[row.repository] ?? 0) +
				getDashboardRepositoryTrendValue(row, metric);
		}

		const visibleSeries = allSeries.filter(
			(series) => !hiddenSeriesSet.has(series.repositoryId),
		);
		const chartData = allDates.map((date) => {
			const nextRow: TrendChartRow = {
				date,
				fullLabel: buildFullLabel(date),
			};

			for (const series of allSeries) {
				nextRow[series.repositoryId] = getDashboardRepositoryTrendValue(
					rowMap.get(`${series.repositoryId}:${date}`),
					metric,
				);
			}

			return nextRow;
		});
		const chartConfig = Object.fromEntries(
			allSeries.map((series) => [
				series.repositoryId,
				{
					color: series.color,
					label: series.label,
				},
			]),
		) satisfies ChartConfig;
		const axisMax = Math.max(
			1,
			...chartData.flatMap((row) =>
				visibleSeries.map((series) => Number(row[series.repositoryId] ?? 0)),
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
			!visibleSeries.some(
				(series) => series.repositoryId === highlightedSeriesId,
			)
		) {
			return visibleSeries;
		}

		return [
			...visibleSeries.filter(
				(series) => series.repositoryId !== highlightedSeriesId,
			),
			...visibleSeries.filter(
				(series) => series.repositoryId === highlightedSeriesId,
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
				No repository activity in the selected range.
			</div>
		);
	}

	return (
		<div className={cn("flex h-full min-h-0 flex-col gap-3", className)}>
			<div className="flex flex-col gap-3 px-1 sm:flex-row sm:items-start sm:justify-between">
				<ToggleGroup
					aria-label="Repository performance metric"
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
				</ToggleGroup>
				<div className="flex flex-wrap items-center gap-1.5 sm:max-w-[65%] sm:justify-end">
					{allSeries.map((series) => {
						const isHidden = hiddenSeriesSet.has(series.repositoryId);
						const isHighlighted = highlightedSeriesId === series.repositoryId;
						const total = seriesTotals[series.repositoryId] ?? 0;

						return (
							<button
								key={series.repositoryId}
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
								onClick={() => onToggleSeries(series.repositoryId)}
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
									{total.toLocaleString()}
								</span>
							</button>
						);
					})}
					{hiddenRows.length > 0 ? (
						<DashboardRepositoryTrendOverflowPopover rows={hiddenRows} />
					) : null}
				</div>
			</div>

			<div className="min-h-0 flex-1">
				{visibleSeries.length === 0 ? (
					<div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
						Select at least one repository.
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
								content={<RepositoryTrendTooltip metric={metric} />}
							/>
							{orderedVisibleSeries.map((series) => {
								const isHighlighted =
									highlightedSeriesId === series.repositoryId;

								return (
									<Area
										key={`${series.repositoryId}-fill`}
										type="monotone"
										dataKey={series.repositoryId}
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
									key={series.repositoryId}
									dataKey={series.repositoryId}
									animationDuration={480}
									animationEasing="ease-out"
									name={series.label}
									type="monotone"
									stroke={series.color}
									strokeOpacity={
										hasVisibleHighlightedSeries &&
										highlightedSeriesId !== series.repositoryId
											? 0.16
											: 1
									}
									strokeWidth={
										highlightedSeriesId === series.repositoryId ? 3.25 : 2.5
									}
									connectNulls
									dot={false}
									activeDot={{
										fill: series.color,
										r: highlightedSeriesId === series.repositoryId ? 4.5 : 4,
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
										key={`${series.repositoryId}-endpoint`}
										x={lastRow.date}
										y={Number(lastRow[series.repositoryId] ?? 0)}
										r={highlightedSeriesId === series.repositoryId ? 4 : 3.5}
										fill={series.color}
										fillOpacity={
											hasVisibleHighlightedSeries &&
											highlightedSeriesId !== series.repositoryId
												? 0.16
												: 1
										}
										stroke="var(--dashboardy-subsurface)"
										strokeOpacity={
											hasVisibleHighlightedSeries &&
											highlightedSeriesId !== series.repositoryId
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
