import type { DimensionAnalysisDataPoint } from "@rudel/api-routes";
import { memo, useMemo } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
	type ChartConfig,
	ChartContainer,
	ChartLegend,
	ChartLegendContent,
	ChartTooltip,
} from "@/app/ui/chart";
import { useChartTheme } from "@/hooks/useChartTheme";
import { formatUsername } from "@/lib/format";

type DimensionAnalysisChartProps = {
	data: DimensionAnalysisDataPoint[];
	dimension: string;
	metric: string;
	split_by?: string;
	showPercentage?: boolean;
	userMap?: Record<string, string>;
};

type DimensionAnalysisChartSeries = {
	color: string;
	dataKey: string;
	label: string;
};

type DimensionAnalysisChartRow = {
	fullLabel: string;
	label: string;
	rawValues: Record<string, number>;
	total: number;
} & Record<string, number | string | Record<string, number>>;

type DimensionAnalysisTooltipEntry = {
	color?: string;
	dataKey?: number | string;
	name?: number | string;
	payload?: DimensionAnalysisChartRow;
	value?: number | string;
};

const PRIMARY_BAR_COLOR = "#3b82f6";
const CHART_COLORS = [
	"#3b82f6",
	"#10b981",
	"#f59e0b",
	"#8b5cf6",
	"#ef4444",
	"#06b6d4",
	"#f97316",
	"#ec4899",
	"#14b8a6",
	"#6366f1",
] as const;

