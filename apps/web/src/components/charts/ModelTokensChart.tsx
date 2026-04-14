import type { ModelTokensTrendData } from "@rudel/api-routes";
import { useMemo, useState } from "react";
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
import { formatCompactWholeNumber } from "@/lib/format";
import { ChartLegend } from "./ChartLegend";
import { ChartTooltip } from "./ChartTooltip";

const MAX_SERIES = 14;
const OTHER_COLOR = "#9ca3af";

const MODEL_COLORS = [
	"#3b82f6",
	"#f59e0b",
	"#10b981",
	"#8b5cf6",
	"#ef4444",
	"#06b6d4",
	"#ec4899",
	"#f97316",
	"#84cc16",
	"#6366f1",
	"#14b8a6",
	"#a855f7",
	"#f43f5e",
	"#0ea5e9",
];

function formatCompactNumber(num: number): string {
	if (num >= 1_000_000_000) {
		return `${(num / 1_000_000_000).toFixed(1)}B`;
	}
	if (num >= 1_000_000) {
		return `${(num / 1_000_000).toFixed(1)}M`;
	}
	if (num >= 1_000) {
		return `${(num / 1_000).toFixed(1)}K`;
	}
	return num.toFixed(0);
}

function shortenModelName(model: string): string {
	if (model === "Other") {
		return "Other";
	}
	return model.replace("claude-", "").replace(/-\d{8}$/, "");
}

interface ModelTokensChartProps {
	data: ModelTokensTrendData[];
}

export function ModelTokensChart({ data }: ModelTokensChartProps) {
	const { gridStroke } = useChartTheme();
	const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(new Set());
	const toggleSeries = (key: string) =>
		setHiddenSeries((prev) => {
			const next = new Set(prev);
			next.has(key) ? next.delete(key) : next.add(key);
			return next;
		});

	const { chartData, models } = useMemo(() => {
		if (data.length === 0) {
			return { chartData: [], models: [] };
		}

		// Compute total tokens per model to determine top 14
		const modelTotals = new Map<string, number>();
		for (const row of data) {
			modelTotals.set(
				row.model,
				(modelTotals.get(row.model) ?? 0) + row.total_tokens,
			);
		}

		const sortedModels = Array.from(modelTotals.entries()).sort(
			(a, b) => b[1] - a[1],
		);
		const topModels = sortedModels.slice(0, MAX_SERIES).map(([m]) => m);
		const topModelsSet = new Set(topModels);
		const hasOther = sortedModels.length > MAX_SERIES;
		const modelList = hasOther ? [...topModels, "Other"] : topModels;

		// Build per-date raw data, bucketing overflow into "Other"
		const rawByDate = new Map<string, Record<string, number>>();
		for (const row of data) {
			const entry = rawByDate.get(row.date) ?? {};
			const key = topModelsSet.has(row.model) ? row.model : "Other";
			entry[key] = (entry[key] ?? 0) + row.total_tokens;
			rawByDate.set(row.date, entry);
		}

		// Build full date range so zero-value days are included
		const allDates = Array.from(new Set(data.map((r) => r.date))).sort();
		const minDate = new Date(allDates[0]);
		const maxDate = new Date(allDates[allDates.length - 1]);
		const dateRange: string[] = [];
		for (let d = new Date(minDate); d <= maxDate; d.setDate(d.getDate() + 1)) {
			dateRange.push(d.toISOString().split("T")[0]);
		}

		const sorted = dateRange.map((dateKey) => {
			const entry: Record<string, number | string> = {
				date: new Date(dateKey).toLocaleDateString("en-US", {
					month: "short",
					day: "numeric",
				}),
				_sort: dateKey,
			};
			const raw = rawByDate.get(dateKey) ?? {};
			for (const model of modelList) {
				entry[model] = raw[model] ?? 0;
			}
			return entry;
		});

		return { chartData: sorted, models: modelList };
	}, [data]);

	if (chartData.length === 0) {
		return null;
	}

	return (
		<ResponsiveContainer width="100%" height={400}>
			<BarChart
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
					allowDecimals={false}
					tick={{ fontSize: 12 }}
					tickFormatter={formatCompactWholeNumber}
				/>
				<Tooltip
					content={(props) => (
						<ChartTooltip
							{...props}
							nameFormatter={shortenModelName}
							sortItems
							valueFormatter={(v) => formatCompactNumber(v)}
						/>
					)}
				/>
				<Legend
					layout="vertical"
					align="right"
					verticalAlign="top"
					width={160}
					content={({ payload }) => (
						<ChartLegend
							payload={payload}
							formatter={shortenModelName}
							hiddenSeries={hiddenSeries}
							onToggle={toggleSeries}
						/>
					)}
				/>
				{models.map((model, i) => (
					<Bar
						key={model}
						dataKey={model}
						stackId="1"
						fill={
							model === "Other"
								? OTHER_COLOR
								: MODEL_COLORS[i % MODEL_COLORS.length]
						}
						name={model}
						hide={hiddenSeries.has(model)}
					/>
				))}
			</BarChart>
		</ResponsiveContainer>
	);
}
