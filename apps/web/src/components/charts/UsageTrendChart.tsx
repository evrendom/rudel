import type { UsageTrendData } from "@rudel/api-routes";
import { useState } from "react";
import {
	CartesianGrid,
	Legend,
	Line,
	LineChart,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import { useChartTheme } from "@/hooks/useChartTheme";
import { useAnalyticsTracking } from "@/hooks/useDashboardAnalytics";
import { ChartLegend } from "./ChartLegend";
import { ChartTooltip } from "./ChartTooltip";

interface UsageTrendChartProps {
	data: UsageTrendData[];
	showRollingAverage?: boolean;
}

type MetricPair = "sessions-tokens" | "users-hours";

const METRIC_PAIRS = {
	"sessions-tokens": {
		label: "Sessions & Tokens",
		left: {
			key: "sessions",
			label: "Sessions",
			color: "#3b82f6",
		},
		right: {
			key: "total_tokens",
			label: "Total Tokens",
			color: "#f59e0b",
		},
	},
	"users-hours": {
		label: "Developers & Hours",
		left: {
			key: "active_users",
			label: "Active Users",
			color: "#10b981",
		},
		right: {
			key: "total_hours",
			label: "Hours Spent",
			color: "#8b5cf6",
		},
	},
};

function formatCompactNumber(num: number): string {
	if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
	if (num >= 1_000) return `${(num / 1_000).toFixed(2)}K`;
	return num.toFixed(0);
}

export function UsageTrendChart({
	data,
	showRollingAverage: _showRollingAverage = false,
}: UsageTrendChartProps) {
	const { gridStroke } = useChartTheme();
	const { trackFilterChange } = useAnalyticsTracking();
	const [selectedPair, setSelectedPair] =
		useState<MetricPair>("sessions-tokens");
	const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(new Set());
	const toggleSeries = (key: string) =>
		setHiddenSeries((prev) => {
			const next = new Set(prev);
			next.has(key) ? next.delete(key) : next.add(key);
			return next;
		});

	const currentPair = METRIC_PAIRS[selectedPair];

	const chartData = data.map((item) => ({
		...item,
		date: new Date(item.date).toLocaleDateString("en-US", {
			month: "short",
			day: "numeric",
		}),
	}));

	const formatValue = (v: number, name: string): string => {
		if (name === "Hours Spent") return `${v.toFixed(1)}h`;
		if (name === "Total Tokens") return formatCompactNumber(v);
		return v.toLocaleString();
	};

	return (
		<div className="space-y-4">
			{/* Metric Pair Toggle Buttons */}
			<div className="flex flex-wrap gap-2">
				{Object.entries(METRIC_PAIRS).map(([key, pair]) => {
					const isSelected = selectedPair === key;
					return (
						<button
							type="button"
							key={key}
							onClick={() => {
								trackFilterChange({
									filterName: "usage_trend_metric_pair",
									filterCategory: "metric",
									changeAction: "set",
									sourceComponent: "usage_trend_chart",
									valueKey: key,
									affectedScope: "chart",
								});
								setSelectedPair(key as MetricPair);
							}}
							className={`
								flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
								transition-all duration-200
								${
									isSelected
										? "bg-accent-light text-accent-text border-2 border-accent"
										: "bg-surface text-muted border-2 border-transparent hover:bg-hover"
								}
							`}
						>
							<div className="flex items-center gap-1.5">
								<span>{pair.left.label}</span>
								<div
									className="w-3 h-3 rounded-full"
									style={{
										backgroundColor: isSelected ? pair.left.color : "#d1d5db",
									}}
								/>
							</div>
							<span className="mx-1">&</span>
							<div className="flex items-center gap-1.5">
								<span>{pair.right.label}</span>
								<div
									className="w-3 h-3 rounded-full"
									style={{
										backgroundColor: isSelected ? pair.right.color : "#d1d5db",
									}}
								/>
							</div>
						</button>
					);
				})}
			</div>

			{/* Chart */}
			<ResponsiveContainer width="100%" height={400}>
				<LineChart
					data={chartData}
					margin={{ top: 5, right: 0, left: 20, bottom: 5 }}
				>
					<CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
					<XAxis
						dataKey="date"
						tick={{ fontSize: 12 }}
						angle={-45}
						textAnchor="end"
						height={80}
						tickMargin={8}
					/>
					<YAxis
						yAxisId="left"
						orientation="left"
						stroke={currentPair.left.color}
						tick={{ fontSize: 12 }}
						tickFormatter={formatCompactNumber}
					/>
					<YAxis
						yAxisId="right"
						orientation="right"
						stroke={currentPair.right.color}
						tick={{ fontSize: 12 }}
						tickFormatter={formatCompactNumber}
					/>
					<Tooltip
						content={(props) => (
							<ChartTooltip
								{...props}
								valueFormatter={formatValue}
								showTotal={false}
							/>
						)}
					/>
					<Legend
						layout="vertical"
						align="right"
						verticalAlign="top"
						width={140}
						content={({ payload }) => (
							<ChartLegend
								payload={payload}
								hiddenSeries={hiddenSeries}
								onToggle={toggleSeries}
							/>
						)}
					/>
					<Line
						yAxisId="left"
						type="monotone"
						dataKey={currentPair.left.key}
						stroke={currentPair.left.color}
						strokeWidth={2}
						dot={{ r: 4 }}
						activeDot={{ r: 6 }}
						name={currentPair.left.label}
						hide={hiddenSeries.has(currentPair.left.label)}
					/>
					<Line
						yAxisId="right"
						type="monotone"
						dataKey={currentPair.right.key}
						stroke={currentPair.right.color}
						strokeWidth={2}
						dot={{ r: 4 }}
						activeDot={{ r: 6 }}
						name={currentPair.right.label}
						hide={hiddenSeries.has(currentPair.right.label)}
					/>
				</LineChart>
			</ResponsiveContainer>
		</div>
	);
}
