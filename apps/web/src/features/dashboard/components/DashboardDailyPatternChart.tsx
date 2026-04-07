"use client";

import { format, parseISO } from "date-fns";
import { Bar, BarChart, Rectangle, XAxis, YAxis } from "recharts";
import { type ChartConfig, ChartContainer, ChartTooltip } from "@/app/ui/chart";
import type { DashboardDailyPatternPoint } from "@/features/dashboard/data/dashboard-static-data";
import { cn } from "@/lib/utils";

const chartConfig = {
	committed: {
		label: "Committed sessions",
		color: "#1949A9",
	},
	uncommitted: {
		label: "Uncommitted sessions",
		color: "#C21674",
	},
} satisfies ChartConfig;

const stackOrder = ["committed", "uncommitted"] as const;

type SeriesKey = (typeof stackOrder)[number];

type DailyChartPoint = DashboardDailyPatternPoint & {
	committed: number;
	uncommitted: number;
};

function getAxisMax(data: DashboardDailyPatternPoint[]) {
	const maxSessions = Math.max(...data.map((point) => point.sessions ?? 0), 0);

	return Math.max(15, Math.ceil(maxSessions / 15) * 15);
}

function buildChartData(data: DashboardDailyPatternPoint[]): DailyChartPoint[] {
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
	payload?: Array<{ payload: DailyChartPoint }>;
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
					{point.sessions == null ? "—" : point.sessions}
				</span>
			</div>
			<div className="flex items-center justify-between gap-3">
				<span className="text-white/65">Committed</span>
				<span className="tabular-nums text-white">{point.committed}</span>
			</div>
			<div className="flex items-center justify-between gap-3">
				<span className="text-white/65">Uncommitted</span>
				<span className="tabular-nums text-white">{point.uncommitted}</span>
			</div>
		</div>
	);
}

function DailyBarShape(props: {
	activeDate?: string | null;
	activeSource?: "chart" | "table" | null;
	dataKey?: SeriesKey;
	fill?: string;
	x?: number;
	y?: number;
	width?: number;
	height?: number;
	payload?: DailyChartPoint;
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

	const keyIndex = stackOrder.indexOf(dataKey);
	const isTopSegment = stackOrder
		.slice(keyIndex + 1)
		.every((key) => payload[key] === 0);
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
	const showStroke = isHighlighted && dataKey === "uncommitted";

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
}: {
	data: DashboardDailyPatternPoint[];
	className?: string;
	highlightedDate?: string | null;
	highlightSource?: "chart" | "table" | null;
	onHighlightDateChange?: (date: string | null) => void;
}) {
	const chartData = buildChartData(data);
	const axisMax = getAxisMax(data);
	const axisTicks = Array.from(
		{ length: Math.floor(axisMax / 15) + 1 },
		(_, index) => index * 15,
	);
	const barSize = getBarSize(chartData.length);
	const barCategoryGap = getBarCategoryGap(chartData.length);

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
					onMouseLeave={() => onHighlightDateChange?.(null)}
					onMouseMove={(state) => {
						const dateValue = state?.activePayload?.[0]?.payload?.date;
						onHighlightDateChange?.(
							typeof dateValue === "string" ? dateValue : null,
						);
					}}
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
					<Bar
						dataKey="committed"
						stackId="sessions"
						barSize={barSize}
						fill="var(--color-committed)"
						isAnimationActive={false}
						shape={
							<DailyBarShape
								dataKey="committed"
								activeDate={highlightedDate}
								activeSource={highlightSource}
							/>
						}
					/>
					<Bar
						dataKey="uncommitted"
						stackId="sessions"
						barSize={barSize}
						fill="var(--color-uncommitted)"
						isAnimationActive={false}
						shape={
							<DailyBarShape
								dataKey="uncommitted"
								activeDate={highlightedDate}
								activeSource={highlightSource}
							/>
						}
					/>
				</BarChart>
			</ChartContainer>
		</div>
	);
}
