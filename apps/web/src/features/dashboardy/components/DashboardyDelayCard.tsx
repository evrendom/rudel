import type { ReactNode } from "react";
import {
	Bar,
	BarChart,
	CartesianGrid,
	Cell,
	Rectangle,
	ReferenceLine,
	XAxis,
	YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/ui/card";
import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@/app/ui/chart";
import type {
	DashboardyAirportSnapshot,
	DashboardyDelayBucket,
	DashboardyDelayTone,
} from "@/features/dashboardy/data/dashboardy-static-data";
import { cn } from "@/lib/utils";

const delayChartConfig = {
	late: {
		label: "Delayed",
		color: "#f79009",
	},
	onTime: {
		label: "On time",
		color: "#039855",
	},
	canceled: {
		label: "Canceled",
		color: "#f04438",
	},
	diverted: {
		label: "Diverted",
		color: "#98a2b3",
	},
} satisfies ChartConfig;

type DelayPoint =
	DashboardyAirportSnapshot["delayCards"][number]["chart"]["points"][number];

function getToneClassName(tone: DashboardyDelayTone) {
	switch (tone) {
		case "onTime":
			return "dashboardy-delay-tone--ontime";
		case "late":
			return "dashboardy-delay-tone--late";
		case "diverted":
			return "dashboardy-delay-tone--diverted";
		default:
			return "dashboardy-delay-tone--canceled";
	}
}

function getBucketToneClassName(label: string) {
	const normalizedLabel = label.toLowerCase();

	if (normalizedLabel.includes("on time")) {
		return "dashboardy-delay-tone dashboardy-delay-tone--ontime";
	}

	if (normalizedLabel.includes("delayed")) {
		return "dashboardy-delay-tone dashboardy-delay-tone--late";
	}

	if (normalizedLabel.includes("diverted")) {
		return "dashboardy-delay-tone dashboardy-delay-tone--diverted";
	}

	return "dashboardy-delay-tone dashboardy-delay-tone--canceled";
}

function getChartFill(tone: DashboardyDelayTone) {
	switch (tone) {
		case "onTime":
			return "var(--color-onTime)";
		case "late":
			return "var(--color-late)";
		case "diverted":
			return "var(--color-diverted)";
		default:
			return "var(--color-canceled)";
	}
}

function getBucketKey(label: string) {
	const normalizedLabel = label.toLowerCase();

	if (normalizedLabel.includes("on time")) {
		return "onTime";
	}

	if (normalizedLabel.includes("delayed")) {
		return "late";
	}

	if (normalizedLabel.includes("diverted")) {
		return "diverted";
	}

	return "canceled";
}

function getProgressBuckets(buckets: DashboardyDelayBucket[]) {
	const order = ["onTime", "late", "canceled", "diverted"] as const;
	const bucketMap = new Map(
		buckets.map((bucket) => [getBucketKey(bucket.label), bucket] as const),
	);

	return order.map((key) => {
		const bucket = bucketMap.get(key);

		if (bucket) {
			return bucket;
		}

		return {
			label:
				key === "onTime"
					? "On time"
					: key === "late"
						? "Delayed"
						: key === "diverted"
							? "Diverted"
							: "Canceled",
			percentage: 0,
			count: 0,
		} satisfies DashboardyDelayBucket;
	});
}

function BucketStat({ bucket }: { bucket: DashboardyDelayBucket }) {
	return (
		<div className="dashboardy-delay-stat">
			<div className="flex items-center gap-1">
				<span className={cn(getBucketToneClassName(bucket.label))} />
				<p className="dashboardy-delay-stat-label">{bucket.label}</p>
			</div>
			<div className="flex flex-col">
				<p className="dashboardy-delay-stat-percentage">{bucket.percentage}%</p>
				<p className="dashboardy-delay-stat-count">{bucket.count}</p>
			</div>
		</div>
	);
}

function DelayChart({
	chart,
}: {
	chart: DashboardyAirportSnapshot["delayCards"][number]["chart"];
}) {
	const visibleLabels = chart.points.filter((point) => point.axisLabel);

	return (
		<div className="dashboardy-delay-chart-shell">
			<ChartContainer
				config={delayChartConfig}
				className="dashboardy-delay-chart h-full min-h-[240px] w-full aspect-auto"
			>
				<BarChart
					accessibilityLayer
					data={chart.points}
					margin={{ top: 40, right: 62, left: 18, bottom: 30 }}
				>
					<CartesianGrid
						strokeDasharray="3 3"
						vertical={false}
						stroke="var(--dashboardy-divider)"
					/>
					<XAxis
						dataKey="key"
						axisLine={{ stroke: "var(--dashboardy-divider)" }}
						tickLine={false}
						interval={0}
						tickMargin={14}
						tick={(props) => {
							const point = chart.points.find(
								(item) => item.key === String(props.payload?.value),
							);

							if (!point?.axisLabel) {
								return null;
							}

							const isFirstLabel = visibleLabels[0]?.key === point.key;
							const isLastLabel =
								visibleLabels[visibleLabels.length - 1]?.key === point.key;
							const x = Number(props.x);
							const y = Number(props.y);

							return (
								<text
									x={isFirstLabel ? x - 12 : isLastLabel ? x + 12 : x}
									y={y}
									textAnchor={
										isFirstLabel ? "start" : isLastLabel ? "end" : "middle"
									}
									fontSize="12"
									fontWeight={point.axisLabel === "Now" ? 600 : 400}
									fill={
										point.axisLabel === "Now"
											? "var(--dashboardy-heading)"
											: "var(--dashboardy-subtle)"
									}
								>
									{point.axisLabel}
								</text>
							);
						}}
					/>
					<YAxis
						orientation="right"
						allowDecimals={false}
						domain={[0, chart.maxMinutes]}
						ticks={[0, 20, 40, 60]}
						axisLine={false}
						tickLine={false}
						width={42}
						tick={(props) => {
							const x = Number(props.x);
							const y = Number(props.y);

							return (
								<text
									x={x + 6}
									y={y}
									textAnchor="start"
									fontSize="12"
									fill="var(--dashboardy-subtle)"
								>
									<tspan x={x + 6} dy="0.355em">
										{props.payload?.value === 60
											? "1h"
											: `${props.payload?.value ?? 0}m`}
									</tspan>
								</text>
							);
						}}
						tickFormatter={(value) => (value === 60 ? "1h" : `${value}m`)}
					/>
					<ChartTooltip
						cursor={false}
						content={
							<ChartTooltipContent
								hideIndicator
								className="dashboardy-delay-tooltip border-transparent bg-black text-white ring-0"
								labelClassName="text-white/90"
								labelFormatter={(_, payload) => {
									const point = payload?.[0]?.payload as DelayPoint | undefined;
									return point ? `Delay time at ${point.key}` : "";
								}}
								formatter={(value, _name, item) => {
									const point = item.payload as DelayPoint;
									const numericValue =
										typeof value === "number"
											? value
											: Number.parseFloat(String(value));

									return (
										<div className="flex w-full items-center justify-between gap-3">
											<div className="flex items-center gap-2">
												<span
													className={cn(
														"dashboardy-delay-tone",
														"dashboardy-delay-tooltip-indicator",
														getToneClassName(point.tone),
													)}
												/>
												<span className="text-white/75">
													{point.forecast ? "Forecast delay" : "Observed delay"}
												</span>
											</div>
											<span className="font-mono font-medium tabular-nums text-white">
												{Number.isFinite(numericValue)
													? `${numericValue}m`
													: String(value)}
											</span>
										</div>
									);
								}}
							/>
						}
					/>
					<ReferenceLine
						x={chart.nowKey}
						stroke="var(--dashboardy-divider)"
						ifOverflow="extendDomain"
						label={(props: { viewBox?: { x?: number; y?: number } }) => {
							const markerX = Number(props.viewBox?.x ?? 0) - 23;
							const markerY = Number(props.viewBox?.y ?? 0) - 11;

							return (
								<g>
									<circle
										cx={markerX}
										cy={markerY}
										r={8}
										fill="#f79009"
										opacity="0.15"
									/>
									<circle cx={markerX} cy={markerY} r={4} fill="#f79009" />
									<text
										x={markerX + 12}
										y={markerY + 5}
										textAnchor="start"
										fill="#f79009"
										fontSize="15"
										fontWeight="600"
									>
										{chart.nowValueLabel}
									</text>
								</g>
							);
						}}
					/>
					<Bar
						dataKey="minutes"
						radius={[4, 4, 0, 0]}
						barSize={10}
						isAnimationActive={false}
						activeBar={(props) => {
							const point = props.payload as DelayPoint;

							return (
								<Rectangle
									{...props}
									radius={[4, 4, 0, 0]}
									fill={getChartFill(point.tone)}
									fillOpacity={point.forecast ? 0.72 : 1}
									stroke="rgba(255, 255, 255, 0.9)"
									strokeWidth={1.5}
									style={{
										filter: "drop-shadow(0 2px 8px rgba(15, 23, 42, 0.14))",
									}}
								/>
							);
						}}
					>
						{chart.points.map((point) => (
							<Cell
								key={point.key}
								fill={getChartFill(point.tone)}
								fillOpacity={point.forecast ? 0.4 : 1}
							/>
						))}
					</Bar>
				</BarChart>
			</ChartContainer>
		</div>
	);
}

export function DashboardyDelayCard({
	card,
	icon,
}: {
	card: DashboardyAirportSnapshot["delayCards"][number];
	icon: ReactNode;
}) {
	const progressBuckets = getProgressBuckets(card.buckets);

	return (
		<Card
			size="sm"
			className="dashboardy-delay-card overflow-hidden rounded-[1.4rem] py-0 shadow-none"
		>
			<CardHeader className="flex flex-row items-center gap-2.5 px-6 pb-5 pt-6 sm:px-7 sm:pt-7">
				<span className="dashboardy-delay-header-icon">{icon}</span>
				<CardTitle className="dashboardy-section-title text-xl">
					{card.title}
				</CardTitle>
			</CardHeader>
			<CardContent className="px-6 pb-6 sm:px-7 sm:pb-7">
				<div
					className={cn(
						"dashboardy-delay-stats",
						card.buckets.length === 3
							? "grid-cols-3"
							: "grid-cols-2 sm:grid-cols-4",
					)}
				>
					{card.buckets.map((bucket) => (
						<BucketStat key={bucket.label} bucket={bucket} />
					))}
				</div>

				<div className="dashboardy-delay-progress" aria-hidden="true">
					{progressBuckets.map((bucket) => (
						<span
							key={bucket.label}
							className={cn(
								"dashboardy-delay-progress-segment",
								getBucketToneClassName(bucket.label),
							)}
							style={{ width: `${bucket.percentage}%` }}
						/>
					))}
				</div>

				<div className="pt-7">
					<p className="dashboardy-delay-chart-heading">{card.footerLabel}</p>
					<DelayChart chart={card.chart} />
				</div>
			</CardContent>
		</Card>
	);
}
