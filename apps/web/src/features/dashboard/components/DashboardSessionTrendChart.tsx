"use client";
import { format, parseISO } from "date-fns";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { type ChartConfig, ChartContainer, ChartTooltip } from "@/app/ui/chart";
import { formatCompactWholeNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

const chartConfig = {
	sessions: {
		label: "Sessions",
		color: "#1949A9",
	},
} satisfies ChartConfig;

export type DashboardSessionTrendGranularity =
	| "hour"
	| "day"
	| "week"
	| "month";

export type DashboardSessionTrendChartDatum = {
	activeUsers: number;
	fullLabel: string;
	granularity: DashboardSessionTrendGranularity;
	id: string;
	sessionCount: number;
	shortLabel: string;
	totalDurationMin: number;
	totalTokens: number;
};

function formatDurationLabel(totalDurationMin: number) {
	if (totalDurationMin >= 60) {
		return `${(totalDurationMin / 60).toFixed(1)}h`;
	}

	return `${Math.round(totalDurationMin)}m`;
}

function SessionTrendTooltip({
	active,
	payload,
}: {
	active?: boolean;
	payload?: Array<{
		payload: DashboardSessionTrendChartDatum;
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
			<div className="text-white">{point.fullLabel}</div>
			<div className="grid gap-1">
				<div className="flex items-center justify-between gap-3">
					<span className="text-white/65">Sessions</span>
					<span className="font-mono tabular-nums text-white">
						{point.sessionCount.toLocaleString()}
					</span>
				</div>
				<div className="flex items-center justify-between gap-3">
					<span className="text-white/65">Tokens</span>
					<span className="font-mono tabular-nums text-white">
						{formatCompactWholeNumber(point.totalTokens)}
					</span>
				</div>
				<div className="flex items-center justify-between gap-3">
					<span className="text-white/65">Total duration</span>
					<span className="font-mono tabular-nums text-white">
						{formatDurationLabel(point.totalDurationMin)}
					</span>
				</div>
				<div className="flex items-center justify-between gap-3">
					<span className="text-white/65">Active developers</span>
					<span className="font-mono tabular-nums text-white">
						{point.activeUsers.toLocaleString()}
					</span>
				</div>
			</div>
		</div>
	);
}

function getAxisMax(data: DashboardSessionTrendChartDatum[]) {
	const maxSessions = Math.max(...data.map((point) => point.sessionCount), 0);

	if (maxSessions <= 3) {
		return 3;
	}

	if (maxSessions <= 6) {
		return 6;
	}

	if (maxSessions <= 12) {
		return 12;
	}

	const magnitude = 10 ** Math.floor(Math.log10(maxSessions));
	const normalizedValue = maxSessions / magnitude;
	const axisSteps = [1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
	const nextStep =
		axisSteps.find((candidate) => normalizedValue <= candidate) ?? 10;

	return nextStep * magnitude;
}

function formatAxisTickValue(value: number) {
	if (value >= 1_000) {
		return formatCompactWholeNumber(value);
	}

	return Math.round(value).toLocaleString();
}

function getBoundaryAwareTickInterval(total: number, targetTickCount: number) {
	if (total <= targetTickCount) {
		return 1;
	}

	return Math.max(1, Math.ceil((total - 1) / (targetTickCount - 1)));
}

function shouldRenderTickLabel(
	index: number,
	total: number,
	targetTickCount: number,
) {
	if (total <= targetTickCount) {
		return true;
	}

	const isBoundaryTick = index === 0 || index === total - 1;

	if (isBoundaryTick) {
		return true;
	}

	return index % getBoundaryAwareTickInterval(total, targetTickCount) === 0;
}

function getTickLabel(
	point: DashboardSessionTrendChartDatum | undefined,
	index: number,
	total: number,
) {
	if (!point) {
		return "";
	}

	const parsedDate = parseISO(point.id);

	if (Number.isNaN(parsedDate.getTime())) {
		return point.shortLabel;
	}

	switch (point.granularity) {
		case "hour": {
			const isMidnightTick = parsedDate.getHours() === 0;
			const shouldRender =
				isMidnightTick || shouldRenderTickLabel(index, total, 6);

			if (!shouldRender) {
				return "";
			}

			return isMidnightTick
				? format(parsedDate, "MMM d")
				: format(parsedDate, "ha");
		}
		case "day":
			if (total <= 7) {
				return format(parsedDate, "EEE d");
			}

			return shouldRenderTickLabel(index, total, 6)
				? format(parsedDate, "MMM d")
				: "";
		case "week":
			return shouldRenderTickLabel(index, total, 5)
				? format(parsedDate, "MMM d")
				: "";
		case "month":
			return shouldRenderTickLabel(index, total, 5)
				? format(parsedDate, total <= 6 ? "MMM yy" : "MMM")
				: "";
	}
}

export function DashboardSessionTrendChart({
	className,
	data,
}: {
	className?: string;
	data: DashboardSessionTrendChartDatum[];
}) {
	const axisMax = getAxisMax(data);

	if (data.length === 0 || data.every((entry) => entry.sessionCount === 0)) {
		return (
			<div
				className={cn(
					"flex h-[12.875rem] items-center justify-center px-6 text-center text-sm text-muted-foreground",
					className,
				)}
			>
				No session activity in the selected range.
			</div>
		);
	}

	return (
		<div className={cn("flex min-w-0 flex-1 pt-0 md:pt-4", className)}>
			<ChartContainer
				config={chartConfig}
				className="h-[12.875rem] w-full aspect-auto [&_.recharts-cartesian-grid-vertical_line]:stroke-transparent [&_.recharts-curve]:drop-shadow-none"
				initialDimension={{ width: 664, height: 206 }}
			>
				<BarChart
					data={data}
					barCategoryGap="2%"
					maxBarSize={56}
					margin={{ top: 8, right: 4, bottom: 8, left: 0 }}
				>
					<CartesianGrid
						stroke="color-mix(in srgb, var(--dashboardy-divider) 68%, transparent)"
						strokeDasharray="0"
						vertical={false}
					/>
					<XAxis
						dataKey="id"
						axisLine={false}
						minTickGap={24}
						padding="no-gap"
						tickFormatter={(_value, index) =>
							getTickLabel(data[index], index, data.length)
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
						orientation="right"
						allowDecimals={false}
						axisLine={false}
						domain={[0, axisMax]}
						tickCount={4}
						tickFormatter={(value) => formatAxisTickValue(Number(value))}
						tickLine={false}
						tickMargin={8}
						width={34}
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
							fill: "color-mix(in srgb, var(--dashboardy-divider) 18%, transparent)",
						}}
						wrapperStyle={{ pointerEvents: "none", zIndex: 20 }}
						content={<SessionTrendTooltip />}
					/>
					<Bar
						dataKey="sessionCount"
						name="Sessions"
						fill="var(--color-sessions)"
						fillOpacity={0.9}
						minPointSize={2}
						radius={[8, 8, 0, 0]}
						isAnimationActive={false}
					/>
				</BarChart>
			</ChartContainer>
		</div>
	);
}
