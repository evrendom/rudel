import type { PieLabelRenderProps } from "recharts";

interface TaskClassification {
	task_type: string;
	count: number;
	percentage: number;
	avg_confidence: number;
}

import { useState } from "react";
import {
	Cell,
	Legend,
	Pie,
	PieChart,
	ResponsiveContainer,
	Tooltip,
} from "recharts";
import { ChartLegend } from "./ChartLegend";

interface TaskClassificationChartProps {
	data: TaskClassification[];
	onTaskTypeClick?: (taskType: string) => void;
}

const COLORS: Record<string, string> = {
	bug_fix: "#ef4444",
	new_feature: "#3b82f6",
	refactoring: "#8b5cf6",
	tests: "#10b981",
	documentation: "#f59e0b",
	research: "#6366f1",
	unknown: "#6b7280",
};

const LABELS: Record<string, string> = {
	bug_fix: "Bug Fix",
	new_feature: "New Feature",
	refactoring: "Refactoring",
	tests: "Tests",
	documentation: "Documentation",
	research: "Research",
	unknown: "Unknown",
};

export function TaskClassificationChart({
	data,
	onTaskTypeClick,
}: TaskClassificationChartProps) {
	const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(new Set());
	const toggleSeries = (key: string) =>
		setHiddenSeries((prev) => {
			const next = new Set(prev);
			next.has(key) ? next.delete(key) : next.add(key);
			return next;
		});

	const chartData = data.map((item) => ({
		name: LABELS[item.task_type] || item.task_type,
		value: item.count,
		percentage: item.percentage,
		confidence: item.avg_confidence,
		task_type: item.task_type,
	}));

	const renderCustomLabel = (props: PieLabelRenderProps) => {
		const cx = Number(props.cx) || 0;
		const cy = Number(props.cy) || 0;
		const midAngle = Number(props.midAngle) || 0;
		const innerRadius = Number(props.innerRadius) || 0;
		const outerRadius = Number(props.outerRadius) || 0;
		const percentage =
			Number((props as unknown as Record<string, unknown>).percentage) || 0;

		const RADIAN = Math.PI / 180;
		const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
		const x = cx + radius * Math.cos(-midAngle * RADIAN);
		const y = cy + radius * Math.sin(-midAngle * RADIAN);

		if (percentage < 5) return null;

		return (
			<text
				x={x}
				y={y}
				fill="white"
				textAnchor={x > cx ? "start" : "end"}
				dominantBaseline="central"
				className="text-sm font-semibold"
			>
				{`${percentage.toFixed(1)}%`}
			</text>
		);
	};

	const CustomTooltip = ({ active, payload }: Record<string, unknown>) => {
		if (active && payload && Array.isArray(payload) && payload.length) {
			const d = (payload[0] as Record<string, unknown>).payload as Record<
				string,
				unknown
			>;
			return (
				<div className="bg-input p-3 border border-border rounded-lg shadow-lg">
					<p className="font-semibold text-foreground">{d.name as string}</p>
					<p className="text-sm text-muted">
						Sessions:{" "}
						<span className="font-semibold text-foreground">
							{d.value as number}
						</span>
					</p>
					<p className="text-sm text-muted">
						Percentage:{" "}
						<span className="font-semibold text-foreground">
							{(d.percentage as number).toFixed(1)}%
						</span>
					</p>
					<p className="text-sm text-muted">
						Avg Confidence:{" "}
						<span className="font-semibold text-foreground">
							{((d.confidence as number) * 100).toFixed(0)}%
						</span>
					</p>
				</div>
			);
		}
		return null;
	};

	const visibleData = chartData.filter((d) => !hiddenSeries.has(d.name));

	return (
		<div className="w-full h-[400px]">
			<ResponsiveContainer width="100%" height="100%">
				<PieChart>
					<Pie
						data={visibleData}
						cx="50%"
						cy="50%"
						labelLine={false}
						label={renderCustomLabel}
						outerRadius={120}
						fill="#8884d8"
						dataKey="value"
						onClick={(d) => {
							if (onTaskTypeClick) {
								onTaskTypeClick(
									(d as unknown as { task_type: string }).task_type,
								);
							}
						}}
						cursor="pointer"
					>
						{visibleData.map((entry, index) => (
							<Cell
								// biome-ignore lint/suspicious/noArrayIndexKey: static pie chart segments
								key={`cell-${index}`}
								fill={COLORS[entry.task_type] || COLORS.unknown}
								className="hover:opacity-80 transition-opacity"
							/>
						))}
					</Pie>
					<Tooltip content={<CustomTooltip />} />
					<Legend
						layout="vertical"
						align="right"
						verticalAlign="top"
						width={160}
						content={({ payload }) => (
							<ChartLegend
								payload={payload}
								formatter={(value) => {
									const match = chartData.find((item) => item.name === value);
									return `${value} (${match?.value || 0})`;
								}}
								hiddenSeries={hiddenSeries}
								onToggle={toggleSeries}
							/>
						)}
					/>
				</PieChart>
			</ResponsiveContainer>
		</div>
	);
}
