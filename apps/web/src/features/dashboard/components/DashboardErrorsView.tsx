import type { ErrorsDashboard, ErrorTrendDataPoint } from "@rudel/api-routes";
import { format, parseISO } from "date-fns";
import { FolderGit2Icon, GaugeIcon } from "lucide-react";
import { useMemo, useState } from "react";
import {
	Area,
	Bar,
	BarChart,
	CartesianGrid,
	Line,
	LineChart,
	Rectangle,
	ReferenceDot,
	XAxis,
	YAxis,
} from "recharts";
import { type ChartConfig, ChartContainer, ChartTooltip } from "@/app/ui/chart";
import { Popover, PopoverContent, PopoverTrigger } from "@/app/ui/popover";
import { ToggleGroup, ToggleGroupItem } from "@/app/ui/toggle-group";
import { DashboardAnalysisPanel } from "@/features/dashboard/components/DashboardAnalysisPanel";
import {
	DashboardCellStack,
	DashboardGridTable,
	DashboardInlineOverflowList,
	DashboardTableFooterNote,
} from "@/features/dashboard/components/DashboardGridTable";
import { DashboardInteractiveTopChartSection } from "@/features/dashboard/components/DashboardTopChartSection";
import {
	buildErrorDailyPoints,
	buildErrorDimensionBarRows,
	buildErrorDimensionRows,
	buildErrorHeadlineMetrics,
	buildErrorTrendRows,
	type DashboardErrorDailyPoint,
	type DashboardErrorDimensionBarDatum,
	type DashboardErrorDimensionRow,
	type DashboardErrorDimensionSeries,
	type DashboardErrorMetric,
	type DashboardErrorTrendChartRow,
	formatErrorMetricValue,
	getErrorMetricLabel,
	getErrorMetricValue,
} from "@/features/dashboard/data/dashboard-error-adapters";
import { cn } from "@/lib/utils";

type ErrorDimensionView = "total" | "over-time";
type ErrorHighlightSource = "chart" | "table" | null;

const ERROR_TREND_COLORS = [
	"#EF4444",
	"#F97316",
	"#F59E0B",
	"#14B8A6",
	"#3B82F6",
	"#8B5CF6",
	"#EC4899",
] as const;

const MAX_VISIBLE_ERROR_TREND_SERIES = 7;
const MAX_VISIBLE_ERROR_TABLE_ROWS = 10;

const ERROR_DAILY_CHART_CONFIG = {
	totalErrors: {
		color: "#EF4444",
		label: "Errors",
	},
} satisfies ChartConfig;

const ERROR_TOTAL_CHART_CONFIG = {
	value: {
		color: "#EF4444",
		label: "Selected metric",
	},
} satisfies ChartConfig;

function getErrorDailyBarSize(total: number) {
	if (total <= 7) {
		return 32;
	}

	if (total <= 14) {
		return 24;
	}

	if (total <= 21) {
		return 18;
	}

	if (total <= 31) {
		return 14;
	}

	return 10;
}

function formatMetricAxisTick(
	metric: DashboardErrorMetric,
	value: number | string,
) {
	const numericValue =
		typeof value === "number" ? value : Number.parseFloat(String(value));

	if (!Number.isFinite(numericValue)) {
		return String(value);
	}

	if (metric === "total_errors") {
		return numericValue.toLocaleString();
	}

	return Math.round(numericValue).toLocaleString();
}

