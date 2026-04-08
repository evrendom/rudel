"use client";

import type { RepositoryDailyTrendData } from "@rudel/api-routes";
import { format, parseISO } from "date-fns";
import { useMemo } from "react";
import { Bar, BarChart, Rectangle, XAxis, YAxis } from "recharts";
import { type ChartConfig, ChartContainer, ChartTooltip } from "@/app/ui/chart";
import { DASHBOARD_REPOSITORY_TREND_COLORS } from "@/features/dashboard/data/dashboard-repository-trend";
import type { DashboardDailyPatternPoint } from "@/features/dashboard/data/dashboard-static-data";
import { cn } from "@/lib/utils";

const commitFlowChartConfig = {
	committed: {
		label: "Committed sessions",
		color: "#1949A9",
	},
	uncommitted: {
		label: "Uncommitted sessions",
		color: "#C21674",
	},
} satisfies ChartConfig;

const commitFlowStackOrder = ["committed", "uncommitted"] as const;

type DailyPatternChartMode = "commit-flow" | "repository-stack";
type ChartPointRecord = DashboardDailyPatternPoint &
	Record<string, number | string | null>;
type RepositoryStackSeries = {
	color: string;
	key: string;
	label: string;
	totalSessions: number;
};

function getAxisMax(data: DashboardDailyPatternPoint[]) {
	const maxSessions = Math.max(...data.map((point) => point.sessions ?? 0), 0);

	return Math.max(15, Math.ceil(maxSessions / 15) * 15);
}

function buildCommitFlowChartData(
	data: DashboardDailyPatternPoint[],
): ChartPointRecord[] {
	return data.map((point) => {
		if (point.sessions == null || point.commits == null) {
			return {
				...point,
				committed: 0,
				uncommitted: 0,
			};
		}

		return {
			...point,
			committed: point.commits,
			uncommitted: Math.max(point.sessions - point.commits, 0),
		};
	});
}