function formatCompactNumber(value: number) {
	if (value >= 1_000_000) {
		return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
	}

	if (value >= 1_000) {
		return `${(value / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
	}

	return value.toLocaleString();
}

function formatNumberWithCommas(value: number) {
	return value.toLocaleString();
}

function truncateAxisLabel(label: string, maxLength = 22) {
	if (label.length <= maxLength) {
		return label;
	}

	return `${label.slice(0, Math.max(maxLength - 3, 1))}...`;
}

function formatMetricLabel(metric: string) {
	const labelMap: Record<string, string> = {
		session_count: "Session Count",
		avg_duration: "Avg Duration (min)",
		total_duration: "Total Duration (hours)",
		avg_interactions: "Avg Interactions",
		total_interactions: "Total Interactions",
		avg_response_time: "Avg Response Time (sec)",
		median_response_time: "Median Response Time (sec)",
		avg_tokens: "Avg Tokens",
		total_tokens: "Total Tokens",
		avg_success_score: "Avg Success Score",
		avg_errors: "Avg Errors",
		total_errors: "Total Errors",
	};

	return labelMap[metric] ?? metric;
}

function formatDimensionValue(
	value: string,
	dimension: string,
	userMap?: Record<string, string>,
) {
	if (
		dimension === "has_commit" ||
		dimension === "used_plan_mode" ||
		dimension === "used_skills" ||
		dimension === "used_slash_commands" ||
		dimension === "used_subagents"
	) {
		return value === "1" ? "Yes" : "No";
	}

	if (dimension === "project_path") {
		const parts = value.split("/");
		return parts[parts.length - 1] || value;
	}

	if (dimension === "user_id") {
		return formatUsername(value, userMap);
	}

	return value;
}

function buildSeriesConfig(series: readonly DimensionAnalysisChartSeries[]) {
	const config: ChartConfig = {};

	for (const entry of series) {
		config[entry.dataKey] = {
			color: entry.color,
			label: entry.label,
		};
	}

	return config;
}

function getEntryNumericValue(value: unknown) {
	if (typeof value === "number") {
		return value;
	}

	if (typeof value === "string") {
		const parsedValue = Number(value);
		return Number.isFinite(parsedValue) ? parsedValue : 0;
	}

	if (Array.isArray(value)) {
		return getEntryNumericValue(value[0]);
	}

	return 0;
}

function getTooltipSeriesLabel(
	dataKey: number | string | undefined,
	fallbackLabel: number | string | undefined,
	seriesByDataKey: ReadonlyMap<string, DimensionAnalysisChartSeries>,
	metricLabel: string,
) {
	if (typeof dataKey === "string") {
		return seriesByDataKey.get(dataKey)?.label ?? dataKey;
	}

	if (typeof fallbackLabel === "string") {
		return seriesByDataKey.get(fallbackLabel)?.label ?? fallbackLabel;
	}

	return metricLabel;
}

function DimensionAnalysisTooltip({
	active,
	hasSplitSeries,
	metricLabel,
	payload,
	seriesByDataKey,
	showPercentage,
}: {
	active?: boolean;
	hasSplitSeries: boolean;
	metricLabel: string;
	payload?: readonly DimensionAnalysisTooltipEntry[];
	seriesByDataKey: ReadonlyMap<string, DimensionAnalysisChartSeries>;
	showPercentage: boolean;
}) {
	if (!active || !payload?.length) {
		return null;
	}

	const row = payload[0]?.payload;
	if (!row) {
		return null;
	}

	const visibleEntries = payload
		.map((entry) => {
			const rawValue =
				typeof entry.dataKey === "string"
					? (row.rawValues[entry.dataKey] ?? getEntryNumericValue(entry.value))
					: getEntryNumericValue(entry.value);

			if (rawValue <= 0) {
				return null;
			}

			return {
				color: entry.color ?? PRIMARY_BAR_COLOR,
				displayValue:
					showPercentage && hasSplitSeries
						? `${formatNumberWithCommas(rawValue)} (${getEntryNumericValue(entry.value).toFixed(1)}%)`
						: formatNumberWithCommas(rawValue),
				label: getTooltipSeriesLabel(
					entry.dataKey,
					entry.name,
					seriesByDataKey,
					metricLabel,
				),
				rawValue,
			};
		})
		.filter((entry) => entry != null)
		.sort(
			(leftEntry, rightEntry) =>
				rightEntry.rawValue - leftEntry.rawValue ||
				leftEntry.label.localeCompare(rightEntry.label),
		);

	if (visibleEntries.length === 0) {
		return null;
	}

	return (
		<div className="flex min-w-48 flex-col gap-1 rounded-md bg-black px-2.5 py-1.5 text-[11px] font-medium leading-tight text-white/90 shadow-lg">
			<div className="text-white">{row.fullLabel}</div>
			<div className="grid gap-1">
				{visibleEntries.map((entry) => (
					<div
						key={`${row.fullLabel}-${entry.label}`}
						className="flex items-center justify-between gap-3"
					>
						<div className="flex min-w-0 items-center gap-2">
							<div
								className="size-2 shrink-0 rounded-[2px]"
								style={{ backgroundColor: entry.color }}
							/>
							<span className="truncate text-white/65">{entry.label}</span>
						</div>
						<span className="font-mono tabular-nums text-white">
							{entry.displayValue}
						</span>
					</div>
				))}
			</div>
			{hasSplitSeries && !showPercentage && visibleEntries.length > 1 ? (
				<div className="flex items-center justify-between gap-3 border-t border-white/10 pt-1">
					<span className="text-white/65">Total</span>
					<span className="font-mono tabular-nums text-white">
						{formatNumberWithCommas(row.total)}
					</span>
				</div>
			) : null}
		</div>
	);
}

function buildSplitSeries(
	data: DimensionAnalysisDataPoint[],
	splitBy: string,
	userMap?: Record<string, string>,
) {
	const splitKeyTotals = new Map<string, number>();

	for (const item of data) {
		for (const [splitKey, splitValue] of Object.entries(
			item.split_values ?? {},
		)) {
			splitKeyTotals.set(
				splitKey,
				(splitKeyTotals.get(splitKey) ?? 0) + splitValue,
			);
		}
	}

	const rawSplitKeys = Array.from(splitKeyTotals.keys()).sort(
		(leftKey, rightKey) =>
			(splitKeyTotals.get(rightKey) ?? 0) - (splitKeyTotals.get(leftKey) ?? 0),
	);

	return rawSplitKeys.map((rawSplitKey, index) => ({
		color: CHART_COLORS[index % CHART_COLORS.length],
		dataKey: `series_${index}`,
		label: formatDimensionValue(rawSplitKey, splitBy, userMap),
		rawSplitKey,
	}));
}

function buildChartModel({
	data,
	dimension,
	metric,
	splitBy,
	showPercentage,
	userMap,
}: {
	data: DimensionAnalysisDataPoint[];
	dimension: string;
	metric: string;
	splitBy?: string;
	showPercentage: boolean;
	userMap?: Record<string, string>;
}) {
	if (splitBy) {
		const splitSeries = buildSplitSeries(data, splitBy, userMap);
		const rows = data
			.map((item) => {
				const row: DimensionAnalysisChartRow = {
					fullLabel: formatDimensionValue(
						item.dimension_value,
						dimension,
						userMap,
					),
					label: formatDimensionValue(item.dimension_value, dimension, userMap),
					rawValues: {},
					total: 0,
				};

				for (const series of splitSeries) {
					const rawValue = item.split_values?.[series.rawSplitKey] ?? 0;
					row.rawValues[series.dataKey] = rawValue;
					row.total += rawValue;
				}

				for (const series of splitSeries) {
					const rawValue = row.rawValues[series.dataKey] ?? 0;
					row[series.dataKey] =
						showPercentage && row.total > 0
							? (rawValue / row.total) * 100
							: rawValue;
				}

				return row;
			})
			.sort((leftRow, rightRow) => rightRow.total - leftRow.total);

		return {
			config: buildSeriesConfig(splitSeries),
			hasSplitSeries: true,
			metricLabel: formatMetricLabel(metric),
			rows,
			series: splitSeries.map(({ color, dataKey, label }) => ({
				color,
				dataKey,
				label,
			})),
		};
	}

	const metricLabel = formatMetricLabel(metric);
	const rows = data
		.map((item) => {
			const value = item.metric_value ?? 0;

			return {
				fullLabel: formatDimensionValue(
					item.dimension_value,
					dimension,
					userMap,
				),
				label: formatDimensionValue(item.dimension_value, dimension, userMap),
				rawValues: {
					value,
				},
				total: value,
				value,
			} satisfies DimensionAnalysisChartRow;
		})
		.sort((leftRow, rightRow) => rightRow.total - leftRow.total);

	const series = [
		{
			color: PRIMARY_BAR_COLOR,
			dataKey: "value",
			label: metricLabel,
		},
	] as const;

	return {
		config: buildSeriesConfig(series),
		hasSplitSeries: false,
		metricLabel,
		rows,
		series,
	};
}

export const DimensionAnalysisChart = memo(function DimensionAnalysisChart({
	data,
	dimension,
	metric,
	split_by,
	showPercentage = false,
	userMap,
}: DimensionAnalysisChartProps) {
	const { axisStroke, gridStroke } = useChartTheme();
	const chartModel = useMemo(
		() =>
			buildChartModel({
				data,
				dimension,
				metric,
				showPercentage,
				splitBy: split_by,
				userMap,
			}),
		[data, dimension, metric, showPercentage, split_by, userMap],
	);
	const seriesByDataKey = useMemo(
		() =>
			new Map(
				chartModel.series.map((series) => [series.dataKey, series] as const),
			),
		[chartModel.series],
	);

	if (data.length === 0) {
		return (
			<div className="flex h-full items-center justify-center px-6 text-center text-sm text-[color:var(--dashboardy-muted)]">
				No data available for the selected dimension and metric.
			</div>
		);
	}

	return (
		<div className="flex h-full min-h-0 flex-col">
			<ChartContainer
				config={chartModel.config}
				className="h-full w-full min-h-0 flex-1 aspect-auto [&_.recharts-cartesian-grid-vertical_line]:stroke-transparent"
				initialDimension={{ width: 720, height: 320 }}
			>
				<BarChart
					data={chartModel.rows}
					layout="vertical"
					barCategoryGap={8}
					barGap={0}
					margin={{
						top: 8,
						right: 12,
						bottom: chartModel.hasSplitSeries ? 28 : 8,
						left: 0,
					}}
				>
					<CartesianGrid
						stroke={gridStroke}
						strokeDasharray="3 3"
						vertical={false}
					/>
					<XAxis
						type="number"
						axisLine={false}
						tickLine={false}
						tickMargin={8}
						tick={{
							fill: axisStroke,
							fontSize: 12,
							fontWeight: 600,
						}}
						tickFormatter={
							showPercentage && chartModel.hasSplitSeries
								? (value) => `${Number(value).toFixed(0)}%`
								: (value) => formatCompactNumber(Number(value))
						}
						domain={
							showPercentage && chartModel.hasSplitSeries ? [0, 100] : undefined
						}
					/>
					<YAxis
						type="category"
						dataKey="label"
						axisLine={false}
						tickLine={false}
						tickMargin={10}
						width={132}
						interval={0}
						tick={{
							fill: axisStroke,
							fontSize: 12,
							fontWeight: 600,
						}}
						tickFormatter={(value) => truncateAxisLabel(String(value))}
					/>
					<ChartTooltip
						cursor={false}
						content={
							<DimensionAnalysisTooltip
								hasSplitSeries={chartModel.hasSplitSeries}
								metricLabel={chartModel.metricLabel}
								seriesByDataKey={seriesByDataKey}
								showPercentage={showPercentage}
							/>
						}
					/>
					{chartModel.hasSplitSeries ? (
						<ChartLegend
							verticalAlign="bottom"
							content={
								<ChartLegendContent className="flex-wrap justify-start gap-x-3 gap-y-2 pt-4 text-[11px]" />
							}
						/>
					) : null}
					{chartModel.series.map((series) => (
						<Bar
							key={series.dataKey}
							dataKey={series.dataKey}
							stackId={
								chartModel.hasSplitSeries ? "dimension-analysis" : undefined
							}
							fill={series.color}
							radius={chartModel.hasSplitSeries ? 0 : [0, 6, 6, 0]}
						/>
					))}
				</BarChart>
			</ChartContainer>
		</div>
	);
});
