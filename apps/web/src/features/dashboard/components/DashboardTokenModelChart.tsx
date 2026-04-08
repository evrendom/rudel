"use client";

import { useMemo } from "react";
import { Bar, BarChart, XAxis, YAxis } from "recharts";
import { type ChartConfig, ChartContainer, ChartTooltip } from "@/app/ui/chart";
import { DashboardStackedTopRoundedBar } from "@/features/dashboard/components/DashboardStackedTopRoundedBar";
import {
	getDashboardBarLabelWidth,
	getDashboardBarSize,
} from "@/features/dashboard/components/dashboard-bar-chart-layout";
import type { DashboardTokenModelChartDatum } from "@/features/dashboard/data/dashboard-token-model-adapter";
import { formatCompactWholeNumber } from "@/lib/format";

const chartConfig = {
	committed: {
		label: "Total tokens",
		color: "#159C89",
	},
	stub: {
		label: "No activity",
		color: "#D7DBE2",
	},
	uncommitted: {
		label: "Total tokens",
		color: "#159C89",
	},
} satisfies ChartConfig;

type DashboardTokenModelChartProps = {
	activeId?: string | null;
	className?: string;
	data: DashboardTokenModelChartDatum[];
};

type DashboardTokenModelChartRow = DashboardTokenModelChartDatum & {
	committed: number;
	stub: number;
	uncommitted: number;
};

function DashboardTokenModelTooltip({
	active,
	payload,
}: {
	active?: boolean;
	payload?: Array<{ payload: DashboardTokenModelChartRow }>;
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
			<div className="text-white">{point.label}</div>
			<div className="flex items-center justify-between gap-3">
				<span className="text-white/65">Total tokens</span>
				<span className="font-mono tabular-nums text-white">
					{formatCompactWholeNumber(point.value)}
				</span>
			</div>
		</div>
	);
}

function DashboardTokenModelAxisTick({
	activeId,
	dataById,
	labelWidth,
	payload,
	x = 0,
	y = 0,
}: {
	activeId?: string | null;
	dataById: Map<string, DashboardTokenModelChartRow>;
	labelWidth: number;
	payload?: { value?: string | number };
	x?: number | string;
	y?: number | string;
}) {
	const datum = dataById.get(String(payload?.value ?? ""));
	const resolvedX = typeof x === "number" ? x : Number(x ?? 0);
	const resolvedY = typeof y === "number" ? y : Number(y ?? 0);

	if (!datum) {
		return null;
	}

	const isHighlighted = activeId != null && datum.id === activeId;
	const hasExternalHighlight = activeId != null;
	const contentOpacity = hasExternalHighlight && !isHighlighted ? 0.28 : 1;

	return (
		<g transform={`translate(${resolvedX},${resolvedY})`}>
			<foreignObject
				x={-labelWidth / 2}
				y={10}
				width={labelWidth}
				height={30}
				requiredExtensions="http://www.w3.org/1999/xhtml"
			>
				<div
					className="flex h-full w-full items-center justify-center px-1 transition-opacity duration-300"
					style={{ opacity: contentOpacity }}
				>
					<span
						className="min-w-0 max-w-full truncate text-center text-[11px] font-semibold leading-4 text-[color:var(--dashboardy-subheading)]"
						title={datum.label}
					>
						{datum.shortLabel}
					</span>
				</div>
			</foreignObject>
		</g>
	);
}

export function DashboardTokenModelChart({
	activeId,
	className,
	data,
}: DashboardTokenModelChartProps) {
	const chartData = useMemo<DashboardTokenModelChartRow[]>(
		() =>
			data.map((entry) => ({
				...entry,
				committed: entry.value,
				stub: 0,
				uncommitted: 0,
			})),
		[data],
	);
	const dataById = useMemo(
		() => new Map(chartData.map((entry) => [entry.id, entry] as const)),
		[chartData],
	);
	const resolvedActiveId =
		activeId != null && dataById.has(activeId) ? activeId : null;
	const barSize = useMemo(
		() => getDashboardBarSize(chartData.length),
		[chartData.length],
	);
	const labelWidth = useMemo(
		() => getDashboardBarLabelWidth(chartData.length, "repository"),
		[chartData.length],
	);

	return (
		<div className={className ?? "relative h-full w-full"}>
			<ChartContainer
				config={chartConfig}
				className="h-full w-full aspect-auto"
				initialDimension={{ width: 664, height: 240 }}
			>
				<BarChart
					data={chartData}
					barCategoryGap={0}
					barGap={0}
					margin={{ top: 8, right: 8, bottom: 40, left: 42 }}
				>
					<XAxis
						dataKey="id"
						axisLine={false}
						height={40}
						interval={0}
						tick={(props) => (
							<DashboardTokenModelAxisTick
								{...props}
								activeId={resolvedActiveId}
								dataById={dataById}
								labelWidth={labelWidth}
							/>
						)}
						tickLine={false}
					/>
					<YAxis
						allowDecimals={false}
						axisLine={false}
						tickLine={false}
						tickMargin={12}
						width={40}
						tickFormatter={(value) => formatCompactWholeNumber(Number(value))}
						tick={{
							fontSize: 13,
							fontWeight: 800,
							fill: "#9A9A9A",
						}}
					/>
					<ChartTooltip
						cursor={false}
						content={<DashboardTokenModelTooltip />}
					/>
					<Bar
						dataKey="committed"
						barSize={barSize}
						fill="var(--color-committed)"
						shape={
							<DashboardStackedTopRoundedBar
								activeId={resolvedActiveId}
								dataKey="committed"
							/>
						}
					/>
				</BarChart>
			</ChartContainer>
		</div>
	);
}
