// biome-ignore-all lint/nursery/noExcessiveLinesPerFile: Timeline chrome, event markers, and interaction layers share one rendering contract.

import { domAnimation, LazyMotion, useReducedMotion } from "motion/react";
import * as motion from "motion/react-m";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type {
	SessionThreadOverviewChart,
	SessionThreadOverviewChartRow,
	SessionThreadOverviewMetric,
	SessionThreadOverviewTick,
} from "./session-thread-overview-chart";
import type { SessionThreadOverviewStripConfig } from "./session-thread-overview-config";
import { getLivelineInputAxisMaximum } from "./session-thread-overview-liveline-geometry";
import type { SessionOverviewCallSeries } from "./session-thread-overview-model";
import { SessionOverviewMetricButton } from "./session-thread-overview-strip-parts";
import {
	formatCost,
	formatMetricValue,
	getChartX,
	getMetricTotal,
	getPlotBounds,
	getTurnLabel,
	SESSION_OVERVIEW_METRICS,
} from "./session-thread-overview-strip-utils";
import {
	formatTimelineMoment,
	formatTimelineTick,
} from "./session-thread-overview-time-format";
import type { SessionTurnTablePaneOption } from "./session-turn-table-pane";

export function SessionOverviewHeader({
	activeMetric,
	chart,
	onMetricChange,
	trailing,
}: {
	activeMetric: SessionThreadOverviewMetric;
	chart: SessionThreadOverviewChart;
	onMetricChange: (metric: SessionThreadOverviewMetric) => void;
	trailing?: ReactNode;
}) {
	return (
		<header className="flex h-9 min-w-0 items-center gap-3 border-b border-(--session-overview-border) px-3">
			<h2 className="min-w-0 shrink-0 text-base font-medium text-(--session-overview-text) sm:text-xs">
				Session map
			</h2>
			<div
				role="toolbar"
				aria-label="Bar height metric"
				className="ml-auto flex min-w-0 items-center gap-1 overflow-x-auto overscroll-x-contain"
			>
				{SESSION_OVERVIEW_METRICS.map((definition) => (
					<SessionOverviewMetricButton
						key={definition.metric}
						active={activeMetric === definition.metric}
						definition={definition}
						onChange={onMetricChange}
						value={formatMetricValue(
							getMetricTotal(chart, definition.metric),
							definition.metric,
						)}
					/>
				))}
				<div className="flex h-7 shrink-0 items-center gap-1.5 py-1 pr-1 pl-2">
					<span
						aria-hidden="true"
						className="size-1.5 shrink-0 rounded-full bg-red-600 dark:bg-red-400"
					/>
					<div className="text-base font-medium text-(--session-overview-subtle) sm:text-[0.625rem] sm:tracking-[0.05em]">
						Errors
					</div>
					<div className="text-base font-medium text-(--session-overview-text) tabular-nums sm:text-xs">
						{chart.totals.errors.toLocaleString()}
					</div>
				</div>
				{trailing}
			</div>
		</header>
	);
}

// Annotation layers extracted from the strip: reference band (Few's comparative
// tick), max marker + end total (Tufte's sparkline calibration), and the break
// and tick chrome. All are pure presentational functions of chart + config.

export function SessionOverviewAxis({
	config,
	ticks,
}: {
	config: SessionThreadOverviewStripConfig;
	ticks: readonly SessionThreadOverviewTick[];
}) {
	const { plotLeft, plotRight } = getPlotBounds(config);
	return (
		<>
			<path
				d={`M ${plotLeft} ${config.axisY} H ${plotRight}`}
				className="stroke-(--session-overview-border)"
				vectorEffect="non-scaling-stroke"
			/>
			{ticks.map((tick) => {
				const x = getChartX(tick.xRatio, config);
				return (
					<path
						key={tick.timestamp}
						d={`M ${x} ${config.axisY} V ${config.axisY + 3}`}
						className="stroke-(--session-overview-muted)"
						vectorEffect="non-scaling-stroke"
					/>
				);
			})}
		</>
	);
}

function formatAxisTokenValue(value: number) {
	if (value >= 1_000_000) {
		return `${(value / 1_000_000).toFixed(1)}M`;
	}
	return `${Math.round(value / 1_000)}k`;
}

