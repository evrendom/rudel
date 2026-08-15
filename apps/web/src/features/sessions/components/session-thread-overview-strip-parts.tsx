import { cn } from "@/lib/utils";
import {
	getSessionThreadOverviewMetricValue,
	type SessionThreadOverviewChart,
	type SessionThreadOverviewChartRow,
	type SessionThreadOverviewCostPoint,
	type SessionThreadOverviewMetric,
} from "./session-thread-overview-chart";
import {
	DEFAULT_SESSION_THREAD_OVERVIEW_STRIP_CONFIG,
	type SessionThreadOverviewStripConfig,
} from "./session-thread-overview-config";
import { formatTimelineMoment } from "./session-thread-overview-time-format";
import type { SessionTurnOption } from "./session-turn-option";

type SessionOverviewMetricDefinition = {
	label: string;
	metric: SessionThreadOverviewMetric;
	title: string;
};

export type SessionOverviewHover = {
	index: number;
	xRatio: number;
};

export type SessionOverviewEventKind = "edit" | "skill" | "subagent";

const EVENT_MARKER_KEYS = ["first", "second", "third"] as const;

export const SESSION_OVERVIEW_METRICS: readonly SessionOverviewMetricDefinition[] =
	[
		{ label: "Cost", metric: "cost", title: "Estimated turn cost" },
		{ label: "IN", metric: "input", title: "Recorded input tokens" },
		{ label: "Reasoning", metric: "reasoning", title: "Reasoning blocks" },
		{ label: "Skills", metric: "skills", title: "Skill uses" },
		{ label: "Edits", metric: "edits", title: "Directly edited files" },
		{ label: "Sub-agents", metric: "subagents", title: "Subagents started" },
	];

const compactNumberFormatter = new Intl.NumberFormat("en-US", {
	maximumFractionDigits: 1,
	notation: "compact",
});

const costFormatter = new Intl.NumberFormat("en-US", {
	currency: "USD",
	maximumFractionDigits: 2,
	minimumFractionDigits: 2,
	style: "currency",
});

export function getPlotBounds(config: SessionThreadOverviewStripConfig) {
	return {
		plotLeft: config.plotPadding,
		plotRight: config.chartWidth - config.plotPadding,
	};
}

function getChartDomain(config: SessionThreadOverviewStripConfig) {
	const boundedStart = Math.min(Math.max(config.xDomainStartRatio, 0), 1);
	const boundedEnd = Math.min(Math.max(config.xDomainEndRatio, 0), 1);
	return boundedEnd > boundedStart
		? { end: boundedEnd, start: boundedStart }
		: { end: 1, start: 0 };
}

export function getChartX(
	xRatio: number,
	config: SessionThreadOverviewStripConfig = DEFAULT_SESSION_THREAD_OVERVIEW_STRIP_CONFIG,
) {
	const { plotLeft, plotRight } = getPlotBounds(config);
	const boundedRatio = Math.min(Math.max(xRatio, 0), 1);
	const domain = getChartDomain(config);
	const visibleRatio =
		(boundedRatio - domain.start) / (domain.end - domain.start);
	return plotLeft + visibleRatio * (plotRight - plotLeft);
}

export function getChartRatioAtX(
	x: number,
	config: SessionThreadOverviewStripConfig = DEFAULT_SESSION_THREAD_OVERVIEW_STRIP_CONFIG,
) {
	const { plotLeft, plotRight } = getPlotBounds(config);
	const domain = getChartDomain(config);
	const visibleRatio = Math.min(
		Math.max((x - plotLeft) / (plotRight - plotLeft), 0),
		1,
	);
	return domain.start + visibleRatio * (domain.end - domain.start);
}

export function getSessionOverviewViewportLayout(
	viewport: { xEndRatio: number; xStartRatio: number } | undefined,
	config: SessionThreadOverviewStripConfig,
) {
	if (!viewport) {
		return { viewportStartX: 0, viewportWidth: 0 };
	}

	const rawStartX = getChartX(viewport.xStartRatio, config);
	const rawEndX = getChartX(viewport.xEndRatio, config);
	const viewportWidth = Math.max(
		rawEndX - rawStartX,
		config.minimumViewportWidth,
	);
	const viewportCenterX = (rawStartX + rawEndX) / 2;
	return {
		viewportStartX: viewportCenterX - viewportWidth / 2,
		viewportWidth,
	};
}

