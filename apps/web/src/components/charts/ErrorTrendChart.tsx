import type { ErrorTrendDataPoint } from "@rudel/api-routes";
import { useMemo, useState } from "react";
import {
	Bar,
	BarChart,
	CartesianGrid,
	Legend,
	Line,
	LineChart,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useChartTheme } from "@/hooks/useChartTheme";
import { useAnalyticsTracking } from "@/hooks/useDashboardAnalytics";
import { ChartLegend } from "./ChartLegend";
import { ChartTooltip } from "./ChartTooltip";

const MAX_SERIES = 14;
const OTHER_COLOR = "#9ca3af";

interface ErrorTrendChartProps {
	data: ErrorTrendDataPoint[];
	metric:
		| "avg_errors_per_interaction"
		| "avg_errors_per_session"
		| "total_errors";
	splitBy: "project_path" | "user_id" | "model";
	onMetricChange: (
		metric:
			| "avg_errors_per_interaction"
			| "avg_errors_per_session"
			| "total_errors",
	) => void;
	onSplitByChange: (splitBy: "project_path" | "user_id" | "model") => void;
	userMap?: Record<string, string>;
}

const COLORS = [
	"#ef4444",
	"#f59e0b",
	"#10b981",
	"#3b82f6",
	"#8b5cf6",
	"#ec4899",
	"#06b6d4",
	"#14b8a6",
	"#f97316",
	"#6366f1",
	"#84cc16",
	"#a855f7",
	"#f43f5e",
	"#0ea5e9",
];

const METRIC_LABELS: Record<string, string> = {
	avg_errors_per_interaction: "Avg Errors per Interaction",
	avg_errors_per_session: "Avg Errors per Session",
	total_errors: "Total Errors",
};

const SPLIT_LABELS: Record<string, string> = {
	project_path: "by Project",
	user_id: "by Developer",
	model: "by Model",
};