// Y-axis calibration for the Liveline layer: the scale maximum at the top of
// the plot and the half value on the 50% gridline. Rendered as an HTML
// overlay because the plot SVG is stretched (preserveAspectRatio="none"),
// which would distort <text> glyphs. The 5px top matches buildLivelineSignal.
export function SessionOverviewLivelineAxisLabels({
	config,
	series,
}: {
	config: SessionThreadOverviewStripConfig;
	series: SessionOverviewCallSeries;
}) {
	const topY = 5;
	const maximum = getLivelineInputAxisMaximum(series);
	if (maximum <= 0) {
		return null;
	}
	const labels = [
		{ value: maximum, y: topY },
		{ value: maximum / 2, y: (topY + config.axisY) / 2 },
	];
	return (
		<div
			aria-hidden="true"
			className="pointer-events-none absolute inset-0"
			data-liveline-axis-labels
		>
			{labels.map((label) => (
				<span
					key={label.y}
					className="absolute -left-3 -translate-y-1/2 font-mono text-[0.5625rem] text-(--session-overview-subtle) tabular-nums"
					style={{ top: `${(label.y / config.chartHeight) * 100}%` }}
				>
					{formatAxisTokenValue(label.value)}
				</span>
			))}
		</div>
	);
}

// The orange selection marker follows the transcript's observed active turn.
// It overlays the chart and extends to the timeline footer baseline.
export function SessionOverviewCallMarker({
	config,
	selectedXRatio,
}: {
	config: SessionThreadOverviewStripConfig;
	selectedXRatio: number | undefined;
}) {
	const { plotLeft, plotRight } = getPlotBounds(config);
	const x =
		selectedXRatio === undefined
			? undefined
			: getChartX(selectedXRatio, config);
	const targetLeft =
		x === undefined ? undefined : `${(x / config.chartWidth) * 100}%`;
	const reduceMotion = useReducedMotion() ?? false;
	if (
		x === undefined ||
		targetLeft === undefined ||
		x < plotLeft ||
		x > plotRight
	) {
		return null;
	}
	return (
		<LazyMotion features={domAnimation}>
			<motion.div
				aria-hidden="true"
				animate={{ x: `calc(${targetLeft} - 0.5px)` }}
				className="pointer-events-none absolute -top-8 bottom-[1.625rem] left-0 z-40 flex w-px flex-col items-center bg-orange-500 text-orange-500 dark:bg-orange-400 dark:text-orange-400"
				data-liveline-call-marker
				data-session-overview-selection-marker
				initial={false}
				transition={
					reduceMotion
						? { duration: 0 }
						: { damping: 24, mass: 0.85, stiffness: 170, type: "spring" }
				}
			>
				<svg
					aria-hidden="true"
					className="shrink-0 -translate-y-3"
					width="7"
					height="6"
					viewBox="0 0 7 6"
					fill="none"
				>
					<path d="M3.55 6 .52.75h6.06L3.55 6Z" fill="currentColor" />
				</svg>
			</motion.div>
		</LazyMotion>
	);
}

export function SessionOverviewReferenceBand({
	barHeight,
	config,
}: {
	barHeight: number;
	config: SessionThreadOverviewStripConfig;
}) {
	const { plotLeft, plotRight } = getPlotBounds(config);
	return (
		<path
			d={`M ${plotLeft} ${config.axisY - barHeight} H ${plotRight}`}
			className="stroke-[color-mix(in_srgb,var(--session-overview-accent)_28%,transparent)]"
			strokeDasharray="4 3"
			vectorEffect="non-scaling-stroke"
		/>
	);
}

export function SessionOverviewMaxMarker({
	barHeight,
	config,
	label,
	x,
}: {
	barHeight: number;
	config: SessionThreadOverviewStripConfig;
	label: string;
	x: number;
}) {
	const { plotLeft, plotRight } = getPlotBounds(config);
	return (
		<g>
			<circle
				className="fill-(--session-overview-accent) stroke-(--session-overview-chart-surface)"
				cx={x}
				cy={config.axisY - barHeight}
				r="2"
				strokeWidth="1"
				vectorEffect="non-scaling-stroke"
			/>
			<text
				className="fill-(--session-overview-text) text-[0.5rem] font-medium tabular-nums"
				textAnchor="middle"
				x={Math.min(Math.max(x, plotLeft + 24), plotRight - 24)}
				y={Math.max(config.axisY - barHeight - 4, 7)}
			>
				{label}
			</text>
		</g>
	);
}

