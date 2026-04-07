"use client";

import { format, parseISO } from "date-fns";
import { Bar, BarChart, Rectangle, XAxis, YAxis } from "recharts";
import { type ChartConfig, ChartContainer, ChartTooltip } from "@/app/ui/chart";
import type { DashboardDailyPatternPoint } from "@/features/dashboard/data/dashboard-static-data";
import { cn } from "@/lib/utils";

const chartConfig = {
	committed: {
		label: "Committed sessions",
		color: "#039855",
	},
	active: {
		label: "Active sessions",
		color: "#fbbf24",
	},
	stalled: {
		label: "Stalled sessions",
		color: "#f79009",
	},
	dropped: {
		label: "Dropped sessions",
		color: "#f04438",
	},
} satisfies ChartConfig;

const stackOrder = ["committed", "active", "stalled", "dropped"] as const;

type StackKey = (typeof stackOrder)[number];

type DailyChartPoint = DashboardDailyPatternPoint & {
	committed: number;
	active: number;
	stalled: number;
	dropped: number;
	totalSessions: number;
};

function getAxisMax(data: DashboardDailyPatternPoint[]) {
	const maxSessions = Math.max(...data.map((point) => point.sessions ?? 0), 0);

	return Math.max(15, Math.ceil(maxSessions / 15) * 15);
}

function buildChartData(data: DashboardDailyPatternPoint[]): DailyChartPoint[] {
	return data.map((point) => {
		if (
			point.sessions == null ||
			point.commits == null ||
			point.commitRate == null
		) {
			return {
				...point,
				committed: 0,
				active: 0,
				stalled: 0,
				dropped: 0,
				totalSessions: 0,
			};
		}

		const unresolvedSessions = Math.max(point.sessions - point.commits, 0);
		const droppedRatio =
			point.commitRate >= 60 ? 0.08 : point.commitRate >= 45 ? 0.14 : 0.22;
		const stalledRatio =
			point.commitRate >= 60 ? 0.24 : point.commitRate >= 45 ? 0.36 : 0.48;
		const dropped = Math.min(
			unresolvedSessions,
			Math.round(unresolvedSessions * droppedRatio),
		);
		const stalled = Math.min(
			unresolvedSessions - dropped,
			Math.round(unresolvedSessions * stalledRatio),
		);
		const active = Math.max(0, unresolvedSessions - stalled - dropped);

		return {
			...point,
			committed: point.commits,
			active,
			stalled,
			dropped,
			totalSessions: point.sessions,
		};
	});
}

function getTickLabel(dateValue: string, index: number, total: number) {
	const parsedDate = parseISO(dateValue);

	if (Number.isNaN(parsedDate.getTime())) {
		return "";
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
		return 18;
	}

	if (total <= 14) {
		return 12;
	}

	if (total <= 21) {
		return 8;
	}

	return 5;
}

function getBarCategoryGap(total: number) {
	if (total <= 7) {
		return 26;
	}

	if (total <= 14) {
		return 12;
	}

	if (total <= 21) {
		return 6;
	}

	return 3;
}

function SessionCompositionTooltip({
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
				<span className="tabular-nums text-white">
					{point.commits == null ? "—" : point.commits}
				</span>
			</div>
			<div className="flex items-center justify-between gap-3">
				<span className="text-white/65">Commit rate</span>
				<span className="tabular-nums text-white">
					{point.commitRate == null ? "—" : `${point.commitRate}%`}
				</span>
			</div>
		</div>
	);
}

function StackedBarShape(props: {
	fill?: string;
	x?: number;
	y?: number;
	width?: number;
	height?: number;
	payload?: DailyChartPoint;
	dataKey?: StackKey;
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

	return (
		<Rectangle
			x={x}
			y={y}
			width={width}
			height={height}
			fill={fill}
			radius={isTopSegment ? [4, 4, 0, 0] : 0}
		/>
	);
}

export function DashboardDailyPatternChart({
	data,
	className,
}: {
	data: DashboardDailyPatternPoint[];
	className?: string;
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
				>
					<XAxis
						dataKey="date"
						height={22}
						axisLine={{
							stroke:
								"color-mix(in srgb, var(--dashboardy-muted) 40%, transparent)",
						}}
						tickFormatter={(value, index) =>
							getTickLabel(String(value), index, chartData.length)
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
					<ChartTooltip
						cursor={false}
						content={<SessionCompositionTooltip />}
					/>
					<Bar
						dataKey="committed"
						stackId="sessions"
						barSize={barSize}
						fill="var(--color-committed)"
						isAnimationActive={false}
						shape={<StackedBarShape dataKey="committed" />}
					/>
					<Bar
						dataKey="active"
						stackId="sessions"
						barSize={barSize}
						fill="var(--color-active)"
						isAnimationActive={false}
						shape={<StackedBarShape dataKey="active" />}
					/>
					<Bar
						dataKey="stalled"
						stackId="sessions"
						barSize={barSize}
						fill="var(--color-stalled)"
						isAnimationActive={false}
						shape={<StackedBarShape dataKey="stalled" />}
					/>
					<Bar
						dataKey="dropped"
						stackId="sessions"
						barSize={barSize}
						fill="var(--color-dropped)"
						isAnimationActive={false}
						shape={<StackedBarShape dataKey="dropped" />}
					/>
				</BarChart>
			</ChartContainer>
		</div>
	);
}
