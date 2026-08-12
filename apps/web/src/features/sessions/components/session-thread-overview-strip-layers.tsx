import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { SelectedTurnOption } from "./session-selected-turn";
import type {
	SessionThreadOverviewBreak,
	SessionThreadOverviewChart,
	SessionThreadOverviewChartRow,
	SessionThreadOverviewMetric,
	SessionThreadOverviewTick,
} from "./session-thread-overview-chart";
import type { SessionThreadOverviewStripConfig } from "./session-thread-overview-config";
import {
	formatCost,
	formatIdleDuration,
	formatMetricValue,
	formatTimelineMoment,
	formatTimelineTick,
	getChartX,
	getMetricTotal,
	getPlotBounds,
	getTurnLabel,
	SESSION_OVERVIEW_METRICS,
	SessionOverviewMetricButton,
} from "./session-thread-overview-strip-parts";

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
				className="fill-(--session-overview-accent) stroke-(--session-overview-surface)"
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

// The cut-off marker sits directly on the axis: the surface background breaks
// the axis line, and the bracketed label states how much time was removed.
// Half-hour amounts read as decimal hours ("1.5h"), a bare half hour as "30m".
export function formatBreakCutoffLabel(durationMs: number) {
	const totalMinutes = Math.max(Math.round(durationMs / (60 * 1_000)), 1);
	if (totalMinutes % 30 !== 0) {
		return `[${formatIdleDuration(durationMs)}]`;
	}

	const days = Math.floor(totalMinutes / (24 * 60));
	const hours = (totalMinutes % (24 * 60)) / 60;
	if (days === 0 && hours === 0.5) {
		return "[30m]";
	}
	const parts = [days > 0 ? `${days}d` : "", hours > 0 ? `${hours}h` : ""];
	return `[${parts.filter(Boolean).join(" ")}]`;
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
	options: readonly SelectedTurnOption[];
	readoutId: string;
	readoutIndex: number | undefined;
	rows: readonly SessionThreadOverviewChartRow[];
	selectedIndex: number;
}) {
	return (
		<div className="absolute inset-0 z-10">
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
						className="absolute inset-y-0 w-5 -translate-x-1/2 rounded-sm outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--session-overview-accent)"
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

export function SessionOverviewBreakButtons({
	breaks,
	config,
}: {
	breaks: readonly SessionThreadOverviewBreak[];
	config: SessionThreadOverviewStripConfig;
}) {
	return breaks.map((gap) => {
		const centerX =
			(getChartX(gap.xStartRatio, config) + getChartX(gap.xEndRatio, config)) /
			2;
		const tooltipAlignment =
			gap.xStartRatio < 0.15
				? "left-0"
				: gap.xEndRatio > 0.85
					? "right-0"
					: "left-1/2 -translate-x-1/2";
		return (
			<button
				type="button"
				key={gap.key}
				aria-label={`${formatIdleDuration(gap.idleDurationMs)} idle gap`}
				className="group absolute z-30 -translate-x-1/2 -translate-y-1/2 rounded-sm bg-(--session-overview-surface) px-0.5 font-mono text-[0.5625rem] font-medium whitespace-nowrap text-(--session-overview-muted) outline-none tabular-nums focus-visible:outline-2 focus-visible:outline-(--session-overview-accent)"
				style={{
					left: `${(centerX / config.chartWidth) * 100}%`,
					top: `${(config.axisY / config.chartHeight) * 100}%`,
				}}
			>
				{formatBreakCutoffLabel(gap.durationMs)}
				<span
					role="tooltip"
					className={cn(
						"invisible absolute bottom-full mb-1 min-w-max rounded-md border border-(--session-overview-border) bg-(--session-overview-surface) px-2 py-1 text-sm whitespace-nowrap text-(--session-overview-text) opacity-0 shadow-sm group-hover:visible group-hover:opacity-100 group-focus:visible group-focus:opacity-100 dark:shadow-none",
						tooltipAlignment,
					)}
				>
					{formatTimelineMoment(gap.idleStartTimestamp)}–
					{formatTimelineMoment(gap.idleEndTimestamp)} ·{" "}
					{formatIdleDuration(gap.idleDurationMs)} idle
				</span>
			</button>
		);
	});
}
