import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export interface ToolActivityPoint {
	messageIndex: number;
	category: "tool" | "skill" | "subagent";
	name: string;
	isError: boolean;
}

interface ToolActivityChartProps {
	data: ToolActivityPoint[];
	totalMessages: number;
	className?: string;
}

const CHART_HEIGHT = 100;
const LANE_HEIGHT = 28;
const LANE_TOP_PAD = 8;
const DOT_RADIUS = 4;
const LEFT_MARGIN = 40; // match token chart

const lanes: {
	category: ToolActivityPoint["category"];
	label: string;
	y: number;
}[] = [
	{ category: "tool", label: "Tools", y: LANE_TOP_PAD + LANE_HEIGHT * 0.5 },
	{ category: "skill", label: "Skills", y: LANE_TOP_PAD + LANE_HEIGHT * 1.5 },
	{
		category: "subagent",
		label: "Agents",
		y: LANE_TOP_PAD + LANE_HEIGHT * 2.5,
	},
];

export function ToolActivityChart({
	data,
	totalMessages,
	className,
}: ToolActivityChartProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const [chartWidth, setChartWidth] = useState(400);

	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;
		const observer = new ResizeObserver((entries) => {
			const entry = entries[0];
			if (entry) setChartWidth(entry.contentRect.width);
		});
		observer.observe(el);
		return () => observer.disconnect();
	}, []);

	const drawWidth = chartWidth - LEFT_MARGIN;

	const counts = useMemo(() => {
		const tools = data.filter((d) => d.category === "tool").length;
		const skills = data.filter((d) => d.category === "skill").length;
		const subagents = data.filter((d) => d.category === "subagent").length;
		const errors = data.filter((d) => d.isError).length;
		return { tools, skills, subagents, errors };
	}, [data]);

	if (data.length === 0) {
		return (
			<div className={cn("text-xs text-muted text-center py-4", className)}>
				No tool activity
			</div>
		);
	}

	return (
		<div className={className}>
			<div className="text-xs font-medium text-muted mb-2">Tool Activity</div>

			<div className="flex gap-3 text-[10px] text-muted mb-1">
				<span>{counts.tools} tools</span>
				<span>{counts.skills} skills</span>
				<span>{counts.subagents} subagents</span>
				{counts.errors > 0 && (
					<span className="text-red-400">{counts.errors} errors</span>
				)}
			</div>

			<div ref={containerRef}>
				<svg
					viewBox={`0 0 ${chartWidth} ${CHART_HEIGHT}`}
					className="w-full"
					style={{ height: `${CHART_HEIGHT}px` }}
					role="img"
					aria-label="Tool activity chart showing tool, skill, and subagent usage"
				>
					{/* Lane labels + separators */}
					{lanes.map((lane, idx) => (
						<g key={lane.category}>
							<line
								x1={LEFT_MARGIN}
								y1={LANE_TOP_PAD + idx * LANE_HEIGHT}
								x2={chartWidth}
								y2={LANE_TOP_PAD + idx * LANE_HEIGHT}
								stroke="currentColor"
								strokeWidth="0.5"
								className="text-border"
							/>
							<text
								x={LEFT_MARGIN - 4}
								y={lane.y + 3}
								textAnchor="end"
								className="fill-muted"
								fontSize="9"
							>
								{lane.label}
							</text>
						</g>
					))}
					{/* Bottom border */}
					<line
						x1={LEFT_MARGIN}
						y1={LANE_TOP_PAD + lanes.length * LANE_HEIGHT}
						x2={chartWidth}
						y2={LANE_TOP_PAD + lanes.length * LANE_HEIGHT}
						stroke="currentColor"
						strokeWidth="0.5"
						className="text-border"
					/>

					{/* Activity dots */}
					{data.map((d, i) => {
						const x =
							LEFT_MARGIN + (d.messageIndex / totalMessages) * drawWidth;
						const lane = lanes.find((l) => l.category === d.category);
						if (!lane) return null;

						return (
							<circle
								// biome-ignore lint/suspicious/noArrayIndexKey: static chart dot data
								key={i}
								cx={x}
								cy={lane.y}
								r={DOT_RADIUS}
								className={
									d.isError
										? "fill-red-400/80"
										: d.category === "tool"
											? "fill-green-400/80"
											: d.category === "skill"
												? "fill-purple-400/80"
												: "fill-orange-400/80"
								}
							/>
						);
					})}
				</svg>
			</div>

			{/* Legend */}
			<div className="flex items-center gap-3 mt-1.5 text-[10px] text-muted">
				<div className="flex items-center gap-1">
					<div className="w-2 h-2 rounded-full bg-green-400" />
					<span>Tools</span>
				</div>
				<div className="flex items-center gap-1">
					<div className="w-2 h-2 rounded-full bg-purple-400" />
					<span>Skills</span>
				</div>
				<div className="flex items-center gap-1">
					<div className="w-2 h-2 rounded-full bg-orange-400" />
					<span>Subagents</span>
				</div>
				<div className="flex items-center gap-1">
					<div className="w-2 h-2 rounded-full bg-red-400" />
					<span>Error</span>
				</div>
			</div>
		</div>
	);
}
