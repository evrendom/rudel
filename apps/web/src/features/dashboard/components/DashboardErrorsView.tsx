import type { ErrorsDashboard, ErrorTrendDataPoint } from "@rudel/api-routes";
import { eachDayOfInterval, format, parseISO } from "date-fns";
import { FolderGit2Icon, GaugeIcon } from "lucide-react";
import { useMemo, useState } from "react";
import {
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
} from "@/features/dashboard/components/DashboardGridTable";
import { DashboardInteractiveTopChartSection } from "@/features/dashboard/components/DashboardTopChartSection";
import type { DashboardHeadlineMetric } from "@/features/dashboard/data/dashboard-static-data";
import { cn } from "@/lib/utils";

type ErrorMetric =
	| "total_errors"
	| "avg_errors_per_session"
	| "avg_errors_per_interaction";
type ErrorDimensionView = "total" | "over-time";

type ErrorDailyPoint = {
	activeDimensions: number;
	avgErrorsPerInteraction: number | null;
	avgErrorsPerSession: number | null;
	axisLabel: string;
	date: string;
	errorTypes: string[];
	fullLabel: string;
	totalErrors: number | null;
};

type ErrorDimensionRow = {
	activeDays: number;
	avgErrorsPerInteraction: number;
	avgErrorsPerSession: number;
	id: string;
	label: string;
	totalErrors: number;
};

type ErrorDimensionSeries = {
	color: string;
	id: string;
	label: string;
};

type ErrorTrendChartRow = {
	date: string;
	fullLabel: string;
} & Record<string, number | string>;

type ErrorDimensionBarDatum = {
	activeDays: number;
	id: string;
	label: string;
	shortLabel: string;
	value: number;
};

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

const ERROR_DAILY_CHART_CONFIG = {
	totalErrors: {
		label: "Errors",
		color: "#EF4444",
	},
} satisfies ChartConfig;