export function SessionOverviewEndTotal({
	config,
	total,
}: {
	config: SessionThreadOverviewStripConfig;
	total: number;
}) {
	const { plotRight } = getPlotBounds(config);
	return (
		<text
			className="fill-(--session-overview-accent) text-[0.5rem] font-medium tabular-nums"
			textAnchor="end"
			x={plotRight - 2}
			y={Math.max(config.costLineTop - 1, 6)}
		>
			{formatCost(total)}
		</text>
	);
}

export function SessionOverviewTickLabels({
	config,
	ticks,
}: {
	config: SessionThreadOverviewStripConfig;
	ticks: readonly SessionThreadOverviewTick[];
}) {
	return (
		<div aria-hidden="true" className="pointer-events-none absolute inset-0">
			{ticks.map((tick, index) => (
				<span
					key={tick.timestamp}
					className={cn(
						"absolute bottom-1 font-mono text-[0.5625rem] text-(--session-overview-subtle) tabular-nums",
						tick.xRatio === 0
							? "translate-x-0"
							: tick.xRatio === 1
								? "-translate-x-full"
								: "-translate-x-1/2",
					)}
					style={{
						left: `${(getChartX(tick.xRatio, config) / config.chartWidth) * 100}%`,
					}}
				>
					{formatTimelineTick(tick.timestamp, ticks[index - 1]?.timestamp)}
				</span>
			))}
		</div>
	);
}

export function SessionOverviewTimelineFooter({
	onResetZoom,
	ticks,
}: {
	onResetZoom?: () => void;
	ticks: readonly SessionThreadOverviewTick[];
}) {
	const lastTick = ticks.at(-1);
	const firstTick = ticks[0];
	return (
		<div
			className="h-6 shrink-0 border-t-[0.5px] border-(--session-overview-border) px-3 py-1"
			data-session-overview-axis-strip
		>
			<div className="grid h-4 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 font-sans text-[0.625rem] leading-4 font-normal text-(--session-overview-subtle) tabular-nums">
				{firstTick ? (
					<span className="truncate whitespace-nowrap">
						{formatTimelineMoment(firstTick.timestamp)}
					</span>
				) : null}
				{onResetZoom ? (
					<button
						type="button"
						aria-label="Reset timeline zoom"
						className="h-5 rounded px-1.5 text-[0.625rem] font-medium text-(--session-overview-text) outline-none hover:bg-(--session-overview-hover) focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--session-overview-accent)"
						onClick={onResetZoom}
					>
						Reset zoom
					</button>
				) : (
					<span />
				)}
				{lastTick && lastTick.timestamp !== firstTick?.timestamp ? (
					<span
						className="justify-self-end truncate whitespace-nowrap"
						data-session-overview-axis-end
					>
						{formatTimelineMoment(lastTick.timestamp)}
					</span>
				) : null}
			</div>
		</div>
	);
}

export function SessionOverviewTurnHitTargets({
	config,
	onFocusIndexChange,
	onSelect,
	options,
	readoutId,
	readoutIndex,
	rows,
	selectedIndex,
}: {
	config: SessionThreadOverviewStripConfig;
	onFocusIndexChange: (index: number | undefined) => void;
	onSelect: (index: number) => void;
	options: readonly SessionTurnTablePaneOption[];
	readoutId: string;
	readoutIndex: number | undefined;
	rows: readonly SessionThreadOverviewChartRow[];
	selectedIndex: number;
}) {
	return (
		<div className="absolute inset-0 z-10 cursor-crosshair">
			{rows.map((row) => {
				const option = options[row.index];
				if (!option) {
					return null;
				}
				return (
					<button
						key={option.key}
						type="button"
						aria-describedby={
							readoutIndex === row.index ? readoutId : undefined
						}
						aria-label={`Select ${getTurnLabel(option)}`}
						aria-pressed={row.index === selectedIndex}
						className="absolute inset-y-0 w-5 -translate-x-1/2 cursor-crosshair rounded-sm outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--session-overview-accent)"
						data-session-overview-turn-hit-target
						style={{
							left: `${(getChartX(row.xRatio, config) / config.chartWidth) * 100}%`,
						}}
						onBlur={() => onFocusIndexChange(undefined)}
						onClick={() => onSelect(row.index)}
						onFocus={() => onFocusIndexChange(row.index)}
					/>
				);
			})}
		</div>
	);
}
