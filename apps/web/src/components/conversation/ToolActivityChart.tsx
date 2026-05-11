import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { useObservedWidth } from "./use-observed-width";

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

const CHART_HEIGHT = 104;
const LANE_HEIGHT = 28;
const LANE_TOP_PAD = 10;
const DOT_RADIUS = 4;
const LEFT_MARGIN = 44;

const lanes: Array<{
	category: ToolActivityPoint["category"];
	label: string;
	y: number;
}> = [
	{ category: "tool", label: "Tools", y: LANE_TOP_PAD + LANE_HEIGHT * 0.5 },
	{ category: "skill", label: "Skills", y: LANE_TOP_PAD + LANE_HEIGHT * 1.5 },
	{
		category: "subagent",
		label: "Agents",
		y: LANE_TOP_PAD + LANE_HEIGHT * 2.5,
	},
];

function getPointFill(point: ToolActivityPoint): string {
	if (point.isError) {
		return "color-mix(in srgb, var(--dashboardy-danger-foreground) 85%, white)";
	}
	if (point.category === "tool") {
		return "color-mix(in srgb, var(--dashboardy-accent) 82%, white)";
	}
	if (point.category === "skill") {
		return "color-mix(in srgb, var(--dashboardy-chip-foreground) 78%, white)";
	}
	return "color-mix(in srgb, var(--dashboardy-warning-foreground) 82%, white)";
}

export function ToolActivityChart({
	data,
	totalMessages,
	className,
}: ToolActivityChartProps) {
	const { elementRef: containerRef, width: chartWidth } =
		useObservedWidth<HTMLDivElement>();
	const safeTotalMessages = Math.max(totalMessages, 1);

	const drawWidth = chartWidth - LEFT_MARGIN;

	const counts = useMemo(() => {
		const tools = data.filter((point) => point.category === "tool").length;
		const skills = data.filter((point) => point.category === "skill").length;
		const subagents = data.filter(
			(point) => point.category === "subagent",
		).length;
		const errors = data.filter((point) => point.isError).length;
		return { tools, skills, subagents, errors };
	}, [data]);

	if (data.length === 0) {
		return (
			<div className={cn("grid gap-3", className)}>
				<div className="grid gap-1">
					<p className="text-sm font-medium text-[color:var(--dashboardy-muted)]">
						No tool activity
					</p>
					<p className="text-sm text-[color:var(--dashboardy-subtle)]">
						This session didn&apos;t call tools, skills, or subagents.
					</p>
				</div>
				<div className="rounded-[0.95rem] border border-[color:var(--dashboardy-divider)] bg-[color:var(--dashboardy-subsurface)] px-4 py-6 text-center">
					<p className="text-sm text-[color:var(--dashboardy-muted)]">
						Activity markers show up here as the session invokes tools and
						agents.
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className={cn("grid gap-4", className)}>
			<div className="flex flex-wrap gap-2">
				<div className="dashboardy-inline-badge rounded-full border px-3 py-1.5">
					<p className="text-[0.8125rem] font-medium text-[color:var(--dashboardy-heading)]">
						{counts.tools} tools
					</p>
				</div>
				<div className="dashboardy-inline-badge rounded-full border px-3 py-1.5">
					<p className="text-[0.8125rem] font-medium text-[color:var(--dashboardy-heading)]">
						{counts.skills} skills
					</p>
				</div>
				<div className="dashboardy-inline-badge rounded-full border px-3 py-1.5">
					<p className="text-[0.8125rem] font-medium text-[color:var(--dashboardy-heading)]">
						{counts.subagents} agents
					</p>
				</div>
				{counts.errors > 0 ? (
					<div className="rounded-full border border-[color:var(--dashboardy-border)] bg-[color:var(--dashboardy-danger-surface)] px-3 py-1.5">
						<p className="text-[0.8125rem] font-medium text-[color:var(--dashboardy-danger-foreground)]">
							{counts.errors} errors
						</p>
					</div>
				) : null}
			</div>

			<div ref={containerRef}>
				<svg
					viewBox={`0 0 ${chartWidth} ${CHART_HEIGHT}`}
					className="w-full"
					style={{ height: `${CHART_HEIGHT}px` }}
					role="img"
					aria-label="Tool activity chart showing tool, skill, and subagent usage"
				>
					{lanes.map((lane, index) => (
						<g key={lane.category}>
							<line
								x1={LEFT_MARGIN}
								y1={LANE_TOP_PAD + index * LANE_HEIGHT}
								x2={chartWidth}
								y2={LANE_TOP_PAD + index * LANE_HEIGHT}
								stroke="var(--dashboardy-divider)"
								strokeWidth="0.75"
							/>
							<text
								x={LEFT_MARGIN - 6}
								y={lane.y + 3}
								textAnchor="end"
								className="fill-[color:var(--dashboardy-muted)]"
								fontSize="10"
							>
								{lane.label}
							</text>
						</g>
					))}
					<line
						x1={LEFT_MARGIN}
						y1={LANE_TOP_PAD + lanes.length * LANE_HEIGHT}
						x2={chartWidth}
						y2={LANE_TOP_PAD + lanes.length * LANE_HEIGHT}
						stroke="var(--dashboardy-divider)"
						strokeWidth="0.75"
					/>

					{data.map((point, index) => {
						const x =
							LEFT_MARGIN +
							(point.messageIndex / safeTotalMessages) * drawWidth;
						const lane = lanes.find((item) => item.category === point.category);
						if (!lane) {
							return null;
						}

						return (
							<circle
								// biome-ignore lint/suspicious/noArrayIndexKey: static chart dot data
								key={index}
								cx={x}
								cy={lane.y}
								r={DOT_RADIUS}
								fill={getPointFill(point)}
							/>
						);
					})}
				</svg>
			</div>

			<div className="flex flex-wrap items-center gap-2">
				<div className="dashboardy-inline-badge flex items-center gap-2 rounded-full border px-3 py-1.5">
					<div className="size-2 rounded-full [background:color-mix(in_srgb,var(--dashboardy-accent)_82%,white)]" />
					<p className="text-[0.8125rem] font-medium text-[color:var(--dashboardy-heading)]">
						Tools
					</p>
				</div>
				<div className="dashboardy-inline-badge flex items-center gap-2 rounded-full border px-3 py-1.5">
					<div className="size-2 rounded-full [background:color-mix(in_srgb,var(--dashboardy-chip-foreground)_78%,white)]" />
					<p className="text-[0.8125rem] font-medium text-[color:var(--dashboardy-heading)]">
						Skills
					</p>
				</div>
				<div className="dashboardy-inline-badge flex items-center gap-2 rounded-full border px-3 py-1.5">
					<div className="size-2 rounded-full [background:color-mix(in_srgb,var(--dashboardy-warning-foreground)_82%,white)]" />
					<p className="text-[0.8125rem] font-medium text-[color:var(--dashboardy-heading)]">
						Agents
					</p>
				</div>
				<div className="dashboardy-inline-badge flex items-center gap-2 rounded-full border px-3 py-1.5">
					<div className="size-2 rounded-full [background:color-mix(in_srgb,var(--dashboardy-danger-foreground)_85%,white)]" />
					<p className="text-[0.8125rem] font-medium text-[color:var(--dashboardy-heading)]">
						Error
					</p>
				</div>
			</div>
		</div>
	);
}