export function ErrorTrendChart({
	data,
	metric,
	splitBy,
	onMetricChange,
	onSplitByChange,
	userMap,
}: ErrorTrendChartProps) {
	const { gridStroke } = useChartTheme();
	const { trackFilterChange } = useAnalyticsTracking();
	const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(new Set());
	const toggleSeries = (key: string) =>
		setHiddenSeries((prev) => {
			const next = new Set(prev);
			next.has(key) ? next.delete(key) : next.add(key);
			return next;
		});

	const stableColorOrder = useMemo(() => {
		if (data.length === 0) return [];
		const totals = new Map<string, number>();
		for (const item of data) {
			totals.set(
				item.dimension,
				(totals.get(item.dimension) ?? 0) + item.total_errors,
			);
		}
		return [...totals.entries()]
			.sort((a, b) => b[1] - a[1])
			.slice(0, MAX_SERIES)
			.map(([k]) => k);
	}, [data]);

	const colorMap = useMemo(() => {
		const map = new Map<string, string>();
		for (let i = 0; i < stableColorOrder.length; i++) {
			map.set(stableColorOrder[i], COLORS[i % COLORS.length]);
		}
		map.set("Other", OTHER_COLOR);
		return map;
	}, [stableColorOrder]);

	const { seriesKeys, chartData } = useMemo(() => {
		if (data.length === 0) return { seriesKeys: [], chartData: [] };

		// Compute totals per dimension to rank and cap at MAX_SERIES
		const dimTotals = new Map<string, number>();
		for (const item of data) {
			dimTotals.set(
				item.dimension,
				(dimTotals.get(item.dimension) ?? 0) + ((item[metric] as number) ?? 0),
			);
		}

		const sortedDims = Array.from(dimTotals.entries()).sort(
			(a, b) => b[1] - a[1],
		);
		const topDims = sortedDims.slice(0, MAX_SERIES).map(([k]) => k);
		const topDimsSet = new Set(topDims);
		// Only add "Other" for total_errors (summable); avg metrics are not meaningful to sum
		const hasOther =
			metric === "total_errors" && sortedDims.length > MAX_SERIES;
		const seriesKeys = hasOther ? [...topDims, "Other"] : topDims;

		// Build full date range
		const allDates = Array.from(new Set(data.map((item) => item.date))).sort();
		const minDate = new Date(allDates[0]);
		const maxDate = new Date(allDates[allDates.length - 1]);
		const dateRange: string[] = [];
		for (let d = new Date(minDate); d <= maxDate; d.setDate(d.getDate() + 1)) {
			dateRange.push(d.toISOString().split("T")[0]);
		}

		const dateMap = new Map<string, Record<string, unknown>>();
		for (const dateKey of dateRange) {
			const dateData: Record<string, unknown> = {
				date: dateKey,
				displayDate: new Date(dateKey).toLocaleDateString("en-US", {
					month: "short",
					day: "numeric",
				}),
			};
			for (const key of seriesKeys) {
				dateData[key] = 0;
			}
			dateMap.set(dateKey, dateData);
		}

		for (const item of data) {
			const dateData = dateMap.get(item.date);
			if (!dateData) continue;
			if (topDimsSet.has(item.dimension)) {
				dateData[item.dimension] = item[metric];
			} else if (hasOther) {
				dateData.Other =
					((dateData.Other as number) ?? 0) + ((item[metric] as number) ?? 0);
			}
		}

		return {
			seriesKeys,
			chartData: Array.from(dateMap.values()).sort((a, b) =>
				(a.date as string).localeCompare(b.date as string),
			),
		};
	}, [data, metric]);

	const sortedLegendPayload = useMemo(() => {
		return seriesKeys.map((key) => ({
			value: key,
			color: colorMap.get(key) ?? COLORS[0],
			type: "square" as const,
		}));
	}, [seriesKeys, colorMap]);

	const getDisplayName = (key: string): string => {
		if (key === "Other") return "Other";
		if (splitBy === "user_id" && userMap) {
			return userMap[key] || `${key.substring(0, 12)}...`;
		}
		if (splitBy === "project_path") {
			const parts = key.split("/");
			return parts[parts.length - 1] || key;
		}
		return key;
	};

	return (
		<div className="space-y-4">
			<div className="flex flex-wrap items-center justify-between gap-4">
				<div className="flex items-center gap-2">
					<label
						htmlFor="error-metric-select"
						className="text-sm font-medium text-muted"
					>
						Metric:
					</label>
					<Select
						value={metric}
						onValueChange={(v) => {
							trackFilterChange({
								filterName: "error_trend_metric",
								filterCategory: "metric",
								changeAction: "set",
								sourceComponent: "error_trend_chart",
								valueKey: v,
								affectedScope: "chart",
							});
							onMetricChange(v as typeof metric);
						}}
					>
						<SelectTrigger className="w-56">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{Object.entries(METRIC_LABELS).map(([key, label]) => (
								<SelectItem key={key} value={key}>
									{label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>

				<div className="flex items-center gap-2">
					<label
						htmlFor="error-split-select"
						className="text-sm font-medium text-muted"
					>
						Split:
					</label>
					<Select
						value={splitBy}
						onValueChange={(v) => {
							trackFilterChange({
								filterName: "error_trend_split",
								filterCategory: "dimension",
								changeAction: "set",
								sourceComponent: "error_trend_chart",
								valueKey: v,
								affectedScope: "chart",
							});
							onSplitByChange(v as typeof splitBy);
						}}
					>
						<SelectTrigger className="w-40">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{Object.entries(SPLIT_LABELS).map(([key, label]) => (
								<SelectItem key={key} value={key}>
									{label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			</div>

			<ResponsiveContainer width="100%" height={400}>
				{metric === "total_errors" ? (
					<BarChart
						data={chartData}
						margin={{ top: 10, right: 0, left: 0, bottom: 0 }}
					>
						<CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
						<XAxis
							dataKey="displayDate"
							tick={{ fontSize: 12 }}
							angle={-45}
							textAnchor="end"
							height={80}
							tickMargin={8}
						/>
						<YAxis tick={{ fontSize: 12 }} />
						<Tooltip
							content={(props) => (
								<ChartTooltip
									{...props}
									nameFormatter={getDisplayName}
									valueFormatter={(v) => v.toLocaleString()}
								/>
							)}
						/>
						<Legend
							layout="vertical"
							align="right"
							verticalAlign="top"
							width={160}
							content={() => (
								<ChartLegend
									payload={sortedLegendPayload}
									formatter={getDisplayName}
									hiddenSeries={hiddenSeries}
									onToggle={toggleSeries}
								/>
							)}
						/>
						{seriesKeys.map((key) => (
							<Bar
								key={key}
								dataKey={key}
								name={key}
								stackId="1"
								hide={hiddenSeries.has(key)}
								fill={colorMap.get(key) ?? COLORS[0]}
							/>
						))}
					</BarChart>
				) : (
					<LineChart
						data={chartData}
						margin={{ top: 10, right: 0, left: 0, bottom: 0 }}
					>
						<CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
						<XAxis
							dataKey="displayDate"
							tick={{ fontSize: 12 }}
							angle={-45}
							textAnchor="end"
							height={80}
							tickMargin={8}
						/>
						<YAxis tick={{ fontSize: 12 }} />
						<Tooltip
							content={(props) => (
								<ChartTooltip
									{...props}
									nameFormatter={getDisplayName}
									valueFormatter={(v) => v.toFixed(2)}
									showTotal={false}
								/>
							)}
						/>
						<Legend
							layout="vertical"
							align="right"
							verticalAlign="top"
							width={160}
							content={() => (
								<ChartLegend
									payload={sortedLegendPayload}
									formatter={getDisplayName}
									hiddenSeries={hiddenSeries}
									onToggle={toggleSeries}
								/>
							)}
						/>
						{seriesKeys.map((key) => (
							<Line
								key={key}
								type="monotone"
								dataKey={key}
								name={key}
								stroke={colorMap.get(key) ?? COLORS[0]}
								strokeWidth={2}
								dot={{ r: 4 }}
								activeDot={{ r: 6 }}
								connectNulls={false}
								hide={hiddenSeries.has(key)}
							/>
						))}
					</LineChart>
				)}
			</ResponsiveContainer>

			{seriesKeys.length === 0 && (
				<div className="text-center text-sm text-muted py-4">
					No error data available for the selected time period
				</div>
			)}
		</div>
	);
}
