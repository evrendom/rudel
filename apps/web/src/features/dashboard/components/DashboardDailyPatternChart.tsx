"use client";

import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from "recharts";
import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@/app/ui/chart";
import type { DashboardDailyPatternPoint } from "@/features/dashboard/data/dashboard-static-data";

const chartConfig = {
	commits: {
		label: "Commits",
		color: "var(--chart-5)",
	},
	sessions: {
		label: "Sessions",
		color: "var(--chart-2)",
	},
} satisfies ChartConfig;

export function DashboardDailyPatternChart({
	data,
}: {
	data: DashboardDailyPatternPoint[];
}) {
	return (
		<ChartContainer
			config={chartConfig}
			className="h-[18rem] w-full"
			initialDimension={{ width: 920, height: 288 }}
		>
			<BarChart
				data={data}
				barCategoryGap={18}
				margin={{ top: 8, right: 12, bottom: 8, left: 4 }}
			>
				<CartesianGrid vertical={false} />
				<XAxis
					dataKey="axisLabel"
					tickLine={false}
					axisLine={false}
					tickMargin={10}
				/>
				<YAxis tickLine={false} axisLine={false} width={30} />
				<ChartTooltip
					cursor={false}
					content={
						<ChartTooltipContent
							labelKey="axisLabel"
							formatter={(value, name, item) => (
								<>
									<div className="flex flex-1 justify-between gap-4">
										<span className="text-muted-foreground">{name}</span>
										<span className="font-mono font-medium tabular-nums text-foreground">
											{item.payload?.commits == null &&
											item.payload?.sessions == null
												? "—"
												: typeof value === "number"
													? value.toLocaleString()
													: String(value)}
										</span>
									</div>
								</>
							)}
						/>
					}
				/>
				<Bar dataKey="sessions" radius={[8, 8, 0, 0]}>
					{data.map((point) => (
						<Cell
							key={`sessions-${point.date}`}
							fill={
								point.sessions == null
									? "color-mix(in srgb, var(--muted) 70%, white)"
									: "var(--color-sessions)"
							}
							fillOpacity={point.sessions == null ? 0.45 : 1}
						/>
					))}
				</Bar>
				<Bar dataKey="commits" radius={[8, 8, 0, 0]}>
					{data.map((point) => (
						<Cell
							key={`commits-${point.date}`}
							fill={
								point.commits == null
									? "color-mix(in srgb, var(--muted-foreground) 40%, white)"
									: "var(--color-commits)"
							}
							fillOpacity={point.commits == null ? 0.35 : 1}
						/>
					))}
				</Bar>
			</BarChart>
		</ChartContainer>
	);
}
