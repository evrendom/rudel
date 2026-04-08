"use client";

import { useMemo } from "react";
import { Bar, BarChart, XAxis, YAxis } from "recharts";
import { type ChartConfig, ChartContainer, ChartTooltip } from "@/app/ui/chart";
import { DashboardStackedTopRoundedBar } from "@/features/dashboard/components/DashboardStackedTopRoundedBar";
import {
	getDashboardBarLabelWidth,
	getDashboardBarSize,
} from "@/features/dashboard/components/dashboard-bar-chart-layout";

const ZERO_BAR_STUB_VALUE = 0.75;
const COMMIT_CHART_COLOR = "#1949A9";
const UNCOMMITTED_CHART_COLOR = "#C21674";
const SESSION_CHART_COLOR = "#159C89";
type DashboardRepositoryChartVariant = "commits" | "sessions";

export type DashboardRepositoryChartDatum = {
	activeDays?: number | null;
	axisLabel: string;
	commits: number;
	fullLabel: string;
	id: string;
	sessions: number;
};

type DashboardRepositoryChartRow = DashboardRepositoryChartDatum & {
	committed: number;
	stub: number;
	uncommitted: number;
};

function getRepositoryAxisLabel(label: string) {
	if (label.length <= 14) {
		return label;
	}

	return `${label.slice(0, 12)}…`;
}

function getAxisMax(data: DashboardRepositoryChartRow[]) {
	const maxSessions = Math.max(...data.map((point) => point.sessions), 0);

	if (maxSessions <= 0) {
		return 15;
	}

	if (maxSessions <= 30) {
		return Math.ceil(maxSessions / 5) * 5;
	}

	if (maxSessions <= 90) {
		return Math.ceil(maxSessions / 10) * 10;
	}

	return Math.ceil(maxSessions / 20) * 20;
}

function getAxisTicks(axisMax: number) {
	const step =
		axisMax <= 30 ? 5 : axisMax <= 90 ? 10 : axisMax <= 180 ? 20 : 40;
	const ticks = Array.from(
		{ length: Math.floor(axisMax / step) + 1 },
		(_, index) => index * step,
	);

	return ticks.length > 1 ? ticks : [0, axisMax];
}

function DashboardRepositoryTooltip({
	active,
	variant,
	payload,
}: {
	active?: boolean;
	variant: DashboardRepositoryChartVariant;
	payload?: Array<{ payload: DashboardRepositoryChartRow }>;
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
			<div className="text-white">{point.fullLabel}</div>
			<div className="grid gap-1">
				<div className="flex items-center justify-between gap-3">
					<span className="text-white/65">Sessions</span>
					<span className="font-mono tabular-nums text-white">
						{point.sessions}
					</span>
				</div>
				{variant === "commits" ? (
					<>
						<div className="flex items-center justify-between gap-3">
							<span className="text-white/65">Committed sessions</span>
							<span className="font-mono tabular-nums text-white">
								{point.committed}
							</span>
						</div>
						<div className="flex items-center justify-between gap-3">
							<span className="text-white/65">Uncommitted sessions</span>
							<span className="font-mono tabular-nums text-white">
								{point.uncommitted}
							</span>
						</div>
					</>
				) : (
					<>
						<div className="flex items-center justify-between gap-3">
							<span className="text-white/65">Active days</span>
							<span className="font-mono tabular-nums text-white">
								{point.activeDays ?? "—"}
							</span>
						</div>
						<div className="flex items-center justify-between gap-3">
							<span className="text-white/65">Avg / day</span>
							<span className="font-mono tabular-nums text-white">
								{point.activeDays && point.activeDays > 0
									? Math.round(
											point.sessions / point.activeDays,
										).toLocaleString()
									: "—"}
							</span>
						</div>
					</>
				)}
			</div>
		</div>
	);
}

function DashboardRepositoryAxisTick({
	activeId,
	dataById,
	labelWidth,
	payload,
	x = 0,
	y = 0,
}: {
	activeId?: string | null;
	dataById: Map<string, DashboardRepositoryChartRow>;
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
					<span className="min-w-0 max-w-full truncate text-center text-[11px] font-semibold leading-4 text-[color:var(--dashboardy-subheading)]">
						{datum.axisLabel}
					</span>
				</div>
			</foreignObject>
		</g>
	);
}

export function DashboardRepositoryChart({
	activeId,
	data,
	variant = "commits",
}: {
	activeId?: string | null;
	data: DashboardRepositoryChartDatum[];
	variant?: DashboardRepositoryChartVariant;
}) {
	const chartData = useMemo<DashboardRepositoryChartRow[]>(
		() =>
			data.map((entry) => ({
				...entry,
				committed: variant === "sessions" ? entry.sessions : entry.commits,
				stub: entry.sessions > 0 ? 0 : ZERO_BAR_STUB_VALUE,
				uncommitted:
					variant === "sessions"
						? 0
						: Math.max(entry.sessions - entry.commits, 0),
			})),
		[data, variant],
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
		() => getDashboardBarLabelWidth(chartData.length, "repository"),
		[chartData.length],
	);
	const chartConfig = useMemo(
		() =>
			({
				committed: {
					label:
						variant === "sessions"
							? "Repository sessions"
							: "Committed sessions",
					color:
						variant === "sessions" ? SESSION_CHART_COLOR : COMMIT_CHART_COLOR,
				},
				uncommitted: {
					label:
						variant === "sessions"
							? "Repository sessions"
							: "Uncommitted sessions",
					color:
						variant === "sessions"
							? SESSION_CHART_COLOR
							: UNCOMMITTED_CHART_COLOR,
				},
			}) satisfies ChartConfig,
		[variant],
	);

	return (
		<div className="relative h-full w-full">
			<ChartContainer
				config={chartConfig}
				className="h-full w-full aspect-auto"
				initialDimension={{ width: 664, height: 224 }}
			>
				<BarChart
					data={chartData}
					barCategoryGap={0}
					barGap={0}
					margin={{ top: 8, right: 8, bottom: 40, left: 18 }}
				>
					<XAxis
						dataKey="id"
						axisLine={false}
						height={40}
						interval={0}
						tick={(props) => (
							<DashboardRepositoryAxisTick
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
						tick={{
							fontSize: 13,
							fontWeight: 800,
							fill: "#9A9A9A",
						}}
					/>
					<ChartTooltip
						cursor={false}
						content={<DashboardRepositoryTooltip variant={variant} />}
					/>
					<Bar
						dataKey="committed"
						stackId="sessions"
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
						stackId="sessions"
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
						stackId="sessions"
						barSize={barSize}
						fill="var(--dashboardy-subtle)"
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

export function buildDashboardRepositoryChartData(
	rows: Array<{
		activeDays?: number | null;
		id: string;
		label: string;
		commits: number;
		sessions: number;
	}>,
): DashboardRepositoryChartDatum[] {
	return rows.map((row) => ({
		activeDays: row.activeDays,
		axisLabel: getRepositoryAxisLabel(row.label),
		commits: row.commits,
		fullLabel: row.label,
		id: row.id,
		sessions: row.sessions,
	}));
}
