import type { ProjectTrendDataPoint } from "@rudel/api-routes";
import { Activity, Clock, TrendingUp, Zap } from "lucide-react";
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
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { useChartTheme } from "@/hooks/useChartTheme";
import { useUiControlTracking } from "@/hooks/useDashboardAnalytics";
import { ChartLegend } from "./ChartLegend";
import { ChartTooltip } from "./ChartTooltip";

const MAX_SERIES = 14;
const OTHER_COLOR = "#9ca3af";

interface ProjectTrendChartProps {
	data: ProjectTrendDataPoint[];
}

type MetricType = "sessions" | "hours" | "tokens" | "success_rate";

const METRICS = {
	sessions: {
		key: "sessions",
		label: "Sessions",
		icon: Activity,
		formatter: (value: number) => value.toLocaleString(),
	},
	hours: {
		key: "total_hours",
		label: "Hours",
		icon: Clock,
		formatter: (value: number) => `${value.toFixed(1)}h`,
	},
	tokens: {
		key: "total_tokens",
		label: "Tokens",
		icon: Zap,
		formatter: (value: number) => {
			if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
			if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
			return value.toFixed(0);
		},
	},
	success_rate: {
		key: "avg_success_rate",
		label: "Success Rate",
		icon: TrendingUp,
		formatter: (value: number) => `${value.toFixed(0)}%`,
		tooltip:
			"Average session quality score (0–100): rewards git commits, high output ratio, and skill usage; deducts for errors and abandoned sessions.",
	},
};

const PROJECT_COLORS = [
	"#3b82f6",
	"#10b981",
	"#f59e0b",
	"#8b5cf6",
	"#ef4444",
	"#ec4899",
	"#14b8a6",
	"#f97316",
	"#6366f1",
	"#84cc16",
	"#06b6d4",
	"#a855f7",
	"#f43f5e",
	"#0ea5e9",
];