export function getBarHeight(
	metricRatio: number | undefined,
	config: SessionThreadOverviewStripConfig = DEFAULT_SESSION_THREAD_OVERVIEW_STRIP_CONFIG,
) {
	return metricRatio === undefined
		? 0
		: Math.max(metricRatio * config.maxBarHeight, config.minBarHeight);
}

export function countReasoningBlocks(option: SessionTurnOption) {
	let count = 0;
	for (const item of option.turn.responseItems) {
		if (item.kind !== "agent") {
			continue;
		}
		count += item.events.filter((event) => event.kind === "reasoning").length;
	}

	return count;
}

function formatCompactNumber(value: number | undefined) {
	return value === undefined ? "—" : compactNumberFormatter.format(value);
}

export function formatCost(value: number | undefined) {
	return value === undefined ? "$—" : costFormatter.format(value);
}

export function formatMetricValue(
	value: number | undefined,
	metric: SessionThreadOverviewMetric,
) {
	if (metric === "cost") {
		return formatCost(value);
	}
	if (metric === "input") {
		return value === undefined ? "—" : `${formatCompactNumber(value)} tok`;
	}
	return value === undefined ? "—" : value.toLocaleString();
}

export function getMetricTotal(
	chart: SessionThreadOverviewChart,
	metric: SessionThreadOverviewMetric,
) {
	switch (metric) {
		case "cost":
			return chart.totals.cost;
		case "edits":
			return chart.totals.edits;
		case "input":
			return chart.totals.inputTokens;
		case "reasoning":
			return chart.totals.reasoning;
		case "skills":
			return chart.totals.skills;
		case "subagents":
			return chart.totals.subagents;
	}
}

export function formatIdleDuration(durationMs: number) {
	const totalMinutes = Math.max(Math.round(durationMs / (60 * 1_000)), 1);
	const days = Math.floor(totalMinutes / (24 * 60));
	const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
	const minutes = totalMinutes % 60;
	return [
		days > 0 ? `${days}d` : "",
		hours > 0 ? `${hours}h` : "",
		minutes > 0 ? `${minutes}m` : "",
	]
		.filter(Boolean)
		.join(" ");
}

export function getTurnLabel(option: SessionTurnOption) {
	return option.turnNumber === undefined
		? "Session start"
		: `Turn ${option.turnNumber}`;
}

function SessionOverviewMetricMarker({
	metric,
}: {
	metric: SessionThreadOverviewMetric;
}) {
	return (
		<span
			aria-hidden="true"
			className={cn(
				"size-1.5 shrink-0 bg-[color-mix(in_srgb,var(--session-overview-accent)_72%,var(--session-overview-text))]",
				metric === "skills" && "rounded-full",
				metric === "edits" && "rounded-[1px]",
				metric === "subagents" && "rotate-45 rounded-[1px]",
				metric !== "skills" &&
					metric !== "edits" &&
					metric !== "subagents" &&
					"rounded-full",
			)}
		/>
	);
}

export function SessionOverviewMetricButton({
	active,
	definition,
	onChange,
	value,
}: {
	active: boolean;
	definition: SessionOverviewMetricDefinition;
	onChange: (metric: SessionThreadOverviewMetric) => void;
	value: string;
}) {
	return (
		<button
			type="button"
			aria-label={`Scale bars by ${definition.title}`}
			aria-pressed={active}
			className={cn(
				"flex h-7 shrink-0 items-center gap-1.5 rounded-md py-1 pr-2 pl-1 outline-none hover:bg-(--session-overview-hover) focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--session-overview-accent)",
				active &&
					"bg-[color-mix(in_srgb,var(--session-overview-accent)_10%,var(--session-overview-surface))] text-(--session-overview-text)",
			)}
			onClick={() => onChange(definition.metric)}
		>
			<SessionOverviewMetricMarker metric={definition.metric} />
			<div className="text-base font-medium text-(--session-overview-subtle) sm:text-[0.625rem] sm:tracking-[0.05em]">
				{definition.label}
			</div>
			<div className="text-base font-medium text-(--session-overview-text) tabular-nums sm:text-xs">
				{value}
			</div>
		</button>
	);
}

