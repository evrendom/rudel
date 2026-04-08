"use client";

import { format, parseISO } from "date-fns";
import { useMemo } from "react";
import { Bar, BarChart, Rectangle, XAxis, YAxis } from "recharts";
import { type ChartConfig, ChartContainer, ChartTooltip } from "@/app/ui/chart";
import type { DashboardHighlightChangeHandler } from "@/features/dashboard/components/dashboard-highlight-state";
import type { DashboardTokenDailyPoint } from "@/features/dashboard/data/dashboard-token-adapters";
import { formatCompactWholeNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

const MAX_VISIBLE_MODEL_STACKS = 4;
const TOKEN_MODEL_COLORS = [
	"#1949A9",
	"#159C89",
	"#C21674",
	"#7C3AED",
	"#EA580C",
	"#0F766E",
] as const;
const OTHER_MODEL_COLOR = "#D7DBE2";
const TOKEN_CHART_CONFIG = {
	totalTokens: {
		label: "Tokens",
		color: TOKEN_MODEL_COLORS[0],
	},
} satisfies ChartConfig;

type TokenModelSeries = {
	color: string;
	key: string;
	label: string;
};

type TokenChartRow = DashboardTokenDailyPoint &
	Record<string, number | string | Record<string, number> | null>;

function formatCompactNumber(value: number) {
	if (value >= 1_000_000) {
		return `${(value / 1_000_000).toFixed(1)}M`;
	}

	if (value >= 1_000) {
		return `${(value / 1_000).toFixed(1)}K`;
	}

	return value.toLocaleString();
}

function formatTokenMix(inputTokens: number, outputTokens: number) {
	const totalTokens = inputTokens + outputTokens;

	if (totalTokens <= 0) {
		return "—";
	}

	const inputPercent = Math.round((inputTokens / totalTokens) * 100);
	return `${inputPercent} IN / ${100 - inputPercent} OUT`;
}

function shortenModelLabel(model: string) {
	return model.replace("claude-", "").replace(/-\d{8}$/u, "");
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
	modelSeries,
	payload,
}: {
	active?: boolean;
	modelSeries: TokenModelSeries[];
	payload?: Array<{
		color?: string;
		dataKey?: string;
		name?: string;
		payload: TokenChartRow;
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

	const modelRows = modelSeries
		.map((series) => ({
			color: series.color,
			label: series.label,
			value: Number(point[series.key] ?? 0),
		}))
		.filter((item) => Number.isFinite(item.value) && item.value > 0)
		.sort((left, right) => right.value - left.value);

	return (
		<div className="flex min-w-56 flex-col gap-1 rounded-md bg-black px-2.5 py-1.5 text-[11px] font-medium leading-tight text-white/90 shadow-lg">
			<p className="text-white">{point.fullLabel}</p>
			<div className="flex items-center justify-between gap-3">
				<span className="text-white/65">Total</span>
				<span className="tabular-nums text-white">
					{formatCompactNumber(point.totalTokens)}
				</span>
			</div>
			<div className="flex items-center justify-between gap-3">
				<span className="text-white/65">Avg / session</span>
				<span className="tabular-nums text-white">
					{point.avgTokensPerSession == null
						? "—"
						: formatCompactNumber(point.avgTokensPerSession)}
				</span>
			</div>
			<div className="flex items-center justify-between gap-3">
				<span className="text-white/65">Active models</span>
				<span className="tabular-nums text-white">
					{point.activeModels || "—"}
				</span>
			</div>
			<div className="flex items-center justify-between gap-3">
				<span className="text-white/65">Top model</span>
				<span className="truncate text-white">
					{point.dominantModel == null
						? "—"
						: `${shortenModelLabel(point.dominantModel)} (${formatCompactNumber(point.dominantModelTokens)})`}
				</span>
			</div>
			<div className="flex items-center justify-between gap-3">
				<span className="text-white/65">Mix</span>
				<span className="tabular-nums text-white">
					{formatTokenMix(point.inputTokens, point.outputTokens)}
				</span>
			</div>
			{modelRows.length > 0 ? (
				<div className="mt-1 grid max-h-40 gap-1 overflow-y-auto pr-1">
					{modelRows.map((item) => (
						<div
							key={item.label}
							className="flex items-center justify-between gap-6"
						>
							<div className="flex min-w-0 items-center gap-2.5">
								<span
									aria-hidden="true"
									className="size-2 shrink-0 rounded-full"
									style={{ backgroundColor: item.color }}
								/>
								<span className="truncate text-white/65">
									{shortenModelLabel(item.label)}
								</span>
							</div>
							<span className="shrink-0 tabular-nums text-white">
								{formatCompactNumber(item.value)}
							</span>
						</div>
					))}
				</div>
			) : (
				<div className="flex items-center justify-between gap-3">
					<span className="text-white/65">Tokens</span>
					<span className="tabular-nums text-white">
						{formatCompactNumber(point.totalTokens)}
					</span>
				</div>
			)}
		</div>
	);
}

function TokenBarShape(props: {
	activeDate?: string | null;
	activeSource?: "chart" | "table" | null;
	fill?: string;
	height?: number;
	payload?: TokenChartRow;
	segments: readonly TokenModelSeries[];
	width?: number;
	x?: number;
	y?: number;
}) {
	const { x, y, width, height, payload } = props;

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

	const visibleSegments = props.segments.filter(
		(segment) => Number(payload[segment.key] ?? 0) > 0,
	);

	if (!visibleSegments.length) {
		return null;
	}

	const totalValue = visibleSegments.reduce(
		(sum, segment) => sum + Number(payload[segment.key] ?? 0),
		0,
	);

	if (totalValue <= 0) {
		return null;
	}

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
	const showStroke = isHighlighted;
	let segmentTop = y + height;

	return (
		<g
			style={{
				opacity: barOpacity,
				transition: "opacity 300ms cubic-bezier(0.23, 1, 0.32, 1)",
			}}
		>
			{visibleSegments.map((segment, index) => {
				const segmentValue = Number(payload[segment.key] ?? 0);
				const isTopSegment = index === visibleSegments.length - 1;
				const segmentHeight = isTopSegment
					? segmentTop - y
					: (height * segmentValue) / totalValue;
				const nextY = segmentTop - segmentHeight;

				segmentTop = nextY;

				return (
					<Rectangle
						key={segment.key}
						x={x}
						y={nextY}
						width={width}
						height={segmentHeight}
						fill={segment.color}
						radius={isTopSegment ? [4, 4, 0, 0] : 0}
						stroke={highlightStroke}
						strokeWidth={showStroke && isTopSegment ? 1 : 0}
						style={{
							strokeOpacity: showStroke && isTopSegment ? 1 : 0,
							transition: "stroke-opacity 300ms cubic-bezier(0.23, 1, 0.32, 1)",
						}}
					/>
				);
			})}
		</g>
	);
}

export function DashboardTokenPatternChart({
	data,
	className,
	highlightedDate,
	highlightSource,
	onHighlightDateChange,
	tickLabelStyle = "adaptive",
}: {
	className?: string;
	data: DashboardTokenDailyPoint[];
	highlightedDate?: string | null;
	highlightSource?: "chart" | "table" | null;
	onHighlightDateChange?: DashboardHighlightChangeHandler;
	tickLabelStyle?: "adaptive" | "month-date";
}) {
	const axisMax = getAxisMax(data);
	const axisTicks = getAxisTicks(axisMax);
	const { chartData, modelSeries } = useMemo(() => {
		const modelTotals = new Map<string, number>();
		for (const point of data) {
			for (const [model, tokens] of Object.entries(point.modelTokens)) {
				if (tokens > 0) {
					modelTotals.set(model, (modelTotals.get(model) ?? 0) + tokens);
				}
			}
		}

		const sortedModels = Array.from(modelTotals.entries()).sort(
			(left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
		);
		const topModels = sortedModels.slice(0, MAX_VISIBLE_MODEL_STACKS);
		const topModelLabels = new Set(topModels.map(([label]) => label));
		const hasOther = sortedModels.length > MAX_VISIBLE_MODEL_STACKS;
		const modelSeries: TokenModelSeries[] =
			topModels.length > 0
				? topModels.map(([label], index) => ({
						color: TOKEN_MODEL_COLORS[index % TOKEN_MODEL_COLORS.length],
						key: `model_${index + 1}`,
						label,
					}))
				: [
						{
							color: TOKEN_MODEL_COLORS[0],
							key: "unattributed",
							label: "Unattributed",
						},
					];

		if (hasOther) {
			modelSeries.push({
				color: OTHER_MODEL_COLOR,
				key: "other_models",
				label: "Other",
			});
		}

		const chartData: TokenChartRow[] = data.map((point) => {
			const row: TokenChartRow = { ...point };
			for (const series of modelSeries) {
				if (series.key === "other_models") {
					row[series.key] = Object.entries(point.modelTokens)
						.filter(([model]) => !topModelLabels.has(model))
						.reduce((sum, [, tokens]) => sum + tokens, 0);
				} else if (series.key === "unattributed") {
					row[series.key] = point.totalTokens;
				} else {
					row[series.key] = point.modelTokens[series.label] ?? 0;
				}
			}
			return row;
		});

		return {
			chartData,
			modelSeries,
		};
	}, [data]);
	const barSize = getBarSize(chartData.length);
	const chartInteractionProps = onHighlightDateChange
		? {
				onMouseLeave: () => onHighlightDateChange(null),
				onMouseMove: (state: { activeLabel?: unknown }) => {
					onHighlightDateChange(
						typeof state.activeLabel === "string" ? state.activeLabel : null,
						"chart",
					);
				},
			}
		: undefined;

	return (
		<div className={cn("flex min-w-0 flex-1 pt-0 md:pt-4", className)}>
			<ChartContainer
				config={TOKEN_CHART_CONFIG}
				className="h-[12.875rem] w-full aspect-auto"
				initialDimension={{ width: 664, height: 206 }}
			>
				<BarChart
					data={chartData}
					barCategoryGap={0}
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
					<ChartTooltip
						cursor={false}
						content={<TokenPatternTooltip modelSeries={modelSeries} />}
					/>
					<Bar
						dataKey="totalTokens"
						name="Tokens"
						barSize={barSize}
						fill="var(--color-totalTokens)"
						isAnimationActive={false}
						shape={
							<TokenBarShape
								activeDate={highlightedDate}
								activeSource={highlightSource}
								segments={modelSeries}
							/>
						}
					/>
				</BarChart>
			</ChartContainer>
		</div>
	);
}
