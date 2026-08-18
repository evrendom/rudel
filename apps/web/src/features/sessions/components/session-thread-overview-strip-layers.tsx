import { domAnimation, LazyMotion, useReducedMotion } from "motion/react";
import * as motion from "motion/react-m";
import type { SessionThreadOverviewChartRow } from "./session-thread-overview-chart";
import type { SessionThreadOverviewStripConfig } from "./session-thread-overview-config";
import {
	getChartX,
	getPlotBounds,
	getTurnLabel,
} from "./session-thread-overview-strip-utils";
import { formatTimelineMoment } from "./session-thread-overview-time-format";
import type { SessionThreadOverviewTick } from "./session-thread-overview-timeline";
import type { SessionTurnTablePaneOption } from "./session-turn-table-pane";

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