// Shape-only keeps the accent-derived monochrome ramp; hue-shape exists for the
// lab's Bertin selectivity A/B (shape alone does not pop out preattentively).
const EVENT_MARKER_CLASS_NAMES: Record<
	SessionOverviewEventKind,
	Record<SessionThreadOverviewStripConfig["glyphEncoding"], string>
> = {
	edit: {
		"hue-shape": "fill-cyan-600 dark:fill-cyan-400",
		"shape-only":
			"fill-[color-mix(in_srgb,var(--session-overview-accent)_68%,var(--session-overview-text))]",
	},
	skill: {
		"hue-shape": "fill-amber-600 dark:fill-amber-400",
		"shape-only":
			"fill-[color-mix(in_srgb,var(--session-overview-accent)_86%,var(--session-overview-text))]",
	},
	subagent: {
		"hue-shape": "fill-fuchsia-600 dark:fill-fuchsia-400",
		"shape-only":
			"fill-[color-mix(in_srgb,var(--session-overview-accent)_50%,var(--session-overview-text))]",
	},
};

export function SessionOverviewEventMarker({
	config = DEFAULT_SESSION_THREAD_OVERVIEW_STRIP_CONFIG,
	kind,
	x,
}: {
	config?: SessionThreadOverviewStripConfig;
	kind: SessionOverviewEventKind;
	x: number;
}) {
	const className = EVENT_MARKER_CLASS_NAMES[kind][config.glyphEncoding];
	switch (kind) {
		case "skill":
			return (
				<circle
					className={className}
					cx={x}
					cy={config.eventY}
					r={config.skillGlyphRadius}
				/>
			);
		case "edit":
			return (
				<rect
					className={className}
					height={config.editGlyphSize}
					rx="0.45"
					width={config.editGlyphSize}
					x={x - config.editGlyphSize / 2}
					y={config.eventY - config.editGlyphSize / 2}
				/>
			);
		case "subagent":
			return (
				<rect
					className={className}
					height={config.subagentGlyphSize}
					rx="0.35"
					transform={`rotate(45 ${x} ${config.eventY})`}
					width={config.subagentGlyphSize}
					x={x - config.subagentGlyphSize / 2}
					y={config.eventY - config.subagentGlyphSize / 2}
				/>
			);
	}
}

export function SessionTurnEventGlyphs({
	config = DEFAULT_SESSION_THREAD_OVERVIEW_STRIP_CONFIG,
	row,
	x,
}: {
	config?: SessionThreadOverviewStripConfig;
	row: SessionThreadOverviewChartRow;
	x: number;
}) {
	const eventGroups: readonly {
		count: number;
		kind: SessionOverviewEventKind;
	}[] = [
		{ count: row.skillCount, kind: "skill" },
		{ count: row.editCount, kind: "edit" },
		{ count: row.subagentCount, kind: "subagent" },
	];
	const groups = eventGroups.filter((group) => group.count > 0);
	const groupWidths = groups.map((group) =>
		group.count > 3 ? 12 : group.count * 4,
	);
	const totalWidth =
		groupWidths.reduce((total, width) => total + width, 0) +
		Math.max(groups.length - 1, 0) * 2;
	let cursor = x - totalWidth / 2;

	return groups.map((group, groupIndex) => {
		const width = groupWidths[groupIndex] ?? 0;
		const groupStart = cursor;
		cursor += width + 2;
		if (group.count > 3) {
			return (
				<g key={group.kind}>
					<SessionOverviewEventMarker
						config={config}
						kind={group.kind}
						x={groupStart + 2}
					/>
					<text
						className="fill-(--session-overview-text) text-[0.375rem] font-medium tabular-nums"
						x={groupStart + 4.5}
						y={config.eventY + 2}
					>
						×{group.count}
					</text>
				</g>
			);
		}

		return (
			<g key={group.kind}>
				{EVENT_MARKER_KEYS.slice(0, group.count).map((markerKey, index) => (
					<SessionOverviewEventMarker
						key={`${group.kind}-${markerKey}`}
						config={config}
						kind={group.kind}
						x={groupStart + 2 + index * 4}
					/>
				))}
			</g>
		);
	});
}