function buildRepositoryStackData(
	data: DashboardDailyPatternPoint[],
	repositoryDailyTrend: RepositoryDailyTrendData[],
) {
	const repositoryTotals = new Map<string, number>();

	for (const row of repositoryDailyTrend) {
		repositoryTotals.set(
			row.repository,
			(repositoryTotals.get(row.repository) ?? 0) + row.sessions,
		);
	}

	const repositorySeries = Array.from(repositoryTotals.entries())
		.sort(
			(left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
		)
		.map(([label, totalSessions], index) => ({
			color:
				DASHBOARD_REPOSITORY_TREND_COLORS[
					index % DASHBOARD_REPOSITORY_TREND_COLORS.length
				],
			key: `repository-${index + 1}`,
			label,
			totalSessions,
		})) satisfies RepositoryStackSeries[];

	const sessionsByDate = new Map(
		repositoryDailyTrend.map(
			(row) => [`${row.repository}:${row.date}`, row.sessions] as const,
		),
	);

	const chartData = data.map((point) => {
		const nextPoint: ChartPointRecord = { ...point };

		for (const series of repositorySeries) {
			nextPoint[series.key] =
				sessionsByDate.get(`${series.label}:${point.date}`) ?? 0;
		}

		return nextPoint;
	});

	const chartConfig = Object.fromEntries(
		repositorySeries.map((series) => [
			series.key,
			{
				label: series.label,
				color: series.color,
			},
		]),
	) satisfies ChartConfig;

	return {
		chartConfig,
		chartData,
		repositorySeries,
		stackOrder: repositorySeries.map((series) => series.key),
	};
}

function getTickLabel(
	dateValue: string,
	index: number,
	total: number,
	activeDate?: string | null,
) {
	const parsedDate = parseISO(dateValue);

	if (Number.isNaN(parsedDate.getTime())) {
		return "";
	}

	if (activeDate != null) {
		return activeDate === dateValue
			? total <= 7
				? format(parsedDate, "EEE d")
				: format(parsedDate, "MMM d")
			: "";
	}

	const isFirstTick = index === 0;
	const isLastTick = index === total - 1;

	if (!isFirstTick && !isLastTick) {
		return "";
	}

	return total <= 7 ? format(parsedDate, "EEE d") : format(parsedDate, "MMM d");
}

function getBarSize(total: number) {
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

function getBarCategoryGap(total: number) {
	if (total <= 7) {
		return 0;
	}

	if (total <= 14) {
		return 0;
	}

	if (total <= 21) {
		return 0;
	}

	if (total <= 31) {
		return 0;
	}

	return 0;
}

function DailySessionsTooltip({
	active,
	payload,
}: {
	active?: boolean;
	payload?: Array<{
		color?: string;
		dataKey?: string;
		name?: string;
		value?: number | string;
		payload: ChartPointRecord;
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
		<div className="flex min-w-44 flex-col gap-1 rounded-md bg-black px-2.5 py-1.5 text-[11px] font-medium leading-tight text-white/90 shadow-lg">
			<p className="text-white">{point.fullLabel}</p>
			<div className="flex items-center justify-between gap-3">
				<span className="text-white/65">Sessions</span>
				<span className="tabular-nums text-white">
					{point.sessions == null ? "-" : point.sessions}
				</span>
			</div>
			<div className="flex items-center justify-between gap-3">
				<span className="text-white/65">Committed</span>
				<span className="tabular-nums text-white">
					{point.commits == null ? "-" : point.commits}
				</span>
			</div>
			<div className="flex items-center justify-between gap-3">
				<span className="text-white/65">Uncommitted</span>
				<span className="tabular-nums text-white">
					{Math.max((point.sessions ?? 0) - (point.commits ?? 0), 0)}
				</span>
			</div>
		</div>
	);
}

function DailyBarShape(props: {
	activeDate?: string | null;
	activeSource?: "chart" | "table" | null;
	dataKey?: string;
	fill?: string;
	height?: number;
	payload?: ChartPointRecord;
	stackOrder: readonly string[];
	width?: number;
	x?: number;
	y?: number;
}) {
	const { fill, x, y, width, height, payload, dataKey } = props;

	if (
		typeof x !== "number" ||
		typeof y !== "number" ||
		typeof width !== "number" ||
		typeof height !== "number" ||
		!payload ||
		!dataKey ||
		height <= 0
	) {
		return null;
	}

	const keyIndex = props.stackOrder.indexOf(dataKey);
	const isTopSegment = props.stackOrder
		.slice(keyIndex + 1)
		.every((key) => Number(payload[key] ?? 0) === 0);
	const isHighlighted = props.activeDate === payload.date;
	const hasExternalHighlight = props.activeDate != null;
	const isTableHighlight = props.activeSource === "table";
	const highlightStroke =
		"color-mix(in srgb, var(--dashboardy-heading) 22%, transparent)";
	const barOpacity =
		hasExternalHighlight && !isHighlighted
			? isTableHighlight
				? 0.16
				: 0.26
			: 1;
	const showStroke = isHighlighted && isTopSegment;

	return (
		<Rectangle
			x={x}
			y={y}
			width={width}
			height={height}
			fill={fill}
			radius={isTopSegment ? [4, 4, 0, 0] : 0}
			stroke={highlightStroke}
			strokeWidth={showStroke ? 1 : 0}
			style={{
				opacity: barOpacity,
				strokeOpacity: showStroke ? 1 : 0,
				transition:
					"opacity 300ms cubic-bezier(0.23, 1, 0.32, 1), stroke-opacity 300ms cubic-bezier(0.23, 1, 0.32, 1)",
			}}
		/>
	);
}

export function DashboardDailyPatternChart({
	data,
	className,
	highlightedDate,
	highlightSource,
	onHighlightDateChange,
	mode = "commit-flow",
	repositoryDailyTrend,
}: {
	data: DashboardDailyPatternPoint[];
	className?: string;
	highlightedDate?: string | null;
	highlightSource?: "chart" | "table" | null;
	onHighlightDateChange?: (date: string | null) => void;
	mode?: DailyPatternChartMode;
	repositoryDailyTrend?: RepositoryDailyTrendData[] | undefined;
}) {
	const hasRepositoryStackData =
		mode === "repository-stack" && (repositoryDailyTrend?.length ?? 0) > 0;
	const repositoryStackData = useMemo(
		() =>
			hasRepositoryStackData
				? buildRepositoryStackData(data, repositoryDailyTrend ?? [])
				: null,
		[data, hasRepositoryStackData, repositoryDailyTrend],
	);
	const commitFlowChartData = useMemo(
		() => buildCommitFlowChartData(data),
		[data],
	);
	const chartData = hasRepositoryStackData
		? (repositoryStackData?.chartData ?? [])
		: commitFlowChartData;
	const chartConfig = hasRepositoryStackData
		? (repositoryStackData?.chartConfig ?? {})
		: commitFlowChartConfig;
	const stackOrder = hasRepositoryStackData
		? (repositoryStackData?.stackOrder ?? [])
		: [...commitFlowStackOrder];
	const axisMax = getAxisMax(data);
	const axisTicks = Array.from(
		{ length: Math.floor(axisMax / 15) + 1 },
		(_, index) => index * 15,
	);
	const barSize = getBarSize(chartData.length);
	const barCategoryGap = getBarCategoryGap(chartData.length);
	const chartInteractionProps = onHighlightDateChange
		? {
				onMouseLeave: () => onHighlightDateChange(null),
				onMouseMove: (state: { activeLabel?: unknown }) => {
					onHighlightDateChange(
						typeof state.activeLabel === "string" ? state.activeLabel : null,
					);
				},
			}
		: undefined;

	return (
		<div className={cn("flex min-w-0 flex-1 pt-0 md:pt-4", className)}>
			<ChartContainer
				config={chartConfig}
				className="h-[12.875rem] w-full aspect-auto"
				initialDimension={{ width: 664, height: 206 }}
			>
				<BarChart
					data={chartData}
					barCategoryGap={barCategoryGap}
					margin={{ top: 2, right: 18, bottom: 10, left: 0 }}
					{...chartInteractionProps}
				>
					<XAxis
						dataKey="date"
						height={22}
						axisLine={{
							stroke:
								"color-mix(in srgb, var(--dashboardy-muted) 40%, transparent)",
						}}
						tickFormatter={(value, index) =>
							getTickLabel(
								String(value),
								index,
								chartData.length,
								highlightedDate,
							)
						}
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
						domain={[0, axisMax]}
						ticks={axisTicks}
						axisLine={{
							stroke:
								"color-mix(in srgb, var(--dashboardy-muted) 40%, transparent)",
						}}
						tickLine={{
							stroke:
								"color-mix(in srgb, var(--dashboardy-muted) 40%, transparent)",
						}}
						tickMargin={4}
						width={26}
						tick={{
							fontSize: 12,
							fontWeight: 500,
							fill: "var(--dashboardy-muted)",
							opacity: 0.38,
						}}
					/>
					<ChartTooltip cursor={false} content={<DailySessionsTooltip />} />
					{hasRepositoryStackData
						? (repositoryStackData?.repositorySeries ?? []).map((series) => (
								<Bar
									key={series.key}
									dataKey={series.key}
									name={series.label}
									stackId="sessions"
									barSize={barSize}
									fill={series.color}
									isAnimationActive={false}
									shape={
										<DailyBarShape
											dataKey={series.key}
											activeDate={highlightedDate}
											activeSource={highlightSource}
											stackOrder={stackOrder}
										/>
									}
								/>
							))
						: commitFlowStackOrder.map((seriesKey) => (
								<Bar
									key={seriesKey}
									dataKey={seriesKey}
									stackId="sessions"
									barSize={barSize}
									fill={`var(--color-${seriesKey})`}
									isAnimationActive={false}
									shape={
										<DailyBarShape
											dataKey={seriesKey}
											activeDate={highlightedDate}
											activeSource={highlightSource}
											stackOrder={stackOrder}
										/>
									}
								/>
							))}
				</BarChart>
			</ChartContainer>
		</div>
	);
}
