"use client";

import { format, parseISO } from "date-fns";
import { Bar, BarChart, Rectangle, XAxis, YAxis } from "recharts";
import { type ChartConfig, ChartContainer, ChartTooltip } from "@/app/ui/chart";
import type { DashboardTokenDailyPoint } from "@/features/dashboard/data/dashboard-tab-adapters";
import { formatCompactWholeNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

const chartConfig = {
	inputTokens: {
		label: "Input tokens",
		color: "#1949A9",
	},
	outputTokens: {
		label: "Output tokens",
		color: "#C21674",
	},
} satisfies ChartConfig;

const stackOrder = ["inputTokens", "outputTokens"] as const;

function formatCompactNumber(value: number) {
	if (value >= 1_000_000) {
		return `${(value / 1_000_000).toFixed(1)}M`;
	}

	if (value >= 1_000) {
		return `${(value / 1_000).toFixed(1)}K`;
	}

	return value.toLocaleString();
}

function getAxisMax(data: DashboardTokenDailyPoint[]) {
	const maxTokens = Math.max(...data.map((point) => point.totalTokens), 0);

	if (maxTokens <= 0) {
		return 50_000;
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

function getTickLabel(
	dateValue: string,
	index: number,
	total: number,
	activeDate?: string | null,
	labelStyle: "adaptive" | "month-date" = "adaptive",
) {
	const parsedDate = parseISO(dateValue);

	if (Number.isNaN(parsedDate.getTime())) {
		return "";
	}

	if (activeDate != null) {
		return activeDate === dateValue
			? labelStyle === "month-date"
				? format(parsedDate, "MMM d")
				: total <= 7
					? format(parsedDate, "EEE d")
					: format(parsedDate, "MMM d")
			: "";
	}

	const isFirstTick = index === 0;
	const isLastTick = index === total - 1;

	if (!isFirstTick && !isLastTick) {
		return "";
	}

	return labelStyle === "month-date"
		? format(parsedDate, "MMM d")
		: total <= 7
			? format(parsedDate, "EEE d")
			: format(parsedDate, "MMM d");
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

function TokenPatternTooltip({
	active,
	payload,
}: {
	active?: boolean;
	payload?: Array<{
		payload: DashboardTokenDailyPoint;
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
		<div className="flex min-w-48 flex-col gap-1 rounded-md bg-black px-2.5 py-1.5 text-[11px] font-medium leading-tight text-white/90 shadow-lg">
			<p className="text-white">{point.fullLabel}</p>
			<div className="flex items-center justify-between gap-3">
				<span className="text-white/65">Total</span>
				<span className="tabular-nums text-white">
					{formatCompactNumber(point.totalTokens)}
				</span>
			</div>
			<div className="flex items-center justify-between gap-3">
				<span className="text-white/65">Input</span>
				<span className="tabular-nums text-white">
					{formatCompactNumber(point.inputTokens)}
				</span>
			</div>
			<div className="flex items-center justify-between gap-3">
				<span className="text-white/65">Output</span>
				<span className="tabular-nums text-white">
					{formatCompactNumber(point.outputTokens)}
				</span>
			</div>
			<div className="flex items-center justify-between gap-3">
				<span className="text-white/65">Sessions</span>
				<span className="tabular-nums text-white">{point.sessions}</span>
			</div>
		</div>
	);
}

function TokenBarShape(props: {
	activeDate?: string | null;
	activeSource?: "chart" | "table" | null;
	dataKey?: string;
	fill?: string;
	height?: number;
	payload?: DashboardTokenDailyPoint;
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
		.every(
			(key) =>
				Number(payload[key as keyof DashboardTokenDailyPoint] ?? 0) === 0,
		);
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

export function DashboardTokenPatternChart({
	data,
	className,
	highlightedDate,
	highlightSource,
	tickLabelStyle = "adaptive",
}: {
	className?: string;
	data: DashboardTokenDailyPoint[];
	highlightedDate?: string | null;
	highlightSource?: "chart" | "table" | null;
	tickLabelStyle?: "adaptive" | "month-date";
}) {
	const axisMax = getAxisMax(data);
	const axisTicks = getAxisTicks(axisMax);
	const barSize = getBarSize(data.length);

	return (
		<div className={cn("flex min-w-0 flex-1 pt-0 md:pt-4", className)}>
			<ChartContainer
				config={chartConfig}
				className="h-[12.875rem] w-full aspect-auto"
				initialDimension={{ width: 664, height: 206 }}
			>
				<BarChart
					data={data}
					barCategoryGap={0}
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
							getTickLabel(
								String(value),
								index,
								data.length,
								highlightedDate,
								tickLabelStyle,
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
						width={48}
						tickFormatter={formatCompactWholeNumber}
						tick={{
							fontSize: 12,
							fontWeight: 500,
							fill: "var(--dashboardy-muted)",
							opacity: 0.38,
						}}
					/>
					<ChartTooltip cursor={false} content={<TokenPatternTooltip />} />
					<Bar
						dataKey="inputTokens"
						stackId="tokens"
						barSize={barSize}
						fill="var(--color-inputTokens)"
						isAnimationActive={false}
						shape={
							<TokenBarShape
								dataKey="inputTokens"
								activeDate={highlightedDate}
								activeSource={highlightSource}
								stackOrder={stackOrder}
							/>
						}
					/>
					<Bar
						dataKey="outputTokens"
						stackId="tokens"
						barSize={barSize}
						fill="var(--color-outputTokens)"
						isAnimationActive={false}
						shape={
							<TokenBarShape
								dataKey="outputTokens"
								activeDate={highlightedDate}
								activeSource={highlightSource}
								stackOrder={stackOrder}
							/>
						}
					/>
				</BarChart>
			</ChartContainer>
		</div>
	);
}