export function getCumulativeCostAtRatio(
	points: readonly SessionThreadOverviewCostPoint[],
	xRatio: number,
) {
	let previousX = 0;
	let previousCost = 0;
	for (const point of points) {
		if (xRatio <= point.xRatio) {
			const width = point.xRatio - previousX;
			if (width <= 0) {
				return point.cumulativeCost;
			}
			const progress = Math.min(Math.max((xRatio - previousX) / width, 0), 1);
			return previousCost + (point.cumulativeCost - previousCost) * progress;
		}
		previousX = point.xRatio;
		previousCost = point.cumulativeCost;
	}

	return previousCost;
}

export function getCostLineY(
	cumulativeCost: number,
	maximumCost: number,
	config: SessionThreadOverviewStripConfig = DEFAULT_SESSION_THREAD_OVERVIEW_STRIP_CONFIG,
) {
	const ratio = maximumCost <= 0 ? 0 : cumulativeCost / maximumCost;
	return (
		config.costLineBottom - ratio * (config.costLineBottom - config.costLineTop)
	);
}

export function SessionOverviewReadout({
	activeMetric,
	config = DEFAULT_SESSION_THREAD_OVERVIEW_STRIP_CONFIG,
	option,
	readoutId,
	row,
	xRatio,
}: {
	activeMetric: SessionThreadOverviewMetric;
	config?: SessionThreadOverviewStripConfig;
	option: SessionTurnOption;
	readoutId: string;
	row: SessionThreadOverviewChartRow;
	xRatio: number;
}) {
	const timestamp = option.timing.startTimestamp
		? Date.parse(option.timing.startTimestamp)
		: undefined;
	const activeValue = getSessionThreadOverviewMetricValue(row, activeMetric);
	const showActiveValue = activeMetric !== "cost" && activeMetric !== "input";

	return (
		<div
			id={readoutId}
			role="tooltip"
			className={cn(
				"pointer-events-none absolute top-1 z-40 min-w-56 rounded-md border border-(--session-overview-border) bg-(--session-overview-surface) px-2.5 py-1.5 shadow-sm dark:shadow-none",
				xRatio < 0.16
					? "translate-x-0"
					: xRatio > 0.84
						? "-translate-x-full"
						: "-translate-x-1/2",
			)}
			style={{
				left: `${(getChartX(xRatio, config) / config.chartWidth) * 100}%`,
			}}
		>
			<div className="flex min-w-0 items-center gap-1.5 text-base font-medium whitespace-nowrap text-(--session-overview-text) sm:text-xs">
				<span className="truncate">{getTurnLabel(option)}</span>
				<span aria-hidden="true" className="text-(--session-overview-subtle)">
					·
				</span>
				<span className="shrink-0 font-mono tabular-nums text-(--session-overview-muted)">
					{timestamp === undefined
						? option.timing.startTime || "Unknown time"
						: formatTimelineMoment(timestamp)}
				</span>
			</div>
			<div className="flex min-w-0 items-center gap-1.5 text-base whitespace-nowrap text-(--session-overview-muted) tabular-nums sm:text-xs">
				<span className="text-(--session-overview-text)">
					{formatCost(row.cost)}
				</span>
				<span aria-hidden="true">·</span>
				<span>{formatCompactNumber(row.inputTokens)} in</span>
				{showActiveValue ? (
					<>
						<span aria-hidden="true">·</span>
						<span>{formatMetricValue(activeValue, activeMetric)}</span>
					</>
				) : null}
				{row.errorCount > 0 ? (
					<>
						<span aria-hidden="true">·</span>
						<span className="text-red-700 dark:text-red-400">
							{row.errorCount} {row.errorCount === 1 ? "error" : "errors"}
						</span>
					</>
				) : null}
			</div>
		</div>
	);
}