function getTrendTickLabel(dateValue: string, index: number, total: number) {
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

function getTrendAreaOpacity(
	hasVisibleHighlightedSeries: boolean,
	isHighlighted: boolean,
) {
	if (!hasVisibleHighlightedSeries) {
		return 0.08;
	}

	return isHighlighted ? 0.22 : 0.03;
}

function buildErrorTrendChartConfig(
	series: DashboardErrorDimensionSeries[],
): ChartConfig {
	return Object.fromEntries(
		series.map((entry) => [
			entry.id,
			{
				color: entry.color,
				label: entry.label,
			},
		]),
	);
}

function DashboardErrorTrendOverflowPopover({
	rows,
}: {
	rows: DashboardErrorDimensionRow[];
}) {
	return (
		<Popover>
			<PopoverTrigger className="rounded-sm text-[11px] font-medium text-[color:var(--dashboardy-muted)] transition-colors hover:text-[color:var(--dashboardy-heading)]">
				({rows.length} more)
			</PopoverTrigger>
			<PopoverContent
				align="end"
				className="max-h-56 min-w-40 max-w-[18rem] gap-1 overflow-y-auto rounded-lg px-2.5 py-2 text-[11px] shadow-md"
				side="bottom"
				sideOffset={6}
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

function ErrorDailyTooltip({
	active,
	payload,
}: {
	active?: boolean;
	payload?: Array<{ payload: DashboardErrorDailyPoint }>;
}) {
	if (!active || !payload?.length) {
		return null;
	}

	const point = payload[0]?.payload;

	if (!point) {
		return null;
	}

	return (
		<div className="flex min-w-48 flex-col gap-1 rounded-md bg-black px-2.5 py-1.5 text-[11px] font-medium leading-tight text-white/90 shadow-lg">
			<p className="text-white">{point.fullLabel}</p>
			<div className="flex items-center justify-between gap-3">
				<span className="text-white/65">Errors</span>
				<span className="tabular-nums text-white">
					{point.totalErrors == null ? "—" : point.totalErrors}
				</span>
			</div>
			<div className="flex items-center justify-between gap-3">
				<span className="text-white/65">Avg / session</span>
				<span className="tabular-nums text-white">
					{point.avgErrorsPerSession == null
						? "—"
						: point.avgErrorsPerSession.toFixed(2)}
				</span>
			</div>
			<div className="flex items-center justify-between gap-3">
				<span className="text-white/65">Hot dimensions</span>
				<span className="tabular-nums text-white">
					{point.activeDimensions}
				</span>
			</div>
		</div>
	);
}

function ErrorTotalTooltip({
	active,
	metric,
	payload,
}: {
	active?: boolean;
	metric: DashboardErrorMetric;
	payload?: Array<{ payload?: DashboardErrorDimensionBarDatum }>;
}) {
	const point = payload?.[0]?.payload;

	if (!active || !point) {
		return null;
	}

	return (
		<div className="flex min-w-48 flex-col gap-1 rounded-md bg-black px-2.5 py-1.5 text-[11px] font-medium leading-tight text-white/90 shadow-lg">
			<p className="text-white">{point.label}</p>
			<div className="flex items-center justify-between gap-3">
				<span className="text-white/65">{getErrorMetricLabel(metric)}</span>
				<span className="tabular-nums text-white">
					{formatErrorMetricValue(metric, point.value)}
				</span>
			</div>
			<div className="flex items-center justify-between gap-3">
				<span className="text-white/65">Active days</span>
				<span className="tabular-nums text-white">{point.activeDays}</span>
			</div>
		</div>
	);
}

function ErrorDimensionTooltip({
	active,
	metric,
	nameById,
	payload,
}: {
	active?: boolean;
	metric: DashboardErrorMetric;
	nameById: Map<string, string>;
	payload?: Array<{
		color?: string;
		dataKey?: string | number;
		name?: string | number;
		payload?: DashboardErrorTrendChartRow;
		value?: number | string;
	}>;
}) {
	if (!active || !payload?.length) {
		return null;
	}

	const point = payload[0]?.payload;
	const rankedPayload = [...payload]
		.filter((entry) => {
			const numericValue =
				typeof entry.value === "number"
					? entry.value
					: Number(entry.value ?? Number.NaN);

			return Number.isFinite(numericValue) && numericValue > 0;
		})
		.sort((left, right) => Number(right.value ?? 0) - Number(left.value ?? 0));

	return (
		<div className="flex min-w-52 flex-col gap-1 rounded-md bg-black px-2.5 py-1.5 text-[11px] font-medium leading-tight text-white/90 shadow-lg">
			<p className="text-white">{point?.fullLabel ?? "Selected day"}</p>
			{rankedPayload.length > 0 ? (
				rankedPayload.map((entry) => {
					const seriesId = String(entry.dataKey ?? entry.name ?? "");
					const displayLabel = nameById.get(seriesId) ?? seriesId;
					const numericValue =
						typeof entry.value === "number"
							? entry.value
							: Number(entry.value ?? 0);

					return (
						<div
							key={`${seriesId}-${entry.value ?? "value"}`}
							className="flex items-center justify-between gap-6"
						>
							<div className="flex min-w-0 items-center gap-2.5">
								<span
									aria-hidden="true"
									className="size-2 shrink-0 rounded-full"
									style={{ backgroundColor: entry.color }}
								/>
								<span className="truncate text-white/65">{displayLabel}</span>
							</div>
							<span className="shrink-0 tabular-nums text-white">
								{formatErrorMetricValue(metric, numericValue)}
							</span>
						</div>
					);
				})
			) : (
				<p className="text-white/65">No visible activity</p>
			)}
		</div>
	);
}

function ErrorDailyBarShape({
	activeDate,
	activeSource,
	fill,
	height,
	payload,
	width,
	x,
	y,
}: {
	activeDate?: string | null;
	activeSource?: "chart" | "table" | null;
	fill?: string;
	height?: number;
	payload?: DashboardErrorDailyPoint;
	width?: number;
	x?: number;
	y?: number;
}) {
	if (
		typeof x !== "number" ||
		typeof y !== "number" ||
		typeof width !== "number" ||
		typeof height !== "number" ||
		!payload ||
		height <= 0
	) {
		return null;
	}

	const isHighlighted = activeDate === payload.date;
	const hasExternalHighlight = activeDate != null;
	const showStroke = isHighlighted;
	const barOpacity =
		hasExternalHighlight && !isHighlighted
			? activeSource === "table"
				? 0.16
				: 0.26
			: 1;

	return (
		<Rectangle
			fill={fill}
			height={height}
			radius={[4, 4, 0, 0]}
			stroke="color-mix(in srgb, var(--dashboardy-heading) 22%, transparent)"
			strokeWidth={showStroke ? 1 : 0}
			style={{
				opacity: barOpacity,
				strokeOpacity: showStroke ? 1 : 0,
				transition:
					"opacity 300ms cubic-bezier(0.23, 1, 0.32, 1), stroke-opacity 300ms cubic-bezier(0.23, 1, 0.32, 1)",
			}}
			width={width}
			x={x}
			y={y}
		/>
	);
}

function ErrorDimensionBarShape({
	activeId,
	activeSource,
	fill,
	height,
	payload,
	width,
	x,
	y,
}: {
	activeId?: string | null;
	activeSource?: ErrorHighlightSource;
	fill?: string;
	height?: number;
	payload?: DashboardErrorDimensionBarDatum;
	width?: number;
	x?: number;
	y?: number;
}) {
	if (
		typeof x !== "number" ||
		typeof y !== "number" ||
		typeof width !== "number" ||
		typeof height !== "number" ||
		!payload ||
		height <= 0
	) {
		return null;
	}

	const isHighlighted = activeId === payload.id;
	const hasExternalHighlight = activeId != null;
	const showStroke = isHighlighted;

	return (
		<Rectangle
			fill={fill}
			height={height}
			radius={[4, 4, 0, 0]}
			stroke="color-mix(in srgb, var(--dashboardy-heading) 22%, transparent)"
			strokeWidth={showStroke ? 1 : 0}
			style={{
				opacity:
					hasExternalHighlight && !isHighlighted
						? activeSource === "table"
							? 0.16
							: 0.26
						: 1,
				strokeOpacity: showStroke ? 1 : 0,
				transition:
					"opacity 300ms cubic-bezier(0.23, 1, 0.32, 1), stroke-opacity 300ms cubic-bezier(0.23, 1, 0.32, 1)",
			}}
			width={width}
			x={x}
			y={y}
		/>
	);
}

function DashboardErrorDailySnapshot({
	endDate,
	errorDashboard,
	startDate,
	trendData,
}: {
	endDate: string;
	errorDashboard: ErrorsDashboard | undefined;
	startDate: string;
	trendData: ErrorTrendDataPoint[] | undefined;
}) {
	const metrics = useMemo(
		() => buildErrorHeadlineMetrics(errorDashboard),
		[errorDashboard],
	);
	const dailyPoints = useMemo(
		() => buildErrorDailyPoints(startDate, endDate, trendData),
		[endDate, startDate, trendData],
	);
	const barSize = getErrorDailyBarSize(dailyPoints.length);

	return (
		<DashboardInteractiveTopChartSection
			metrics={metrics}
			renderChart={({
				highlightedItemId,
				highlightSource,
				onHighlightItemChange,
			}) => (
				<div className="flex min-w-0 flex-1 pt-0 md:pt-4">
					<ChartContainer
						className="h-[12.875rem] w-full aspect-auto"
						config={ERROR_DAILY_CHART_CONFIG}
						initialDimension={{ height: 206, width: 664 }}
					>
						<BarChart
							barCategoryGap={0}
							barSize={barSize}
							data={dailyPoints}
							margin={{ bottom: 10, left: 0, right: 18, top: 2 }}
							onMouseLeave={() => onHighlightItemChange(null)}
							onMouseMove={(state: { activeLabel?: unknown }) => {
								onHighlightItemChange(
									typeof state.activeLabel === "string"
										? state.activeLabel
										: null,
									"chart",
								);
							}}
						>
							<XAxis
								axisLine={{
									stroke:
										"color-mix(in srgb, var(--dashboardy-muted) 40%, transparent)",
								}}
								dataKey="date"
								height={22}
								tick={{
									fill: "var(--dashboardy-muted)",
									fontSize: 12,
									fontWeight: 500,
									opacity: 0.38,
								}}
								tickFormatter={(value, index) => {
									const total = dailyPoints.length;

									if (highlightedItemId != null) {
										return highlightedItemId === value
											? total <= 7
												? format(parseISO(value), "EEE d")
												: format(parseISO(value), "MMM d")
											: "";
									}

									if (index !== 0 && index !== total - 1) {
										return "";
									}

									return total <= 7
										? format(parseISO(value), "EEE d")
										: format(parseISO(value), "MMM d");
								}}
								tickLine={false}
								tickMargin={4}
							/>
							<YAxis
								allowDecimals={false}
								axisLine={{
									stroke:
										"color-mix(in srgb, var(--dashboardy-muted) 40%, transparent)",
								}}
								orientation="right"
								tick={{
									fill: "var(--dashboardy-muted)",
									fontSize: 12,
									fontWeight: 500,
									opacity: 0.38,
								}}
								tickLine={{
									stroke:
										"color-mix(in srgb, var(--dashboardy-muted) 40%, transparent)",
								}}
								tickMargin={4}
								width={48}
							/>
							<ChartTooltip
								content={<ErrorDailyTooltip />}
								cursor={false}
								wrapperStyle={{ pointerEvents: "none", zIndex: 20 }}
							/>
							<Bar
								dataKey="totalErrors"
								fill="var(--color-totalErrors)"
								isAnimationActive={false}
								shape={
									<ErrorDailyBarShape
										activeDate={highlightedItemId}
										activeSource={highlightSource}
									/>
								}
							/>
						</BarChart>
					</ChartContainer>
				</div>
			)}
			renderDetail={({
				highlightedItemId,
				highlightSource,
				onHighlightItemChange,
			}) => (
				<DashboardErrorDailyTable
					highlightSource={highlightSource}
					highlightedDate={highlightedItemId}
					onHighlightDateChange={onHighlightItemChange}
					rows={dailyPoints}
				/>
			)}
		/>
	);
}

function DashboardErrorDailyTable({
	rows,
	highlightedDate,
	highlightSource,
	onHighlightDateChange,
}: {
	highlightSource?: ErrorHighlightSource;
	highlightedDate?: string | null;
	onHighlightDateChange: (date: string | null) => void;
	rows: DashboardErrorDailyPoint[];
}) {
	const hasTableHighlight =
		highlightSource === "table" && highlightedDate != null;
	const hasChartHighlight =
		highlightSource === "chart" && highlightedDate != null;
	const reversedRows = useMemo(() => rows.slice().reverse(), [rows]);
	const visibleRows = useMemo(
		() => reversedRows.slice(0, MAX_VISIBLE_ERROR_TABLE_ROWS),
		[reversedRows],
	);
	const hiddenRowCount = Math.max(reversedRows.length - visibleRows.length, 0);

	return (
		<DashboardGridTable
			bodyClassName="gap-0"
			columns={[
				{
					header: "Day",
					id: "day",
					renderCell: (row) => {
						const parsedDate = parseISO(row.date);

						return (
							<DashboardCellStack
								primary={
									Number.isNaN(parsedDate.getTime())
										? row.axisLabel
										: format(parsedDate, "EEEE")
								}
								secondary={
									Number.isNaN(parsedDate.getTime())
										? row.date
										: format(parsedDate, "MMM d")
								}
								secondaryClassName="font-mono"
							/>
						);
					},
				},
				{
					header: "Errors",
					id: "errors",
					renderCell: (row) => (
						<p className="font-medium tabular-nums text-[color:var(--dashboardy-heading)]">
							{row.totalErrors ?? "-"}
						</p>
					),
				},
				{
					header: "Avg / session",
					id: "avg-per-session",
					renderCell: (row) => (
						<p className="font-medium tabular-nums text-[color:var(--dashboardy-heading)]">
							{row.avgErrorsPerSession == null
								? "-"
								: row.avgErrorsPerSession.toFixed(2)}
						</p>
					),
				},
				{
					header: "Hot dims",
					id: "hot-dims",
					renderCell: (row) => (
						<p className="font-medium tabular-nums text-[color:var(--dashboardy-heading)]">
							{row.activeDimensions}
						</p>
					),
				},
				{
					header: "Overview",
					id: "overview",
					renderCell: (row) => {
						const visibleErrorTypes = row.errorTypes.slice(0, 3);
						const hiddenErrorTypes = row.errorTypes.slice(3);

						return visibleErrorTypes.length > 0 ? (
							<p className="truncate text-[13px] font-medium text-[color:var(--dashboardy-heading)]">
								<DashboardInlineOverflowList
									hiddenItems={hiddenErrorTypes}
									overflowLabel={`${hiddenErrorTypes.length} more`}
									visibleItems={visibleErrorTypes}
								/>
							</p>
						) : (
							<span className="text-[12px] text-[color:var(--dashboardy-muted)]">
								—
							</span>
						);
					},
				},
			]}
			footer={
				hiddenRowCount > 0 ? (
					<DashboardTableFooterNote>
						<p>{hiddenRowCount} more</p>
					</DashboardTableFooterNote>
				) : null
			}
			getHoverRowId={(row) => row.date}
			gridTemplateColumns="minmax(180px,1.2fr) 100px 120px 120px minmax(160px,1fr)"
			minWidthClassName="min-w-[54rem]"
			onRowHoverChange={onHighlightDateChange}
			rowClassName={(row) =>
				cn(
					"w-full text-left transition-colors duration-300 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)]",
					hasTableHighlight &&
						"bg-[color:var(--dashboardy-surface)] odd:bg-[color:var(--dashboardy-surface)]",
					hasChartHighlight &&
						highlightedDate === row.date &&
						"bg-[color:var(--dashboardy-surface)] odd:bg-[color:var(--dashboardy-surface)]",
					hasTableHighlight &&
						highlightedDate === row.date &&
						"bg-[color:var(--dashboardy-subsurface-strong)] odd:bg-[color:var(--dashboardy-subsurface-strong)]",
				)
			}
			rowKey={(row) => row.date}
			rows={visibleRows}
		/>
	);
}

function DashboardErrorDimensionPanel({
	endDate,
	rows,
	splitBy,
	startDate,
	title,
	userLabelById,
}: {
	endDate: string;
	rows: ErrorTrendDataPoint[] | undefined;
	splitBy: "project_path" | "user_id";
	startDate: string;
	title: string;
	userLabelById: Map<string, string>;
}) {
	const [chartView, setChartView] = useState<ErrorDimensionView>("total");
	const [metric, setMetric] = useState<DashboardErrorMetric>("total_errors");
	const [hiddenSeriesIds, setHiddenSeriesIds] = useState<string[]>([]);
	const [highlightedDimensionId, setHighlightedDimensionId] = useState<
		string | null
	>(null);
	const [highlightedDimensionSource, setHighlightedDimensionSource] =
		useState<ErrorHighlightSource>(null);
	const summaryRows = useMemo(
		() => buildErrorDimensionRows(rows, splitBy, userLabelById),
		[rows, splitBy, userLabelById],
	);
	const rowById = useMemo(
		() => new Map(summaryRows.map((row) => [row.id, row] as const)),
		[summaryRows],
	);
	const visibleSeries = useMemo<DashboardErrorDimensionSeries[]>(
		() =>
			summaryRows
				.slice(0, MAX_VISIBLE_ERROR_TREND_SERIES)
				.map((row, index) => ({
					color: ERROR_TREND_COLORS[index % ERROR_TREND_COLORS.length],
					id: row.id,
					label: row.label,
				})),
		[summaryRows],
	);
	const hiddenRows = useMemo(
		() => summaryRows.slice(MAX_VISIBLE_ERROR_TREND_SERIES),
		[summaryRows],
	);
	const hiddenSeriesSet = useMemo(
		() => new Set(hiddenSeriesIds),
		[hiddenSeriesIds],
	);
	const seriesNameById = useMemo(
		() =>
			new Map(
				visibleSeries.map((series) => [series.id, series.label] as const),
			),
		[visibleSeries],
	);
	const chartConfig = useMemo(
		() => buildErrorTrendChartConfig(visibleSeries),
		[visibleSeries],
	);
	const totalChartRows = useMemo(
		() => buildErrorDimensionBarRows(summaryRows, metric),
		[metric, summaryRows],
	);
	const trendRows = useMemo(
		() => buildErrorTrendRows(startDate, endDate, rows, visibleSeries, metric),
		[endDate, metric, rows, startDate, visibleSeries],
	);
	const visibleTrendSeries = useMemo(
		() => visibleSeries.filter((series) => !hiddenSeriesSet.has(series.id)),
		[hiddenSeriesSet, visibleSeries],
	);
	const hasVisibleHighlightedSeries = useMemo(
		() =>
			highlightedDimensionId != null &&
			visibleTrendSeries.some((series) => series.id === highlightedDimensionId),
		[highlightedDimensionId, visibleTrendSeries],
	);
	const orderedVisibleTrendSeries = useMemo(() => {
		if (
			highlightedDimensionId == null ||
			!visibleTrendSeries.some((series) => series.id === highlightedDimensionId)
		) {
			return visibleTrendSeries;
		}

		return [
			...visibleTrendSeries.filter(
				(series) => series.id !== highlightedDimensionId,
			),
			...visibleTrendSeries.filter(
				(series) => series.id === highlightedDimensionId,
			),
		];
	}, [highlightedDimensionId, visibleTrendSeries]);
	const trendAxisMax = useMemo(
		() =>
			Math.max(
				1,
				...trendRows.flatMap((row) =>
					visibleTrendSeries.map((series) => Number(row[series.id] ?? 0)),
				),
			),
		[trendRows, visibleTrendSeries],
	);
	const rowMap = useMemo(
		() =>
			new Map(
				(rows ?? []).map(
					(row) => [`${row.dimension}:${row.date}`, row] as const,
				),
			),
		[rows],
	);
	const dimensionLabel =
		splitBy === "project_path" ? "repository" : "developer";
	const totalViewSummary = `Top ${Math.min(totalChartRows.length, 10)} ${dimensionLabel}${Math.min(totalChartRows.length, 10) === 1 ? "" : "s"} by ${getErrorMetricLabel(metric).toLowerCase()}.`;

	function handleToggleSeries(id: string) {
		setHiddenSeriesIds((currentIds) =>
			currentIds.includes(id)
				? currentIds.filter((currentId) => currentId !== id)
				: [...currentIds, id],
		);
	}

	function setDimensionHighlight(
		dimensionId: string | null,
		source: ErrorHighlightSource,
	) {
		setHighlightedDimensionId(dimensionId);
		setHighlightedDimensionSource(dimensionId == null ? null : source);
	}

	return (
		<DashboardAnalysisPanel
			chartContent={
				<div className="flex h-full min-h-0 flex-col gap-3">
					<div className="flex flex-col gap-3 px-1 sm:flex-row sm:items-start sm:justify-between">
						<ToggleGroup
							aria-label={`${title} error metric`}
							className="dashboardy-toggle-group self-start"
							size="sm"
							spacing={0}
							value={[metric]}
							variant="outline"
							onValueChange={(nextValue) => {
								const nextMetric = nextValue[0];
								if (
									nextMetric === "total_errors" ||
									nextMetric === "avg_errors_per_session" ||
									nextMetric === "avg_errors_per_interaction"
								) {
									setMetric(nextMetric);
								}
							}}
						>
							<ToggleGroupItem
								className="dashboardy-toggle-item"
								value="total_errors"
							>
								Errors
							</ToggleGroupItem>
							<ToggleGroupItem
								className="dashboardy-toggle-item"
								value="avg_errors_per_session"
							>
								Avg / session
							</ToggleGroupItem>
							<ToggleGroupItem
								className="dashboardy-toggle-item"
								value="avg_errors_per_interaction"
							>
								Avg / interaction
							</ToggleGroupItem>
						</ToggleGroup>
						{chartView === "over-time" ? (
							<div className="flex flex-wrap items-center gap-1.5 sm:max-w-[65%] sm:justify-end">
								{visibleSeries.map((series) => {
									const isHidden = hiddenSeriesSet.has(series.id);
									const isHighlighted = highlightedDimensionId === series.id;
									const row = rowById.get(series.id);
									const totalValue = row ? getErrorMetricValue(row, metric) : 0;

									return (
										<button
											key={series.id}
											aria-label={`${isHidden ? "Show" : "Hide"} ${series.label} in chart`}
											aria-pressed={!isHidden}
											className={cn(
												"inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[12px] font-medium transition-[opacity,border-color,background-color,color] duration-300",
												isHidden
													? "border-[color:var(--dashboardy-border)] bg-transparent text-[color:var(--dashboardy-muted)]"
													: "border-[color:var(--dashboardy-border)] bg-[color:var(--dashboardy-surface)] text-[color:var(--dashboardy-heading)]",
												hasVisibleHighlightedSeries &&
													!isHighlighted &&
													"opacity-35",
												hasVisibleHighlightedSeries &&
													isHighlighted &&
													"border-[color:var(--dashboardy-heading)]",
											)}
											type="button"
											onClick={() => handleToggleSeries(series.id)}
											onMouseEnter={() =>
												setDimensionHighlight(series.id, "chart")
											}
											onMouseLeave={() => setDimensionHighlight(null, null)}
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
												{formatErrorMetricValue(metric, totalValue)}
											</span>
										</button>
									);
								})}
								{hiddenRows.length > 0 ? (
									<DashboardErrorTrendOverflowPopover rows={hiddenRows} />
								) : null}
							</div>
						) : (
							<p className="text-xs font-medium text-[color:var(--dashboardy-muted)]">
								{totalViewSummary}
							</p>
						)}
					</div>
					<div className="min-h-0 flex-1">
						{summaryRows.length === 0 ? (
							<div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
								No error activity in the selected range.
							</div>
						) : chartView === "total" ? (
							<ChartContainer
								className="h-full w-full aspect-auto [&_.recharts-cartesian-grid-vertical_line]:stroke-transparent"
								config={ERROR_TOTAL_CHART_CONFIG}
								initialDimension={{ height: 320, width: 664 }}
							>
								<BarChart
									barCategoryGap={12}
									data={totalChartRows}
									margin={{ bottom: 14, left: 0, right: 12, top: 12 }}
									onMouseLeave={() => setDimensionHighlight(null, null)}
									onMouseMove={(state) => {
										const nextId =
											(
												state as {
													activePayload?: Array<{
														payload?: DashboardErrorDimensionBarDatum;
													}>;
												}
											).activePayload?.[0]?.payload?.id ?? null;
										setDimensionHighlight(nextId, nextId ? "chart" : null);
									}}
								>
									<CartesianGrid
										stroke="color-mix(in srgb, var(--dashboardy-divider) 68%, transparent)"
										strokeDasharray="0"
										vertical={false}
									/>
									<XAxis
										axisLine={false}
										dataKey="shortLabel"
										tick={{
											fill: "var(--dashboardy-muted)",
											fontSize: 12,
											fontWeight: 500,
											opacity: 0.65,
										}}
										tickLine={false}
										tickMargin={8}
									/>
									<YAxis
										allowDecimals={false}
										axisLine={false}
										tick={{
											fill: "var(--dashboardy-muted)",
											fontSize: 12,
											fontWeight: 500,
											opacity: 0.65,
										}}
										tickFormatter={(value) =>
											formatMetricAxisTick(metric, value)
										}
										tickLine={false}
										tickMargin={8}
										width={56}
									/>
									<ChartTooltip
										content={<ErrorTotalTooltip metric={metric} />}
										cursor={false}
										wrapperStyle={{ pointerEvents: "none", zIndex: 20 }}
									/>
									<Bar
										dataKey="value"
										fill="var(--color-value)"
										isAnimationActive={false}
										shape={
											<ErrorDimensionBarShape
												activeId={highlightedDimensionId}
												activeSource={highlightedDimensionSource}
											/>
										}
									/>
								</BarChart>
							</ChartContainer>
						) : visibleTrendSeries.length === 0 ? (
							<div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
								Select at least one {dimensionLabel}.
							</div>
						) : (
							<ChartContainer
								className="h-full w-full aspect-auto [&_.recharts-cartesian-grid-vertical_line]:stroke-transparent [&_.recharts-curve]:drop-shadow-none"
								config={chartConfig}
								initialDimension={{ height: 320, width: 664 }}
							>
								<LineChart
									data={trendRows}
									margin={{ bottom: 8, left: 0, right: 12, top: 12 }}
								>
									<CartesianGrid
										stroke="color-mix(in srgb, var(--dashboardy-divider) 68%, transparent)"
										strokeDasharray="0"
										vertical={false}
									/>
									<XAxis
										axisLine={false}
										dataKey="date"
										minTickGap={24}
										tick={{
											fill: "var(--dashboardy-muted)",
											fontSize: 12,
											fontWeight: 500,
											opacity: 0.65,
										}}
										tickFormatter={(value, index) =>
											getTrendTickLabel(String(value), index, trendRows.length)
										}
										tickLine={false}
										tickMargin={8}
									/>
									<YAxis
										allowDecimals={false}
										axisLine={false}
										domain={[0, trendAxisMax]}
										orientation="right"
										tick={{
											fill: "var(--dashboardy-muted)",
											fontSize: 12,
											fontWeight: 500,
											opacity: 0.65,
										}}
										tickFormatter={(value) =>
											formatMetricAxisTick(metric, value)
										}
										tickLine={false}
										tickMargin={8}
										width={56}
									/>
									<ChartTooltip
										allowEscapeViewBox={{ x: true, y: true }}
										content={
											<ErrorDimensionTooltip
												metric={metric}
												nameById={seriesNameById}
											/>
										}
										cursor={{
											stroke:
												"color-mix(in srgb, var(--dashboardy-divider) 85%, transparent)",
											strokeWidth: 1,
										}}
										wrapperStyle={{ pointerEvents: "none", zIndex: 20 }}
									/>
									{orderedVisibleTrendSeries.map((series) => {
										const isHighlighted = highlightedDimensionId === series.id;

										return (
											<Area
												key={`${series.id}-fill`}
												connectNulls
												dataKey={series.id}
												fill={series.color}
												fillOpacity={getTrendAreaOpacity(
													hasVisibleHighlightedSeries,
													isHighlighted,
												)}
												isAnimationActive={false}
												stroke="none"
												type="monotone"
											/>
										);
									})}
									{orderedVisibleTrendSeries.map((series) => (
										<Line
											key={series.id}
											activeDot={{
												fill: series.color,
												r: highlightedDimensionId === series.id ? 4.5 : 4,
												stroke: "var(--dashboardy-subsurface)",
												strokeWidth: 2,
											}}
											animationDuration={480}
											animationEasing="ease-out"
											connectNulls
											dataKey={series.id}
											dot={false}
											name={series.label}
											stroke={series.color}
											strokeOpacity={
												hasVisibleHighlightedSeries &&
												highlightedDimensionId !== series.id
													? 0.16
													: 1
											}
											strokeWidth={
												highlightedDimensionId === series.id ? 3.25 : 2.5
											}
											type="monotone"
										/>
									))}
									{(() => {
										const lastRow = trendRows.at(-1);

										if (!lastRow) {
											return null;
										}

										return orderedVisibleTrendSeries.map((series) => (
											<ReferenceDot
												key={`${series.id}-endpoint`}
												fill={series.color}
												fillOpacity={
													hasVisibleHighlightedSeries &&
													highlightedDimensionId !== series.id
														? 0.16
														: 1
												}
												ifOverflow="extendDomain"
												r={highlightedDimensionId === series.id ? 4 : 3.5}
												stroke="var(--dashboardy-subsurface)"
												strokeOpacity={
													hasVisibleHighlightedSeries &&
													highlightedDimensionId !== series.id
														? 0.3
														: 1
												}
												strokeWidth={2}
												x={lastRow.date}
												y={Number(lastRow[series.id] ?? 0)}
												zIndex={10}
											/>
										));
									})()}
								</LineChart>
							</ChartContainer>
						)}
					</div>
				</div>
			}
			controls={
				<ToggleGroup
					aria-label={`${title} error chart view`}
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
					<ToggleGroupItem className="dashboardy-toggle-item" value="total">
						Total
					</ToggleGroupItem>
					<ToggleGroupItem className="dashboardy-toggle-item" value="over-time">
						Over time
					</ToggleGroupItem>
				</ToggleGroup>
			}
			icon={
				splitBy === "project_path" ? (
					<FolderGit2Icon className="size-5 text-[color:var(--dashboardy-heading)]" />
				) : (
					<GaugeIcon className="size-5 text-[color:var(--dashboardy-heading)]" />
				)
			}
			tableContent={
				<DashboardErrorDimensionTable
					highlightSource={highlightedDimensionSource}
					highlightedDate={null}
					highlightedDimensionId={highlightedDimensionId}
					onHighlightDimensionChange={(dimensionId) =>
						setDimensionHighlight(dimensionId, dimensionId ? "table" : null)
					}
					rowMap={rowMap}
					rows={summaryRows}
				/>
			}
			title={title}
		/>
	);
}

function DashboardErrorDimensionTable({
	highlightSource,
	highlightedDimensionId,
	rows,
	rowMap,
	highlightedDate,
	onHighlightDimensionChange,
}: {
	highlightSource?: ErrorHighlightSource;
	highlightedDimensionId?: string | null;
	highlightedDate: string | null;
	onHighlightDimensionChange?: (dimensionId: string | null) => void;
	rowMap: Map<string, ErrorTrendDataPoint>;
	rows: DashboardErrorDimensionRow[];
}) {
	const hasTableHighlight =
		highlightSource === "table" && highlightedDimensionId != null;
	const hasChartHighlight =
		highlightSource === "chart" && highlightedDimensionId != null;
	const visibleRows = useMemo(
		() => rows.slice(0, MAX_VISIBLE_ERROR_TABLE_ROWS),
		[rows],
	);
	const hiddenRowCount = Math.max(rows.length - visibleRows.length, 0);

	return (
		<DashboardGridTable
			bodyClassName="gap-0"
			columns={[
				{
					header: "Dimension",
					id: "dimension",
					renderCell: (row) => (
						<p className="truncate font-semibold text-[color:var(--dashboardy-heading)]">
							{row.label}
						</p>
					),
				},
				{
					header: "Errors",
					id: "errors",
					renderCell: (row) => {
						const highlightedRow =
							highlightedDate != null
								? rowMap.get(`${row.id}:${highlightedDate}`)
								: undefined;

						return (
							<p className="font-medium tabular-nums text-[color:var(--dashboardy-heading)]">
								{highlightedRow?.total_errors ?? row.totalErrors}
							</p>
						);
					},
				},
				{
					header: "Avg / session",
					id: "avg-session",
					renderCell: (row) => {
						const highlightedRow =
							highlightedDate != null
								? rowMap.get(`${row.id}:${highlightedDate}`)
								: undefined;
						const value =
							highlightedRow?.avg_errors_per_session ?? row.avgErrorsPerSession;

						return (
							<p className="font-medium tabular-nums text-[color:var(--dashboardy-heading)]">
								{value.toFixed(2)}
							</p>
						);
					},
				},
				{
					header: "Avg / interaction",
					id: "avg-interaction",
					renderCell: (row) => {
						const highlightedRow =
							highlightedDate != null
								? rowMap.get(`${row.id}:${highlightedDate}`)
								: undefined;
						const value =
							highlightedRow?.avg_errors_per_interaction ??
							row.avgErrorsPerInteraction;

						return (
							<p className="font-medium tabular-nums text-[color:var(--dashboardy-heading)]">
								{value.toFixed(2)}
							</p>
						);
					},
				},
				{
					header: "Active days",
					id: "active-days",
					renderCell: (row) => (
						<p className="font-medium tabular-nums text-[color:var(--dashboardy-heading)]">
							{row.activeDays}
						</p>
					),
				},
			]}
			footer={
				hiddenRowCount > 0 ? (
					<DashboardTableFooterNote>
						<p>{hiddenRowCount} more</p>
					</DashboardTableFooterNote>
				) : null
			}
			getHoverRowId={(row) => row.id}
			gridTemplateColumns="minmax(220px,12fr) 90px 120px 120px 96px"
			minWidthClassName="min-w-[58rem]"
			onRowHoverChange={onHighlightDimensionChange}
			rowClassName={(row) =>
				cn(
					"transition-colors duration-300 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)]",
					hasTableHighlight &&
						"bg-[color:var(--dashboardy-surface)] odd:bg-[color:var(--dashboardy-surface)]",
					hasChartHighlight &&
						highlightedDimensionId === row.id &&
						"bg-[color:var(--dashboardy-surface)] odd:bg-[color:var(--dashboardy-surface)]",
					hasTableHighlight &&
						highlightedDimensionId === row.id &&
						"bg-[color:var(--dashboardy-subsurface-strong)] odd:bg-[color:var(--dashboardy-subsurface-strong)]",
				)
			}
			rowKey={(row) => row.id}
			rows={visibleRows}
		/>
	);
}

export function DashboardErrorsView({
	endDate,
	errorDashboard,
	errorDeveloperTrend,
	errorProjectTrend,
	isPending,
	startDate,
	userLabelById,
}: {
	endDate: string;
	errorDashboard: ErrorsDashboard | undefined;
	errorDeveloperTrend: ErrorTrendDataPoint[] | undefined;
	errorProjectTrend: ErrorTrendDataPoint[] | undefined;
	isPending: boolean;
	startDate: string;
	userLabelById: Map<string, string>;
}) {
	if (isPending) {
		return (
			<section className="@container/errors-view flex flex-col gap-8">
				<div className="rounded-[1.9rem] border border-[color:var(--dashboardy-border)] bg-[color:var(--dashboardy-surface)] px-5 py-12 text-center text-sm text-[color:var(--dashboardy-muted)]">
					Loading error intelligence...
				</div>
			</section>
		);
	}

	return (
		<section className="@container/errors-view flex flex-col gap-8">
			<DashboardErrorDailySnapshot
				endDate={endDate}
				errorDashboard={errorDashboard}
				startDate={startDate}
				trendData={errorProjectTrend}
			/>
			<DashboardErrorDimensionPanel
				endDate={endDate}
				rows={errorProjectTrend}
				splitBy="project_path"
				startDate={startDate}
				title="By repository"
				userLabelById={userLabelById}
			/>
			<DashboardErrorDimensionPanel
				endDate={endDate}
				rows={errorDeveloperTrend}
				splitBy="user_id"
				startDate={startDate}
				title="By developer"
				userLabelById={userLabelById}
			/>
		</section>
	);
}
