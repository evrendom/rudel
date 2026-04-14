import type { DimensionAnalysisDataPoint } from "@rudel/api-routes";
import { memo, useMemo, useState } from "react";
import {
	Bar,
	BarChart,
	CartesianGrid,
	Legend,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import { useChartTheme } from "@/hooks/useChartTheme";
import { formatUsername } from "@/lib/format";
import { ChartLegend } from "./ChartLegend";
import { ChartTooltip } from "./ChartTooltip";

function formatCompactNumber(value: number): string {
	if (value >= 1000000) {
		return `${(value / 1000000).toFixed(1).replace(/\.0$/, "")}M`;
	}
	if (value >= 1000) {
		return `${(value / 1000).toFixed(1).replace(/\.0$/, "")}K`;
	}
	return value.toString();
}

function formatNumberWithCommas(value: number): string {
	return value.toLocaleString();
}

interface DimensionAnalysisChartProps {
	data: DimensionAnalysisDataPoint[];
	dimension: string;
	metric: string;
	split_by?: string;
	showPercentage?: boolean;
	userMap?: Record<string, string>;
}

const CHART_COLORS = [
	"#3b82f6",
	"#10b981",
	"#f59e0b",
	"#8b5cf6",
	"#ef4444",
	"#06b6d4",
	"#f97316",
	"#ec4899",
	"#14b8a6",
	"#6366f1",
];

function formatMetricLabel(metric: string): string {
	const labelMap: Record<string, string> = {
		session_count: "Session Count",
		avg_duration: "Avg Duration (min)",
		total_duration: "Total Duration (hours)",
		avg_interactions: "Avg Interactions",
		total_interactions: "Total Interactions",
		avg_response_time: "Avg Response Time (sec)",
		median_response_time: "Median Response Time (sec)",
		avg_tokens: "Avg Tokens",
		total_tokens: "Total Tokens",
		avg_success_score: "Avg Success Score",
		avg_errors: "Avg Errors",
		total_errors: "Total Errors",
	};
	return labelMap[metric] || metric;
}

function formatDimensionValue(
	value: string,
	dimension: string,
	userMap?: Record<string, string>,
): string {
	if (
		dimension === "has_commit" ||
		dimension === "used_plan_mode" ||
		dimension === "used_skills" ||
		dimension === "used_slash_commands" ||
		dimension === "used_subagents"
	) {
		return value === "1" ? "Yes" : "No";
	}

	if (dimension === "project_path") {
		const parts = value.split("/");
		return parts[parts.length - 1] || value;
	}

	if (dimension === "user_id") {
		return formatUsername(value, userMap);
	}

	return value;
}

export const DimensionAnalysisChart = memo(function DimensionAnalysisChart({
	data,
	dimension,
	metric,
	split_by,
	showPercentage = false,
	userMap,
}: DimensionAnalysisChartProps) {
	const { gridStroke, axisStroke } = useChartTheme();
	const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(new Set());
	const toggleSeries = (key: string) =>
		setHiddenSeries((prev) => {
			const next = new Set(prev);
			next.has(key) ? next.delete(key) : next.add(key);
			return next;
		});

	const { chartData, dataKeys } = useMemo(() => {
		if (!data || data.length === 0) {
			return { chartData: [], dataKeys: [] };
		}

		let chartData: Record<string, unknown>[] = [];
		let dataKeys: string[] = [];

		if (split_by && data[0].split_values) {
			const allSplitValues = new Set<string>();
			for (const item of data) {
				if (item.split_values) {
					for (const key of Object.keys(item.split_values)) {
						allSplitValues.add(key);
					}
				}
			}
			const rawSplitKeys = Array.from(allSplitValues);
			// Sort split keys by total raw value descending
			const splitKeyTotals = new Map<string, number>();
			for (const item of data) {
				for (const key of rawSplitKeys) {
					splitKeyTotals.set(
						key,
						(splitKeyTotals.get(key) ?? 0) + (item.split_values?.[key] || 0),
					);
				}
			}
			rawSplitKeys.sort(
				(a, b) => (splitKeyTotals.get(b) ?? 0) - (splitKeyTotals.get(a) ?? 0),
			);
			// Map raw split keys to display names (e.g. user IDs → names)
			const splitKeyDisplayMap: Record<string, string> = {};
			for (const key of rawSplitKeys) {
				splitKeyDisplayMap[key] = formatDimensionValue(key, split_by, userMap);
			}
			dataKeys = rawSplitKeys.map((key) => splitKeyDisplayMap[key]);

			chartData = data.map((item) => {
				const row: Record<string, unknown> = {
					name: formatDimensionValue(item.dimension_value, dimension, userMap),
					_fullName: item.dimension_value,
					_total: 0,
					_originalValues: {} as Record<string, number>,
				};
				const origValues = row._originalValues as Record<string, number>;
				let total = 0;
				for (const key of rawSplitKeys) {
					const displayKey = splitKeyDisplayMap[key];
					const val = item.split_values?.[key] || 0;
					origValues[displayKey] = val;
					total += val;
				}
				row._total = total;

				if (showPercentage && total > 0) {
					for (const key of rawSplitKeys) {
						const displayKey = splitKeyDisplayMap[key];
						row[displayKey] = (origValues[displayKey] / total) * 100;
					}
				} else {
					for (const key of rawSplitKeys) {
						const displayKey = splitKeyDisplayMap[key];
						row[displayKey] = origValues[displayKey];
					}
				}

				return row;
			});

			chartData.sort((a, b) => (b._total as number) - (a._total as number));
		} else {
			dataKeys = [formatMetricLabel(metric)];
			chartData = data.map((item) => ({
				name: formatDimensionValue(item.dimension_value, dimension, userMap),
				_fullName: item.dimension_value,
				[formatMetricLabel(metric)]: item.metric_value || 0,
			}));

			chartData.sort(
				(a, b) =>
					(b[formatMetricLabel(metric)] as number) -
					(a[formatMetricLabel(metric)] as number),
			);
		}

		return { chartData, dataKeys };
	}, [data, dimension, metric, split_by, showPercentage, userMap]);

	if (!data || data.length === 0) {
		return (
			<div className="flex items-center justify-center h-64 text-muted">
				No data available for the selected dimension and metric
			</div>
		);
	}

	const renderTooltip = (props: Record<string, unknown>) => {
		const { active, payload, label } = props;
		if (!active || !Array.isArray(payload) || payload.length === 0) {
			return null;
		}

		const payloadData = (payload[0] as Record<string, unknown>)?.payload as
			| Record<string, unknown>
			| undefined;
		const fullName = (payloadData?._fullName || label) as string | undefined;
		const originalValues = payloadData?._originalValues as
			| Record<string, number>
			| undefined;

		// Build normalized items for ChartTooltip using raw values
		const normalizedPayload = payload
			.filter((entry: Record<string, unknown>) => {
				const rawVal =
					originalValues?.[entry.name as string] ?? (entry.value as number);
				return rawVal !== 0;
			})
			.map((entry: Record<string, unknown>) => ({
				name: entry.name as string,
				value:
					originalValues?.[entry.name as string] ?? (entry.value as number),
				color: (entry.color ?? entry.fill) as string,
			}));

		const valueFormatter =
			showPercentage && originalValues
				? (v: number, name: string) => {
						const pct = payload.find(
							(e: Record<string, unknown>) => e.name === name,
						);
						const pctVal = pct ? (pct.value as number) : 0;
						return `${formatNumberWithCommas(v)} (${pctVal.toFixed(1)}%)`;
					}
				: (v: number) => formatNumberWithCommas(v);

		return (
			<ChartTooltip
				active={true}
				payload={normalizedPayload}
				label={fullName}
				sortItems={Boolean(split_by)}
				valueFormatter={valueFormatter}
				showTotal={!showPercentage}
			/>
		);
	};

	return (
		<div className="w-full">
			<ResponsiveContainer width="100%" height={400}>
				<BarChart
					data={chartData}
					layout="vertical"
					margin={{ top: 20, right: 30, left: 10, bottom: 20 }}
				>
					<CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
					<XAxis
						type="number"
						className="text-xs"
						tick={{ fill: axisStroke }}
						tickFormatter={
							showPercentage && split_by
								? (value) => `${value.toFixed(0)}%`
								: formatCompactNumber
						}
						domain={showPercentage && split_by ? [0, 100] : undefined}
						label={{
							value:
								showPercentage && split_by
									? "Percentage (%)"
									: formatMetricLabel(metric),
							position: "insideBottom",
							offset: -10,
							style: { textAnchor: "middle", fill: axisStroke },
						}}
					/>
					<YAxis
						type="category"
						dataKey="name"
						width={150}
						className="text-xs"
						tick={{ fill: axisStroke, fontSize: 12 }}
						interval={0}
					/>
					<Tooltip
						content={(props) => renderTooltip(props as Record<string, unknown>)}
					/>
					{split_by && (
						<Legend
							layout="vertical"
							align="right"
							verticalAlign="top"
							width={160}
							content={({ payload }) => (
								<ChartLegend
									payload={payload}
									hiddenSeries={hiddenSeries}
									onToggle={toggleSeries}
								/>
							)}
						/>
					)}
					{split_by ? (
						dataKeys.map((key, index) => (
							<Bar
								key={key}
								dataKey={key}
								stackId="stack"
								hide={hiddenSeries.has(key)}
								fill={CHART_COLORS[index % CHART_COLORS.length]}
							/>
						))
					) : (
						<Bar dataKey={formatMetricLabel(metric)} fill="#3b82f6" />
					)}
				</BarChart>
			</ResponsiveContainer>
		</div>
	);
});