const ERROR_TOTAL_CHART_CONFIG = {
	value: {
		label: "Selected metric",
		color: "#EF4444",
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

function buildDateRange(startDate: string, endDate: string) {
	const parsedStartDate = parseISO(startDate);
	const parsedEndDate = parseISO(endDate);

	if (
		Number.isNaN(parsedStartDate.getTime()) ||
		Number.isNaN(parsedEndDate.getTime())
	) {
		return [];
	}

	return eachDayOfInterval({
		start:
			parsedStartDate.getTime() <= parsedEndDate.getTime()
				? parsedStartDate
				: parsedEndDate,
		end:
			parsedStartDate.getTime() <= parsedEndDate.getTime()
				? parsedEndDate
				: parsedStartDate,
	});
}

function estimateDenominator(totalErrors: number, average: number) {
	if (average <= 0 || totalErrors <= 0) {
		return 0;
	}

	return totalErrors / average;
}

function formatMetricValue(metric: ErrorMetric, value: number) {
	if (metric === "total_errors") {
		return value.toLocaleString();
	}

	return value.toFixed(2);
}

function getErrorMetricLabel(metric: ErrorMetric) {
	switch (metric) {
		case "avg_errors_per_session":
			return "Avg / session";
		case "avg_errors_per_interaction":
			return "Avg / interaction";
		default:
			return "Errors";
	}
}

function getErrorMetricValue(row: ErrorDimensionRow, metric: ErrorMetric) {
	switch (metric) {
		case "avg_errors_per_session":
			return row.avgErrorsPerSession;
		case "avg_errors_per_interaction":
			return row.avgErrorsPerInteraction;
		default:
			return row.totalErrors;
	}
}

function formatMetricAxisTick(metric: ErrorMetric, value: number | string) {
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

function buildErrorHeadlineMetrics(
	errorDashboard: ErrorsDashboard | undefined,
): DashboardHeadlineMetric[] {
	const summary = errorDashboard?.summary;

	return [
		{
			id: "sessions",
			label: "Total errors",
			valueLabel: String(summary?.total_errors ?? 0),
			deltaLabel: "0",
			deltaTone: "neutral",
			description: "All error occurrences in the selected range.",
		},
		{
			id: "uncommitted",
			label: "Distinct patterns",
			valueLabel: String(summary?.distinct_patterns ?? 0),
			deltaLabel: "0",
			deltaTone: "neutral",
			description: "Unique recurring error signatures.",
		},
		{
			id: "commitRate",
			label: "High severity",
			valueLabel: String(summary?.high_severity_patterns ?? 0),
			deltaLabel: "0",
			deltaTone: "neutral",
			description: "Patterns crossing the high-severity threshold.",
		},
	];
}

function formatDimensionLabel(
	value: string,
	splitBy: "project_path" | "user_id",
	userLabelById: Map<string, string>,
) {
	if (splitBy === "user_id") {
		return userLabelById.get(value) ?? value;
	}

	return value.split("/").at(-1) || value;
}

function buildErrorDailyPoints(
	startDate: string,
	endDate: string,
	rows: ErrorTrendDataPoint[] | undefined,
): ErrorDailyPoint[] {
	const aggregateByDate = new Map<
		string,
		{
			activeDimensions: number;
			sessionEstimate: number;
			totalErrors: number;
			interactionEstimate: number;
			errorTypeCounts: Map<string, number>;
		}
	>();

	for (const row of rows ?? []) {
		const current = aggregateByDate.get(row.date) ?? {
			activeDimensions: 0,
			errorTypeCounts: new Map<string, number>(),
			sessionEstimate: 0,
			totalErrors: 0,
			interactionEstimate: 0,
		};
		current.activeDimensions += 1;
		current.totalErrors += row.total_errors;
		current.sessionEstimate += estimateDenominator(
			row.total_errors,
			row.avg_errors_per_session,
		);
		current.interactionEstimate += estimateDenominator(
			row.total_errors,
			row.avg_errors_per_interaction,
		);
		for (const [index, errorType] of row.error_types.entries()) {
			const occurrences = row.error_type_occurrences[index] ?? 0;

			current.errorTypeCounts.set(
				errorType,
				(current.errorTypeCounts.get(errorType) ?? 0) + occurrences,
			);
		}
		aggregateByDate.set(row.date, current);
	}

	return buildDateRange(startDate, endDate).map((date) => {
		const isoDate = format(date, "yyyy-MM-dd");
		const aggregate = aggregateByDate.get(isoDate);

		if (!aggregate) {
			return {
				activeDimensions: 0,
				avgErrorsPerInteraction: null,
				avgErrorsPerSession: null,
				axisLabel: format(date, "EEE"),
				date: isoDate,
				errorTypes: [],
				fullLabel: format(date, "EEEE, MMM d"),
				totalErrors: null,
			};
		}

		const errorTypes = Array.from(aggregate.errorTypeCounts.entries())
			.sort(
				(left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
			)
			.map(([errorPattern]) => errorPattern);

		return {
			activeDimensions: aggregate.activeDimensions,
			avgErrorsPerInteraction:
				aggregate.interactionEstimate > 0
					? Number(
							(aggregate.totalErrors / aggregate.interactionEstimate).toFixed(
								2,
							),
						)
					: null,
			avgErrorsPerSession:
				aggregate.sessionEstimate > 0
					? Number(
							(aggregate.totalErrors / aggregate.sessionEstimate).toFixed(2),
						)
					: null,
			axisLabel: format(date, "EEE"),
			date: isoDate,
			errorTypes,
			fullLabel: format(date, "EEEE, MMM d"),
			totalErrors: aggregate.totalErrors,
		};
	});
}

function buildErrorDimensionRows(
	rows: ErrorTrendDataPoint[] | undefined,
	splitBy: "project_path" | "user_id",
	userLabelById: Map<string, string>,
): ErrorDimensionRow[] {
	const rowMap = new Map<
		string,
		{
			activeDays: Set<string>;
			interactionEstimate: number;
			label: string;
			sessionEstimate: number;
			totalErrors: number;
		}
	>();

	for (const row of rows ?? []) {
		const current = rowMap.get(row.dimension) ?? {
			activeDays: new Set<string>(),
			interactionEstimate: 0,
			label: formatDimensionLabel(row.dimension, splitBy, userLabelById),
			sessionEstimate: 0,
			totalErrors: 0,
		};
		current.activeDays.add(row.date);
		current.interactionEstimate += estimateDenominator(
			row.total_errors,
			row.avg_errors_per_interaction,
		);
		current.sessionEstimate += estimateDenominator(
			row.total_errors,
			row.avg_errors_per_session,
		);
		current.totalErrors += row.total_errors;
		rowMap.set(row.dimension, current);
	}

	return Array.from(rowMap.entries())
		.map(([id, row]) => ({
			activeDays: row.activeDays.size,
			avgErrorsPerInteraction:
				row.interactionEstimate > 0
					? Number((row.totalErrors / row.interactionEstimate).toFixed(2))
					: 0,
			avgErrorsPerSession:
				row.sessionEstimate > 0
					? Number((row.totalErrors / row.sessionEstimate).toFixed(2))
					: 0,
			id,
			label: row.label,
			totalErrors: row.totalErrors,
		}))
		.sort(
			(left, right) =>
				right.totalErrors - left.totalErrors ||
				right.activeDays - left.activeDays ||
				left.label.localeCompare(right.label),
		);
}

function buildErrorTrendRows(
	startDate: string,
	endDate: string,
	rows: ErrorTrendDataPoint[] | undefined,
	series: ErrorDimensionSeries[],
	metric: ErrorMetric,
): ErrorTrendChartRow[] {
	const valueMap = new Map(
		(rows ?? []).map((row) => [`${row.dimension}:${row.date}`, row] as const),
	);

	return buildDateRange(startDate, endDate).map((date) => {
		const isoDate = format(date, "yyyy-MM-dd");
		const nextRow: ErrorTrendChartRow = {
			date: isoDate,
			fullLabel: format(date, "EEEE, MMM d"),
		};

		for (const entry of series) {
			nextRow[entry.id] = valueMap.get(`${entry.id}:${isoDate}`)?.[metric] ?? 0;
		}

		return nextRow;
	});
}

function buildErrorDimensionBarRows(
	rows: ErrorDimensionRow[],
	metric: ErrorMetric,
): ErrorDimensionBarDatum[] {
	return rows.slice(0, 10).map((row) => ({
		activeDays: row.activeDays,
		id: row.id,
		label: row.label,
		shortLabel:
			row.label.length > 14 ? `${row.label.slice(0, 12)}…` : row.label,
		value: getErrorMetricValue(row, metric),
	}));
}

function buildErrorTrendChartConfig(
	series: ErrorDimensionSeries[],
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
	rows: ErrorDimensionRow[];
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

function ErrorDailyTooltip({
	active,
	payload,
}: {
	active?: boolean;
	payload?: Array<{ payload: ErrorDailyPoint }>;
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
			<div className="flex items-start justify-between gap-4">
				<p className="font-medium text-foreground">{point.fullLabel}</p>
				<p className="shrink-0 font-medium text-muted-foreground">Errors</p>
			</div>
			<div className="grid gap-1.5">
				<div className="flex items-center justify-between gap-3">
					<span className="text-muted-foreground">Total errors</span>
					<span className="font-mono font-medium tabular-nums text-foreground">
						{point.totalErrors == null ? "—" : point.totalErrors}
					</span>
				</div>
				<div className="flex items-center justify-between gap-3">
					<span className="text-muted-foreground">Avg / session</span>
					<span className="font-mono font-medium tabular-nums text-foreground">
						{point.avgErrorsPerSession == null
							? "—"
							: point.avgErrorsPerSession.toFixed(2)}
					</span>
				</div>
				<div className="flex items-center justify-between gap-3">
					<span className="text-muted-foreground">Hot dimensions</span>
					<span className="font-mono font-medium tabular-nums text-foreground">
						{point.activeDimensions}
					</span>
				</div>
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
	metric: ErrorMetric;
	payload?: Array<{ payload?: ErrorDimensionBarDatum }>;
}) {
	const point = payload?.[0]?.payload;

	if (!active || !point) {
		return null;
	}

	return (
		<div className="grid min-w-52 gap-2 rounded-xl bg-popover px-3 py-2 text-xs text-popover-foreground shadow-lg ring-1 ring-foreground/5 dark:ring-foreground/10">
			<div className="flex items-start justify-between gap-4">
				<p className="font-medium text-foreground">{point.label}</p>
				<p className="shrink-0 font-medium text-muted-foreground">
					{getErrorMetricLabel(metric)}
				</p>
			</div>
			<div className="grid gap-1.5">
				<div className="flex items-center justify-between gap-3">
					<span className="text-muted-foreground">Value</span>
					<span className="font-mono font-medium tabular-nums text-foreground">
						{formatMetricValue(metric, point.value)}
					</span>
				</div>
				<div className="flex items-center justify-between gap-3">
					<span className="text-muted-foreground">Active days</span>
					<span className="font-mono font-medium tabular-nums text-foreground">
						{point.activeDays}
					</span>
				</div>
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
	metric: ErrorMetric;
	nameById: Map<string, string>;
	payload?: Array<{
		color?: string;
		dataKey?: string | number;
		name?: string | number;
		payload?: ErrorTrendChartRow;
		value?: number | string;
	}>;
}) {
	if (!active || !payload?.length) {
		return null;
	}

	const point = payload[0]?.payload;

	return (
		<div className="grid min-w-52 gap-2 rounded-xl bg-popover px-3 py-2 text-xs text-popover-foreground shadow-lg ring-1 ring-foreground/5 dark:ring-foreground/10">
			<div className="flex items-start justify-between gap-4">
				<p className="font-medium text-foreground">
					{point?.fullLabel ?? "Selected day"}
				</p>
				<p className="shrink-0 font-medium text-muted-foreground">
					{getErrorMetricLabel(metric)}
				</p>
			</div>
			<div className="grid gap-1.5">
				{payload.map((entry) => {
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
								<span className="truncate text-muted-foreground">
									{displayLabel}
								</span>
							</div>
							<span className="shrink-0 font-mono font-medium tabular-nums text-foreground">
								{formatMetricValue(metric, numericValue)}
							</span>
						</div>
					);
				})}
			</div>
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
	payload?: ErrorDailyPoint;
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
	const barOpacity =
		hasExternalHighlight && !isHighlighted
			? activeSource === "table"
				? 0.16
				: 0.24
			: 0.94;

	return (
		<Rectangle
			x={x}
			y={y}
			width={width}
			height={height}
			fill={fill}
			radius={[4, 4, 0, 0]}
			stroke="color-mix(in srgb, var(--dashboardy-heading) 22%, transparent)"
			strokeWidth={isHighlighted ? 1 : 0}
			style={{
				opacity: barOpacity,
				strokeOpacity: isHighlighted ? 1 : 0,
				transition:
					"opacity 300ms cubic-bezier(0.23, 1, 0.32, 1), stroke-opacity 300ms cubic-bezier(0.23, 1, 0.32, 1)",
			}}
		/>
	);
}

function ErrorDimensionBarShape({
	activeId,
	fill,
	height,
	payload,
	width,
	x,
	y,
}: {
	activeId?: string | null;
	fill?: string;
	height?: number;
	payload?: ErrorDimensionBarDatum;
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

	return (
		<Rectangle
			x={x}
			y={y}
			width={width}
			height={height}
			fill={fill}
			radius={[6, 6, 0, 0]}
			stroke="color-mix(in srgb, var(--dashboardy-heading) 22%, transparent)"
			strokeWidth={isHighlighted ? 1 : 0}
			style={{
				opacity: hasExternalHighlight && !isHighlighted ? 0.24 : 0.96,
				strokeOpacity: isHighlighted ? 1 : 0,
				transition:
					"opacity 300ms cubic-bezier(0.23, 1, 0.32, 1), stroke-opacity 300ms cubic-bezier(0.23, 1, 0.32, 1)",
			}}
		/>
	);
}

function DashboardErrorDailySnapshot({
	errorDashboard,
	startDate,
	endDate,
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
			renderChart={({ highlightedItemId, highlightSource }) => (
				<div className="flex min-w-0 flex-1 pt-0 md:pt-4">
					<ChartContainer
						config={ERROR_DAILY_CHART_CONFIG}
						className="h-[12.875rem] w-full aspect-auto"
						initialDimension={{ width: 664, height: 206 }}
					>
						<BarChart
							data={dailyPoints}
							barCategoryGap={0}
							barSize={barSize}
							margin={{ top: 2, right: 18, bottom: 10, left: 0 }}
						>
							<XAxis
								dataKey="date"
								height={22}
								axisLine={{
									stroke:
										"color-mix(in srgb, var(--dashboardy-muted) 40%, transparent)",
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
								tick={{
									fontSize: 12,
									fontWeight: 500,
									fill: "var(--dashboardy-muted)",
									opacity: 0.38,
								}}
							/>
							<YAxis
								orientation="right"
								allowDecimals={false}
								axisLine={{
									stroke:
										"color-mix(in srgb, var(--dashboardy-muted) 40%, transparent)",
								}}
								tickLine={{
									stroke:
										"color-mix(in srgb, var(--dashboardy-muted) 40%, transparent)",
								}}
								tickMargin={4}
								width={48}
								tick={{
									fontSize: 12,
									fontWeight: 500,
									fill: "var(--dashboardy-muted)",
									opacity: 0.38,
								}}
							/>
							<ChartTooltip
								cursor={false}
								wrapperStyle={{ pointerEvents: "none", zIndex: 20 }}
								content={<ErrorDailyTooltip />}
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
					highlightedDate={highlightedItemId}
					highlightSource={highlightSource}
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
	highlightSource?: "table" | null;
	highlightedDate?: string | null;
	onHighlightDateChange: (date: string | null) => void;
	rows: ErrorDailyPoint[];
}) {
	const hasTableHighlight =
		highlightSource === "table" && highlightedDate != null;
	const reversedRows = useMemo(() => rows.slice().reverse(), [rows]);

	return (
		<DashboardGridTable
			columns={[
				{
					id: "day",
					header: "Day",
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
					id: "errors",
					header: "Errors",
					renderCell: (row) => (
						<p className="font-medium tabular-nums text-[color:var(--dashboardy-heading)]">
							{row.totalErrors ?? "-"}
						</p>
					),
				},
				{
					id: "avg-per-session",
					header: "Avg / session",
					renderCell: (row) => (
						<p className="font-medium tabular-nums text-[color:var(--dashboardy-heading)]">
							{row.avgErrorsPerSession == null
								? "-"
								: row.avgErrorsPerSession.toFixed(2)}
						</p>
					),
				},
				{
					id: "hot-dims",
					header: "Hot dims",
					renderCell: (row) => (
						<p className="font-medium tabular-nums text-[color:var(--dashboardy-heading)]">
							{row.activeDimensions}
						</p>
					),
				},
				{
					id: "overview",
					header: "Overview",
					renderCell: (row) => {
						const visibleErrorTypes = row.errorTypes.slice(0, 3);
						const hiddenErrorTypes = row.errorTypes.slice(3);

						return visibleErrorTypes.length > 0 ? (
							<p className="truncate text-[13px] font-medium text-[color:var(--dashboardy-heading)]">
								<DashboardInlineOverflowList
									visibleItems={visibleErrorTypes}
									hiddenItems={hiddenErrorTypes}
									overflowLabel={`${hiddenErrorTypes.length} more`}
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
			rows={reversedRows}
			rowKey={(row) => row.date}
			gridTemplateColumns="minmax(180px,1.2fr) 100px 120px 120px minmax(160px,1fr)"
			minWidthClassName="min-w-[54rem]"
			bodyClassName="gap-0"
			onRowHoverChange={onHighlightDateChange}
			getHoverRowId={(row) => row.date}
			rowClassName={(row) =>
				cn(
					"w-full text-left transition-colors duration-300 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)]",
					hasTableHighlight &&
						"bg-[color:var(--dashboardy-surface)] odd:bg-[color:var(--dashboardy-surface)]",
					hasTableHighlight &&
						highlightedDate === row.date &&
						"bg-[color:var(--dashboardy-subsurface-strong)] odd:bg-[color:var(--dashboardy-subsurface-strong)]",
				)
			}
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
	const [metric, setMetric] = useState<ErrorMetric>("total_errors");
	const [hiddenSeriesIds, setHiddenSeriesIds] = useState<string[]>([]);
	const [highlightedDimensionId, setHighlightedDimensionId] = useState<
		string | null
	>(null);
	const summaryRows = useMemo(
		() => buildErrorDimensionRows(rows, splitBy, userLabelById),
		[rows, splitBy, userLabelById],
	);
	const rowById = useMemo(
		() => new Map(summaryRows.map((row) => [row.id, row] as const)),
		[summaryRows],
	);
	const visibleSeries = useMemo<ErrorDimensionSeries[]>(
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

	return (
		<DashboardAnalysisPanel
			title={title}
			icon={
				splitBy === "project_path" ? (
					<FolderGit2Icon className="size-5 text-[color:var(--dashboardy-heading)]" />
				) : (
					<GaugeIcon className="size-5 text-[color:var(--dashboardy-heading)]" />
				)
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
					<ToggleGroupItem value="total" className="dashboardy-toggle-item">
						Total
					</ToggleGroupItem>
					<ToggleGroupItem value="over-time" className="dashboardy-toggle-item">
						Over time
					</ToggleGroupItem>
				</ToggleGroup>
			}
			chartInnerClassName="grid gap-4"
			chartContent={
				<div className="grid h-full gap-4">
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
								value="total_errors"
								className="dashboardy-toggle-item"
							>
								Errors
							</ToggleGroupItem>
							<ToggleGroupItem
								value="avg_errors_per_session"
								className="dashboardy-toggle-item"
							>
								Avg / session
							</ToggleGroupItem>
							<ToggleGroupItem
								value="avg_errors_per_interaction"
								className="dashboardy-toggle-item"
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
											type="button"
											aria-pressed={!isHidden}
											aria-label={`${isHidden ? "Show" : "Hide"} ${series.label} in chart`}
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
											onClick={() => handleToggleSeries(series.id)}
											onMouseEnter={() => setHighlightedDimensionId(series.id)}
											onMouseLeave={() => setHighlightedDimensionId(null)}
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
												{formatMetricValue(metric, totalValue)}
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
								config={ERROR_TOTAL_CHART_CONFIG}
								className="h-full w-full aspect-auto [&_.recharts-cartesian-grid-vertical_line]:stroke-transparent"
								initialDimension={{ width: 664, height: 320 }}
							>
								<BarChart
									data={totalChartRows}
									barCategoryGap={12}
									margin={{ top: 12, right: 12, bottom: 14, left: 0 }}
								>
									<CartesianGrid
										vertical={false}
										stroke="color-mix(in srgb, var(--dashboardy-divider) 68%, transparent)"
										strokeDasharray="0"
									/>
									<XAxis
										dataKey="shortLabel"
										axisLine={false}
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
										allowDecimals={false}
										axisLine={false}
										tickFormatter={(value) =>
											formatMetricAxisTick(metric, value)
										}
										tickLine={false}
										tickMargin={8}
										width={56}
										tick={{
											fontSize: 12,
											fontWeight: 500,
											fill: "var(--dashboardy-muted)",
											opacity: 0.65,
										}}
									/>
									<ChartTooltip
										cursor={false}
										wrapperStyle={{ pointerEvents: "none", zIndex: 20 }}
										content={<ErrorTotalTooltip metric={metric} />}
									/>
									<Bar
										dataKey="value"
										fill="var(--color-value)"
										isAnimationActive={false}
										shape={
											<ErrorDimensionBarShape
												activeId={highlightedDimensionId}
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
								config={chartConfig}
								className="h-full w-full aspect-auto [&_.recharts-cartesian-grid-vertical_line]:stroke-transparent [&_.recharts-curve]:drop-shadow-none"
								initialDimension={{ width: 664, height: 320 }}
							>
								<LineChart
									data={trendRows}
									margin={{ top: 12, right: 12, bottom: 8, left: 0 }}
								>
									<CartesianGrid
										vertical={false}
										stroke="color-mix(in srgb, var(--dashboardy-divider) 68%, transparent)"
										strokeDasharray="0"
									/>
									<XAxis
										dataKey="date"
										axisLine={false}
										minTickGap={24}
										tickFormatter={(value, index) =>
											getTrendTickLabel(String(value), index, trendRows.length)
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
										domain={[0, trendAxisMax]}
										tickFormatter={(value) =>
											formatMetricAxisTick(metric, value)
										}
										tickLine={false}
										tickMargin={8}
										width={56}
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
										content={
											<ErrorDimensionTooltip
												metric={metric}
												nameById={seriesNameById}
											/>
										}
									/>
									{visibleTrendSeries.map((series) => (
										<Line
											key={series.id}
											dataKey={series.id}
											animationDuration={480}
											animationEasing="ease-out"
											name={series.label}
											type="monotone"
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
											connectNulls
											dot={false}
											activeDot={{
												fill: series.color,
												r: highlightedDimensionId === series.id ? 4.5 : 4,
												stroke: "var(--dashboardy-subsurface)",
												strokeWidth: 2,
											}}
										/>
									))}
									{(() => {
										const lastRow = trendRows.at(-1);

										if (!lastRow) {
											return null;
										}

										return visibleTrendSeries.map((series) => (
											<ReferenceDot
												key={`${series.id}-endpoint`}
												x={lastRow.date}
												y={Number(lastRow[series.id] ?? 0)}
												r={highlightedDimensionId === series.id ? 4 : 3.5}
												fill={series.color}
												fillOpacity={
													hasVisibleHighlightedSeries &&
													highlightedDimensionId !== series.id
														? 0.16
														: 1
												}
												stroke="var(--dashboardy-subsurface)"
												strokeOpacity={
													hasVisibleHighlightedSeries &&
													highlightedDimensionId !== series.id
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
			}
			tableContent={
				<DashboardErrorDimensionTable
					highlightedDate={null}
					onHighlightDimensionChange={setHighlightedDimensionId}
					rowMap={rowMap}
					rows={summaryRows}
				/>
			}
		/>
	);
}

function DashboardErrorDimensionTable({
	rows,
	rowMap,
	highlightedDate,
	onHighlightDimensionChange,
}: {
	highlightedDate: string | null;
	onHighlightDimensionChange?: (dimensionId: string | null) => void;
	rowMap: Map<string, ErrorTrendDataPoint>;
	rows: ErrorDimensionRow[];
}) {
	return (
		<DashboardGridTable
			columns={[
				{
					id: "dimension",
					header: "Dimension",
					renderCell: (row) => (
						<p className="truncate font-semibold text-[color:var(--dashboardy-heading)]">
							{row.label}
						</p>
					),
				},
				{
					id: "errors",
					header: "Errors",
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
					id: "avg-session",
					header: "Avg / session",
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
					id: "avg-interaction",
					header: "Avg / interaction",
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
					id: "active-days",
					header: "Active days",
					renderCell: (row) => (
						<p className="font-medium tabular-nums text-[color:var(--dashboardy-heading)]">
							{row.activeDays}
						</p>
					),
				},
			]}
			rows={rows}
			rowKey={(row) => row.id}
			gridTemplateColumns="minmax(220px,12fr) 90px 120px 120px 96px"
			minWidthClassName="min-w-[58rem]"
			bodyClassName="gap-0"
			onRowHoverChange={onHighlightDimensionChange}
			getHoverRowId={(row) => row.id}
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
