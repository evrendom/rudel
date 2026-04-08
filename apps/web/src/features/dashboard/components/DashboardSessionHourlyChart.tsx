"use client";

import type { SessionHourlyActivityDataPoint } from "@rudel/api-routes";
import { useMemo } from "react";
import { Bar, BarChart, XAxis, YAxis } from "recharts";
import { type ChartConfig, ChartContainer, ChartTooltip } from "@/app/ui/chart";
import { Skeleton } from "@/app/ui/skeleton";
import { cn } from "@/lib/utils";

const hourlyChartConfig = {
	sessions: {
		label: "Sessions",
		color: "#1949A9",
	},
} satisfies ChartConfig;

const VISIBLE_HOUR_TICKS = new Set([0, 6, 12, 18, 23]);

function getAxisMax(data: SessionHourlyActivityDataPoint[]) {
	const maxSessions = Math.max(...data.map((point) => point.sessions), 0);

	return Math.max(4, Math.ceil(maxSessions / 4) * 4);
}

function HourlySessionsTooltip({
	active,
	payload,
}: {
	active?: boolean;
	payload?: Array<{
		payload: SessionHourlyActivityDataPoint;
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

	return (
		<div className="flex min-w-32 flex-col gap-1 rounded-md bg-black px-2.5 py-1.5 text-[11px] font-medium leading-tight text-white/90 shadow-lg">
			<p className="text-white">{point.label}</p>
			<div className="flex items-center justify-between gap-3">
				<span className="text-white/65">Sessions</span>
				<span className="tabular-nums text-white">{point.sessions}</span>
			</div>
		</div>
	);
}

function DashboardSessionHourlyChartFallback() {
	return (
		<div className="grid h-full gap-4 px-4 pb-6 pt-3">
			<div className="flex items-end gap-2">
				{Array.from({ length: 12 }, (_, index) => (
					<Skeleton
						// biome-ignore lint/suspicious/noArrayIndexKey: static placeholder bars
						key={index}
						className="min-w-0 flex-1 rounded-t-xl bg-muted/70"
						style={{ height: `${56 + (index % 5) * 18}px` }}
					/>
				))}
			</div>
			<div className="flex justify-between gap-2">
				{["12am", "6am", "12pm", "6pm", "11pm"].map((tick) => (
					<Skeleton key={tick} className="h-3 w-10 rounded-full bg-muted/60" />
				))}
			</div>
		</div>
	);
}

export function DashboardSessionHourlyChart({
	className,
	data,
	isLoading = false,
}: {
	className?: string;
	data: SessionHourlyActivityDataPoint[] | undefined;
	isLoading?: boolean;
}) {
	const resolvedData = data ?? [];
	const axisMax = useMemo(() => getAxisMax(resolvedData), [resolvedData]);
	const axisTicks = useMemo(
		() =>
			Array.from(
				{ length: Math.floor(axisMax / 4) + 1 },
				(_, index) => index * 4,
			),
		[axisMax],
	);
	const hasSessions = resolvedData.some((point) => point.sessions > 0);

	return (
		<div className={cn("flex min-w-0 flex-1 flex-col pt-0 md:pt-4", className)}>
			<div className="flex items-end justify-between gap-4 px-1 pb-3">
				<div className="grid gap-1">
					<p className="dashboardy-label">Hourly activity</p>
					<h2 className="dashboardy-section-title text-xl/7">
						When sessions tend to run
					</h2>
				</div>
				<p className="text-right text-sm/6 text-[color:var(--dashboardy-muted)]">
					Grouped in local time.
				</p>
			</div>
			<div className="rounded-[1.4rem] border border-[color:var(--dashboardy-border)] bg-[color:var(--dashboardy-subsurface)]">
				<div className="px-3 py-2 sm:px-4 sm:py-3">
					<div className="h-[18.5rem] sm:h-[20rem]">
						{isLoading ? (
							<DashboardSessionHourlyChartFallback />
						) : !hasSessions ? (
							<div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
								No session activity in the selected range.
							</div>
						) : (
							<ChartContainer
								config={hourlyChartConfig}
								className="h-full w-full aspect-auto"
								initialDimension={{ width: 664, height: 320 }}
							>
								<BarChart
									data={resolvedData}
									barCategoryGap={2}
									margin={{ top: 8, right: 18, bottom: 10, left: 0 }}
								>
									<XAxis
										dataKey="hour"
										height={22}
										axisLine={{
											stroke:
												"color-mix(in srgb, var(--dashboardy-muted) 40%, transparent)",
										}}
										tickFormatter={(value) => {
											const hour = Number(value);
											const point = resolvedData.find(
												(entry) => entry.hour === hour,
											);

											if (!VISIBLE_HOUR_TICKS.has(hour) || !point) {
												return "";
											}

											return point.label;
										}}
										tickLine={false}
										tickMargin={4}
										tick={{
											fontSize: 12,
											fontWeight: 500,
											fill: "var(--dashboardy-muted)",
											opacity: 0.42,
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
										width={28}
										tick={{
											fontSize: 12,
											fontWeight: 500,
											fill: "var(--dashboardy-muted)",
											opacity: 0.42,
										}}
									/>
									<ChartTooltip
										cursor={false}
										content={<HourlySessionsTooltip />}
									/>
									<Bar
										dataKey="sessions"
										barSize={12}
										fill="var(--color-sessions)"
										radius={[4, 4, 0, 0]}
										isAnimationActive={false}
									/>
								</BarChart>
							</ChartContainer>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
