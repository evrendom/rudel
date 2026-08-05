"use client";

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
import { cn } from "@/lib/utils";

const MAX_VISIBLE_SERIES = 8;
const HISTORY_COLORS = [
	"#159C89",
	"#3B82F6",
	"#F59E0B",
	"#8B5CF6",
	"#EF4444",
	"#14B8A6",
	"#F97316",
	"#6366F1",
] as const;

export type DashboardCostHistoryDatum = {
	date: string;
	id: string;
	label: string;
	value: number;
};

type DashboardCostHistoryRow = {
	date: string;
	fullLabel: string;
} & Record<string, number | string>;

type DashboardCostHistorySeries = {
	color: string;
	dataKey: string;
	id: string;
	label: string;
	total: number;
};

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

function DashboardCostHistoryTooltip({
	active,
	formatValue,
	metricLabel,
	payload,
}: {
	active?: boolean;
	formatValue: (value: number) => string;
	metricLabel: string;
	payload?: Array<{
		color?: string;
		dataKey?: string;
		name?: string;
		payload?: DashboardCostHistoryRow;
		value?: number | string;
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
		.filter((item) => Number(item.value ?? 0) > 0)
		.sort((left, right) => Number(right.value ?? 0) - Number(left.value ?? 0));

	return (
		<div className="flex min-w-52 flex-col gap-1 rounded-md bg-black px-2.5 py-1.5 text-[11px] font-medium leading-tight text-white/90 shadow-lg">
			<div className="flex items-start justify-between gap-4">
				<p className="text-white">{point.fullLabel}</p>
				<p className="shrink-0 text-white/65">{metricLabel}</p>
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
								{formatValue(Number(item.value ?? 0))}
							</span>
						</div>
					))
				) : (
					<p className="text-white/65">No activity</p>
				)}
			</div>
		</div>
	);
}

export function DashboardCostHistoryChart({
	allowDecimals,
	className,
	data,
	formatValue,
	metricLabel,
	yAxisTickFormatter,
	yAxisWidth,
}: {
	allowDecimals: boolean;
	className?: string;
	data: readonly DashboardCostHistoryDatum[];
	formatValue: (value: number) => string;
	metricLabel: string;
	yAxisTickFormatter: (value: number) => string;
	yAxisWidth: number;
}) {
	const { chartConfig, chartData, hiddenSeriesCount, series } = useMemo(() => {
		const totalsById = new Map<
			string,
			{
				label: string;
				total: number;
			}
		>();
		const valuesByDateAndId = new Map<string, number>();

		for (const point of data) {
			const currentTotal = totalsById.get(point.id);
			totalsById.set(point.id, {
				label: point.label,
				total: (currentTotal?.total ?? 0) + point.value,
			});
			const valueKey = `${point.date}:${point.id}`;
			valuesByDateAndId.set(
				valueKey,
				(valuesByDateAndId.get(valueKey) ?? 0) + point.value,
			);
		}

		const rankedSeries = Array.from(totalsById.entries())
			.filter(([, value]) => value.total > 0)
			.sort(
				(left, right) =>
					right[1].total - left[1].total ||
					left[1].label.localeCompare(right[1].label),
			);
		const series: DashboardCostHistorySeries[] = rankedSeries
			.slice(0, MAX_VISIBLE_SERIES)
			.map(([id, value], index) => ({
				color: HISTORY_COLORS[index % HISTORY_COLORS.length] ?? "#159C89",
				dataKey: `series-${index}`,
				id,
				label: value.label,
				total: value.total,
			}));
		const dates = Array.from(new Set(data.map((point) => point.date))).sort();
		const chartData: DashboardCostHistoryRow[] = dates.map((date) => {
			const row: DashboardCostHistoryRow = {
				date,
				fullLabel: buildFullLabel(date),
			};

			for (const item of series) {
				row[item.dataKey] = valuesByDateAndId.get(`${date}:${item.id}`) ?? 0;
			}

			return row;
		});
		const chartConfig: ChartConfig = {};
		for (const item of series) {
			chartConfig[item.dataKey] = {
				color: item.color,
				label: item.label,
			};
		}

		return {
			chartConfig,
			chartData,
			hiddenSeriesCount: Math.max(0, rankedSeries.length - series.length),
			series,
		};
	}, [data]);
	const axisMax = Math.max(
		1,
		...chartData.flatMap((row) =>
			series.map((item) => Number(row[item.dataKey] ?? 0)),
		),
	);
	const lastRow = chartData.at(-1);

	return (
		<div className={cn("flex h-full min-h-0 flex-col gap-3", className)}>
			<div className="flex min-h-6 flex-wrap items-center gap-x-3 gap-y-1 px-3">
				{series.map((item) => (
					<div
						key={item.id}
						className="flex min-w-0 items-center gap-1.5 text-xs text-[color:var(--dashboardy-muted)]"
					>
						<span
							aria-hidden="true"
							className="size-2 shrink-0 rounded-full"
							style={{ backgroundColor: item.color }}
						/>
						<span className="max-w-28 truncate">{item.label}</span>
					</div>
				))}
				{hiddenSeriesCount > 0 ? (
					<span className="text-xs text-[color:var(--dashboardy-muted)]">
						+{hiddenSeriesCount} more
					</span>
				) : null}
			</div>

			<div className="min-h-0 flex-1">
				<ChartContainer
					config={chartConfig}
					className="h-full w-full aspect-auto [&_.recharts-cartesian-grid-vertical_line]:stroke-transparent [&_.recharts-curve]:drop-shadow-none"
					initialDimension={{ width: 664, height: 240 }}
				>
					<LineChart
						data={chartData}
						margin={{ top: 12, right: 12, bottom: 8, left: 8 }}
					>
						<CartesianGrid
							stroke="color-mix(in srgb, var(--dashboardy-divider) 68%, transparent)"
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
							allowDecimals={allowDecimals}
							axisLine={false}
							domain={[0, axisMax]}
							orientation="right"
							tickFormatter={(value) => yAxisTickFormatter(Number(value))}
							tickLine={false}
							tickMargin={8}
							width={yAxisWidth}
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
								<DashboardCostHistoryTooltip
									formatValue={formatValue}
									metricLabel={metricLabel}
								/>
							}
						/>
						{series.map((item) => (
							<Line
								key={item.id}
								animationDuration={480}
								animationEasing="ease-out"
								connectNulls
								dataKey={item.dataKey}
								dot={false}
								name={item.label}
								stroke={item.color}
								strokeWidth={2.5}
								type="monotone"
								activeDot={{
									fill: item.color,
									r: 4,
									stroke: "var(--dashboardy-subsurface)",
									strokeWidth: 2,
								}}
							/>
						))}
						{lastRow
							? series.map((item) => (
									<ReferenceDot
										key={`${item.id}-endpoint`}
										fill={item.color}
										ifOverflow="extendDomain"
										r={3.5}
										stroke="var(--dashboardy-subsurface)"
										strokeWidth={2}
										x={lastRow.date}
										y={Number(lastRow[item.dataKey] ?? 0)}
										zIndex={10}
									/>
								))
							: null}
					</LineChart>
				</ChartContainer>
			</div>
		</div>
	);
}
