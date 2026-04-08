"use client";

import {
	Bar,
	BarChart,
	type MouseHandlerDataParam,
	Rectangle,
	XAxis,
	YAxis,
} from "recharts";
import { type ChartConfig, ChartContainer, ChartTooltip } from "@/app/ui/chart";
import type { DashboardHighlightChangeHandler } from "@/features/dashboard/components/dashboard-highlight-state";
import { formatCompactWholeNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

const chartConfig = {
	totalTokens: {
		label: "Session tokens",
		color: "#1949A9",
	},
} satisfies ChartConfig;

const ZERO_BAR_STUB_VALUE = 0.75;

export type DashboardSessionChartDatum = {
	developerLabel: string;
	durationLabel: string;
	id: string;
	inputTokens: number;
	label: string;
	modelLabel: string;
	outputTokens: number;
	repositoryLabel: string;
	sessionDate: string;
	shortLabel: string;
	skillCount: number;
	totalTokens: number;
};

type DashboardSessionChartRow = DashboardSessionChartDatum & {
	displayValue: number;
};

function getAxisMax(data: DashboardSessionChartDatum[]) {
	const maxTokens = Math.max(...data.map((point) => point.totalTokens), 0);

	if (maxTokens <= 0) {
		return 1;
	}

	const step =
		maxTokens <= 50_000
			? 10_000
			: maxTokens <= 250_000
				? 50_000
				: maxTokens <= 1_000_000
					? 100_000
					: 250_000;

	return Math.ceil(maxTokens / step) * step;
}

function getAxisTicks(axisMax: number) {
	if (axisMax <= 1) {
		return [0, 1];
	}

	const step =
		axisMax <= 50_000
			? 10_000
			: axisMax <= 250_000
				? 50_000
				: axisMax <= 1_000_000
					? 100_000
					: 250_000;

	const ticks = Array.from(
		{ length: Math.floor(axisMax / step) + 1 },
		(_, index) => index * step,
	);

	return ticks.length > 1 ? ticks : [0, axisMax];
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

function getTickLabel(
	pointId: string,
	index: number,
	data: DashboardSessionChartRow[],
	activeId?: string | null,
) {
	const point = data.find((entry) => entry.id === pointId);

	if (!point) {
		return "";
	}

	if (activeId != null) {
		return activeId === point.id ? point.shortLabel : "";
	}

	const isFirstTick = index === 0;
	const isLastTick = index === data.length - 1;

	if (!isFirstTick && !isLastTick) {
		return "";
	}

	return point.shortLabel;
}

function formatSessionTimestamp(value: string) {
	const normalizedValue = value.endsWith("Z") ? value : `${value}Z`;
	const date = new Date(normalizedValue);

	if (Number.isNaN(date.getTime())) {
		return value;
	}

	return date.toLocaleString(undefined, {
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
	});
}

function formatTokenMix(inputTokens: number, outputTokens: number) {
	const totalTokens = inputTokens + outputTokens;

	if (totalTokens <= 0) {
		return "—";
	}

	const inputShare = Math.round((inputTokens / totalTokens) * 100);
	return `${inputShare} IN / ${100 - inputShare} OUT`;
}

function DashboardSessionTooltip({
	active,
	payload,
}: {
	active?: boolean;
	payload?: Array<{
		payload: DashboardSessionChartRow;
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
			<div className="text-white">
				{formatSessionTimestamp(point.sessionDate)}
			</div>
			<div className="text-white/65">{point.label}</div>
			<div className="grid gap-1">
				<div className="flex items-center justify-between gap-3">
					<span className="text-white/65">Total</span>
					<span className="font-mono tabular-nums text-white">
						{formatCompactWholeNumber(point.totalTokens)}
					</span>
				</div>
				<div className="flex items-center justify-between gap-3">
					<span className="text-white/65">Mix</span>
					<span className="font-mono tabular-nums text-white">
						{formatTokenMix(point.inputTokens, point.outputTokens)}
					</span>
				</div>
				<div className="flex items-center justify-between gap-3">
					<span className="text-white/65">Model</span>
					<span className="truncate text-white">{point.modelLabel}</span>
				</div>
				<div className="flex items-center justify-between gap-3">
					<span className="text-white/65">Duration</span>
					<span className="font-mono tabular-nums text-white">
						{point.durationLabel}
					</span>
				</div>
			</div>
		</div>
	);
}

function SessionBarShape(props: {
	activeId?: string | null;
	activeSource?: "chart" | "table" | null;
	fill?: string;
	height?: number;
	payload?: DashboardSessionChartRow;
	width?: number;
	x?: number;
	y?: number;
}) {
	const { fill, x, y, width, height, payload } = props;

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

	const isHighlighted = props.activeId === payload.id;
	const hasExternalHighlight = props.activeId != null;
	const isTableHighlight = props.activeSource === "table";
	const highlightStroke =
		"color-mix(in srgb, var(--dashboardy-heading) 22%, transparent)";
	const barOpacity =
		hasExternalHighlight && !isHighlighted
			? isTableHighlight
				? 0.16
				: 0.26
			: 1;
	const showStroke = isHighlighted;

	return (
		<Rectangle
			x={x}
			y={y}
			width={width}
			height={height}
			fill={fill}
			radius={[4, 4, 0, 0]}
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

export function DashboardSessionChart({
	activeId,
	className,
	data,
	highlightSource,
	onHighlightSessionChange,
}: {
	activeId?: string | null;
	className?: string;
	data: DashboardSessionChartDatum[];
	highlightSource?: "chart" | "table" | null;
	onHighlightSessionChange?: DashboardHighlightChangeHandler;
}) {
	const chartData: DashboardSessionChartRow[] = [...data]
		.sort(
			(left, right) =>
				new Date(left.sessionDate).getTime() -
				new Date(right.sessionDate).getTime(),
		)
		.map((entry) => ({
			...entry,
			displayValue:
				entry.totalTokens > 0 ? entry.totalTokens : ZERO_BAR_STUB_VALUE,
		}));
	const axisMax = getAxisMax(data);
	const axisTicks = getAxisTicks(axisMax);
	const resolvedActiveId = chartData.some((entry) => entry.id === activeId)
		? activeId
		: null;
	const barSize = getBarSize(chartData.length);

	return (
		<div className={cn("flex min-w-0 flex-1 pt-0 md:pt-4", className)}>
			<ChartContainer
				config={chartConfig}
				className="h-[12.875rem] w-full aspect-auto"
				initialDimension={{ width: 664, height: 206 }}
			>
				<BarChart
					data={chartData}
					barCategoryGap={0}
					margin={{ top: 2, right: 18, bottom: 10, left: 0 }}
					onMouseLeave={() => onHighlightSessionChange?.(null)}
					onMouseMove={(state: MouseHandlerDataParam) => {
						onHighlightSessionChange?.(
							typeof state.activeLabel === "string"
								? state.activeLabel
								: typeof state.activeLabel === "number"
									? state.activeLabel.toString()
									: null,
							"chart",
						);
					}}
				>
					<XAxis
						dataKey="id"
						height={22}
						axisLine={{
							stroke:
								"color-mix(in srgb, var(--dashboardy-muted) 40%, transparent)",
						}}
						tickFormatter={(value, index) =>
							getTickLabel(String(value), index, chartData, resolvedActiveId)
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
						width={48}
						tickFormatter={formatCompactWholeNumber}
						tick={{
							fontSize: 12,
							fontWeight: 500,
							fill: "var(--dashboardy-muted)",
							opacity: 0.38,
						}}
					/>
					<ChartTooltip cursor={false} content={<DashboardSessionTooltip />} />
					<Bar
						dataKey="displayValue"
						barSize={barSize}
						fill="var(--color-totalTokens)"
						isAnimationActive={false}
						shape={
							<SessionBarShape
								activeId={resolvedActiveId}
								activeSource={highlightSource}
							/>
						}
					/>
				</BarChart>
			</ChartContainer>
		</div>
	);
}
