"use client";

import { useMemo } from "react";
import { Bar, BarChart, XAxis, YAxis } from "recharts";
import { type ChartConfig, ChartContainer, ChartTooltip } from "@/app/ui/chart";
import { DashboardStackedTopRoundedBar } from "@/features/dashboard/components/DashboardStackedTopRoundedBar";
import {
	getDashboardBarLabelWidth,
	getDashboardBarSize,
} from "@/features/dashboard/components/dashboard-bar-chart-layout";
import { formatCompactWholeNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

const chartConfig = {
	committed: {
		label: "Total tokens",
		color: "#159C89",
	},
	uncommitted: {
		label: "Total tokens",
		color: "#159C89",
	},
	stub: {
		label: "No activity",
		color: "#D7DBE2",
	},
} satisfies ChartConfig;

export type DashboardTokenDeveloperDatum = {
	axisLabel: string;
	fullLabel: string;
	id: string;
	imageUrl?: string;
	sessions: number;
	totalTokens: number;
};

type DashboardTokenDeveloperChartProps = {
	activeId?: string | null;
	data: DashboardTokenDeveloperDatum[];
};

type DashboardTokenDeveloperChartRow = DashboardTokenDeveloperDatum & {
	committed: number;
	stub: number;
	uncommitted: number;
};

function formatCompactNumber(value: number) {
	if (value >= 1_000_000) {
		return `${(value / 1_000_000).toFixed(1)}M`;
	}

	if (value >= 1_000) {
		return `${(value / 1_000).toFixed(1)}K`;
	}

	return value.toLocaleString();
}

function getAvatarInitials(fullLabel: string) {
	const fallbackToken = fullLabel.includes("@")
		? (fullLabel.split("@")[0] ?? fullLabel)
		: fullLabel;
	const parts = fallbackToken.split(/\s+/).filter(Boolean);

	if (parts.length === 0) {
		return "AI";
	}

	if (parts.length === 1) {
		return parts[0]?.slice(0, 2).toUpperCase() ?? "AI";
	}

	return `${parts[0]?.[0] ?? ""}${parts.at(-1)?.[0] ?? ""}`.toUpperCase();
}

function getAxisMax(data: DashboardTokenDeveloperChartRow[]) {
	const maxTokens = Math.max(...data.map((point) => point.totalTokens), 0);

	if (maxTokens <= 0) {
		return 50_000;
	}

	if (maxTokens <= 250_000) {
		return Math.ceil(maxTokens / 50_000) * 50_000;
	}

	if (maxTokens <= 1_000_000) {
		return Math.ceil(maxTokens / 100_000) * 100_000;
	}

	return Math.ceil(maxTokens / 250_000) * 250_000;
}

function getAxisTicks(axisMax: number) {
	const step =
		axisMax <= 250_000 ? 50_000 : axisMax <= 1_000_000 ? 100_000 : 250_000;
	const ticks = Array.from(
		{ length: Math.floor(axisMax / step) + 1 },
		(_, index) => index * step,
	);

	return ticks.length > 1 ? ticks : [0, axisMax];
}

function DashboardTokenDeveloperTooltip({
	active,
	payload,
}: {
	active?: boolean;
	payload?: Array<{ payload: DashboardTokenDeveloperChartRow }>;
}) {
	if (!active || !payload?.length) {
		return null;
	}

	const point = payload[0]?.payload;

	if (!point) {
		return null;
	}

	return (
		<div className="grid min-w-44 gap-2 rounded-2xl border border-border/60 bg-background/95 px-3 py-2 text-xs shadow-xl backdrop-blur">
			<div className="font-medium text-foreground">{point.fullLabel}</div>
			<div className="grid gap-1">
				<div className="flex items-center justify-between gap-3">
					<span className="text-muted-foreground">Tokens</span>
					<span className="font-mono font-semibold tabular-nums text-foreground">
						{formatCompactNumber(point.totalTokens)}
					</span>
				</div>
				<div className="flex items-center justify-between gap-3">
					<span className="text-muted-foreground">Sessions</span>
					<span className="font-mono font-semibold tabular-nums text-foreground">
						{point.sessions}
					</span>
				</div>
				<div className="flex items-center justify-between gap-3">
					<span className="text-muted-foreground">Avg / session</span>
					<span className="font-mono font-semibold tabular-nums text-foreground">
						{point.sessions > 0
							? formatCompactNumber(
									Math.round(point.totalTokens / point.sessions),
								)
							: "—"}
					</span>
				</div>
			</div>
		</div>
	);
}

function DashboardTokenDeveloperAxisTick({
	activeId,
	dataById,
	labelWidth,
	payload,
	x = 0,
	y = 0,
}: {
	activeId?: string | null;
	dataById: Map<string, DashboardTokenDeveloperChartRow>;
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
	const avatarBorderColor = isHighlighted
		? "color-mix(in srgb, var(--dashboardy-heading) 18%, var(--border))"
		: undefined;

	return (
		<g transform={`translate(${resolvedX},${resolvedY})`}>
			<foreignObject
				x={-labelWidth / 2}
				y={8}
				width={labelWidth}
				height={34}
				requiredExtensions="http://www.w3.org/1999/xhtml"
			>
				<div className="flex h-full w-full items-center justify-center">
					<div
						className="inline-flex min-w-0 max-w-full items-center justify-center gap-2 px-1 transition-opacity duration-300"
						style={{ opacity: contentOpacity }}
					>
						<div
							className="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border/60 bg-[color:var(--dashboardy-surface)] shadow-sm transition-colors duration-300"
							style={{ borderColor: avatarBorderColor }}
						>
							{datum.imageUrl ? (
								<img
									src={datum.imageUrl}
									alt={datum.fullLabel}
									className="size-full object-cover"
								/>
							) : (
								<span className="text-[10px] font-semibold text-[color:var(--dashboardy-heading)]">
									{getAvatarInitials(datum.fullLabel)}
								</span>
							)}
						</div>
						<span className="min-w-0 max-w-full truncate text-left text-[11px] font-semibold leading-4 text-[color:var(--dashboardy-subheading)]">
							{datum.axisLabel}
						</span>
					</div>
				</div>
			</foreignObject>
		</g>
	);
}

export function DashboardTokenDeveloperChart({
	activeId,
	className,
	data,
}: DashboardTokenDeveloperChartProps & {
	className?: string;
}) {
	const chartData = useMemo<DashboardTokenDeveloperChartRow[]>(
		() =>
			data.map((entry) => ({
				...entry,
				committed: entry.totalTokens,
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
	const axisMax = useMemo(() => getAxisMax(chartData), [chartData]);
	const axisTicks = useMemo(() => getAxisTicks(axisMax), [axisMax]);
	const barSize = useMemo(
		() => getDashboardBarSize(chartData.length),
		[chartData.length],
	);
	const labelWidth = useMemo(
		() => getDashboardBarLabelWidth(chartData.length),
		[chartData.length],
	);

	return (
		<div className={cn("relative h-full w-full", className)}>
			<ChartContainer
				config={chartConfig}
				className="h-full w-full aspect-auto"
				initialDimension={{ width: 664, height: 240 }}
			>
				<BarChart
					data={chartData}
					barCategoryGap={0}
					barGap={0}
					margin={{ top: 8, right: 8, bottom: 44, left: 42 }}
				>
					<XAxis
						dataKey="id"
						axisLine={false}
						height={44}
						interval={0}
						tick={(props) => (
							<DashboardTokenDeveloperAxisTick
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
						domain={[0, axisMax]}
						ticks={axisTicks}
						axisLine={false}
						tickLine={false}
						tickMargin={12}
						width={34}
						tickFormatter={(value) => formatCompactWholeNumber(Number(value))}
						tick={{
							fontSize: 13,
							fontWeight: 800,
							fill: "#9A9A9A",
						}}
					/>
					<ChartTooltip
						cursor={false}
						content={<DashboardTokenDeveloperTooltip />}
					/>
					<Bar
						dataKey="committed"
						stackId="tokens"
						barSize={barSize}
						fill="var(--color-committed)"
						shape={
							<DashboardStackedTopRoundedBar
								activeId={resolvedActiveId}
								dataKey="committed"
							/>
						}
					/>
					<Bar
						dataKey="uncommitted"
						stackId="tokens"
						barSize={barSize}
						fill="var(--color-uncommitted)"
						shape={
							<DashboardStackedTopRoundedBar
								activeId={resolvedActiveId}
								dataKey="uncommitted"
							/>
						}
					/>
					<Bar
						dataKey="stub"
						stackId="tokens"
						barSize={barSize}
						fill="var(--color-stub)"
						shape={
							<DashboardStackedTopRoundedBar
								activeId={resolvedActiveId}
								dataKey="stub"
							/>
						}
					/>
				</BarChart>
			</ChartContainer>
		</div>
	);
}