export function ProjectTrendChart({ data }: ProjectTrendChartProps) {
	const { gridStroke, axisStroke } = useChartTheme();
	const { trackUiControl } = useUiControlTracking();
	const [selectedMetric, setSelectedMetric] = useState<MetricType>("sessions");
	const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(new Set());
	const toggleSeries = (key: string) =>
		setHiddenSeries((prev) => {
			const next = new Set(prev);
			next.has(key) ? next.delete(key) : next.add(key);
			return next;
		});

	const currentMetric = METRICS[selectedMetric];

	// Rank projects by total sessions (stable ordering across metric changes)
	const { topProjects, topProjectsSet, hasOther } = useMemo(() => {
		const projectTotals = new Map<string, number>();
		for (const d of data) {
			projectTotals.set(
				d.project_name,
				(projectTotals.get(d.project_name) ?? 0) + d.sessions,
			);
		}
		const sorted = Array.from(projectTotals.entries()).sort(
			(a, b) => b[1] - a[1],
		);
		const top = sorted.slice(0, MAX_SERIES).map(([p]) => p);
		return {
			topProjects: top,
			topProjectsSet: new Set(top),
			hasOther: sorted.length > MAX_SERIES,
		};
	}, [data]);

	const colorMap = useMemo(() => {
		const map = new Map<string, string>();
		for (let i = 0; i < topProjects.length; i++) {
			map.set(topProjects[i], PROJECT_COLORS[i % PROJECT_COLORS.length]);
		}
		map.set("Other", OTHER_COLOR);
		return map;
	}, [topProjects]);

	const { chartData, seriesList } = useMemo(() => {
		// Build full date range from all data
		const existingDates = Array.from(new Set(data.map((d) => d.date))).sort();
		const allDates: string[] = [];
		if (existingDates.length > 0) {
			const minDate = new Date(existingDates[0]);
			const maxDate = new Date(existingDates[existingDates.length - 1]);
			for (
				let d = new Date(minDate);
				d <= maxDate;
				d.setDate(d.getDate() + 1)
			) {
				allDates.push(d.toISOString().split("T")[0]);
			}
		}

		// "Other" only applies to summable metrics, not averages
		const showOther = hasOther && selectedMetric !== "success_rate";
		const seriesList = showOther ? [...topProjects, "Other"] : topProjects;

		const chartData = allDates.map((date) => {
			const dateObj: Record<string, string | number> = {
				date,
				displayDate: new Date(date).toLocaleDateString("en-US", {
					month: "short",
					day: "numeric",
				}),
			};

			for (const projectPath of topProjects) {
				const dp = data.find(
					(d) => d.date === date && d.project_name === projectPath,
				);
				dateObj[projectPath] = dp
					? (dp[currentMetric.key as keyof ProjectTrendDataPoint] as number)
					: 0;
			}

			if (showOther) {
				dateObj.Other = data
					.filter((d) => d.date === date && !topProjectsSet.has(d.project_name))
					.reduce(
						(sum, d) =>
							sum +
							((d[
								currentMetric.key as keyof ProjectTrendDataPoint
							] as number) ?? 0),
						0,
					);
			}

			return dateObj;
		});

		return { chartData, seriesList };
	}, [
		data,
		topProjects,
		topProjectsSet,
		hasOther,
		selectedMetric,
		currentMetric,
	]);

	const sortedLegendPayload = useMemo(() => {
		const totals = new Map<string, number>();
		for (const row of chartData) {
			for (const key of seriesList) {
				totals.set(key, (totals.get(key) ?? 0) + ((row[key] as number) ?? 0));
			}
		}
		return [...seriesList]
			.sort((a, b) => (totals.get(b) ?? 0) - (totals.get(a) ?? 0))
			.map((key) => ({
				value: key,
				color: colorMap.get(key) ?? OTHER_COLOR,
				type: "square" as const,
			}));
	}, [chartData, seriesList, colorMap]);

	const formatProjectName = (name: string) => name;

	return (
		<div className="space-y-4">
			<div className="flex flex-wrap gap-2">
				{Object.entries(METRICS).map(([key, metric]) => {
					const isSelected = selectedMetric === key;
					const Icon = metric.icon;
					return (
						<button
							type="button"
							key={key}
							onClick={() => {
								trackUiControl({
									controlName: "project_trend_metric",
									controlType: "button",
									interactionType: "change",
									value: key,
								});
								setSelectedMetric(key as MetricType);
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
							<Icon className="w-4 h-4" />
							<span>{metric.label}</span>
							{"tooltip" in metric && metric.tooltip && (
								// biome-ignore lint/a11y/noStaticElementInteractions: tooltip stop-propagation wrapper
								// biome-ignore lint/a11y/useKeyWithClickEvents: tooltip stop-propagation wrapper
								<span onClick={(e) => e.stopPropagation()}>
									<InfoTooltip text={metric.tooltip as string} />
								</span>
							)}
						</button>
					);
				})}
			</div>

			<ResponsiveContainer width="100%" height={400}>
				{selectedMetric === "success_rate" ? (
					<LineChart
						data={chartData}
						margin={{ top: 10, right: 0, left: 0, bottom: 0 }}
					>
						<CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
						<XAxis
							dataKey="displayDate"
							stroke={axisStroke}
							style={{ fontSize: "12px" }}
							angle={-45}
							textAnchor="end"
							height={80}
							tickMargin={8}
						/>
						<YAxis
							stroke={axisStroke}
							style={{ fontSize: "12px" }}
							tickFormatter={currentMetric.formatter}
							domain={[0, 100]}
						/>
						<Tooltip
							content={(props) => (
								<ChartTooltip
									{...props}
									nameFormatter={formatProjectName}
									valueFormatter={(v) => currentMetric.formatter(v)}
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
									formatter={formatProjectName}
									hiddenSeries={hiddenSeries}
									onToggle={toggleSeries}
								/>
							)}
						/>
						{topProjects.map((projectPath) => (
							<Line
								key={projectPath}
								type="monotone"
								dataKey={projectPath}
								stroke={colorMap.get(projectPath) ?? OTHER_COLOR}
								strokeWidth={2}
								dot={{ r: 3 }}
								activeDot={{ r: 5 }}
								connectNulls
								hide={hiddenSeries.has(projectPath)}
							/>
						))}
					</LineChart>
				) : (
					<BarChart
						data={chartData}
						margin={{ top: 10, right: 0, left: 0, bottom: 0 }}
					>
						<CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
						<XAxis
							dataKey="displayDate"
							stroke={axisStroke}
							style={{ fontSize: "12px" }}
							angle={-45}
							textAnchor="end"
							height={80}
							tickMargin={8}
						/>
						<YAxis
							stroke={axisStroke}
							style={{ fontSize: "12px" }}
							tickFormatter={currentMetric.formatter}
						/>
						<Tooltip
							content={(props) => (
								<ChartTooltip
									{...props}
									nameFormatter={formatProjectName}
									valueFormatter={(v) => currentMetric.formatter(v)}
									showTotal
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
									formatter={formatProjectName}
									hiddenSeries={hiddenSeries}
									onToggle={toggleSeries}
								/>
							)}
						/>
						{seriesList.map((projectPath) => (
							<Bar
								key={projectPath}
								dataKey={projectPath}
								stackId="1"
								hide={hiddenSeries.has(projectPath)}
								fill={colorMap.get(projectPath) ?? OTHER_COLOR}
							/>
						))}
					</BarChart>
				)}
			</ResponsiveContainer>
		</div>
	);
}
