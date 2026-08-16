// biome-ignore-all lint/nursery/noExcessiveLinesPerFile: Timeline chrome, event markers, and interaction layers share one rendering contract.

import {
	type MotionValue,
	motion,
	useMotionValue,
	useReducedMotion,
	useSpring,
	useTransform,
} from "motion/react";
import { type PointerEvent, type ReactNode, useRef } from "react";
import { cn } from "@/lib/utils";
import type {
	SessionThreadOverviewChart,
	SessionThreadOverviewChartRow,
	SessionThreadOverviewMetric,
	SessionThreadOverviewTick,
} from "./session-thread-overview-chart";
import type { SessionThreadOverviewStripConfig } from "./session-thread-overview-config";
import { resolveLivelineInputTokenLimit } from "./session-thread-overview-context-limits";
import type { SessionThreadOverviewTimelineEvent } from "./session-thread-overview-events";
import {
	getLivelineCallAtX,
	getLivelineInputAxisMaximum,
} from "./session-thread-overview-liveline-geometry";
import type { SessionOverviewCallSeries } from "./session-thread-overview-model";
import {
	formatCost,
	formatMetricValue,
	getChartX,
	getMetricTotal,
	getPlotBounds,
	getTurnLabel,
	SESSION_OVERVIEW_METRICS,
	SessionOverviewMetricButton,
} from "./session-thread-overview-strip-parts";
import {
	formatTimelineFooterTick,
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

// The plotted value under the hover cursor, appended to the time readout.
// Mirrors the Liveline drawing exactly: step-hold call lookup and the same
// denominator order (trace-reported window, catalog limit, observed peak with
// the signal's 1.12 headroom).
export function SessionOverviewHoverValueLabel({
	config,
	series,
	x,
}: {
	config: SessionThreadOverviewStripConfig;
	series: SessionOverviewCallSeries;
	x: number;
}) {
	const hit = getLivelineCallAtX(series, config, x);
	if (!hit) {
		return null;
	}
	const limit =
		hit.call.modelContextWindow ??
		resolveLivelineInputTokenLimit(hit.call.model) ??
		series.aggregates.largestCallInputTotal * 1.12;
	return (
		<span className="text-(--session-overview-muted)" data-liveline-hover-value>
			{" · "}
			{hit.call.inputTotal.toLocaleString("en-US")}
			{limit > 0
				? ` (${((hit.call.inputTotal / limit) * 100).toFixed(1)}%)`
				: null}
		</span>
	);
}

// The orange selection marker follows the transcript's observed active turn.
// It overlays the chart and extends to the ruler baseline.
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
		<motion.div
			aria-hidden="true"
			animate={{ left: targetLeft }}
			className="pointer-events-none absolute -top-8 bottom-[1.625rem] z-40 flex w-px -translate-x-1/2 flex-col items-center bg-orange-500 text-orange-500 dark:bg-orange-400 dark:text-orange-400"
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
				<path
					d="M3.54688 6L0.515786 0.75L6.57796 0.75L3.54688 6Z"
					fill="currentColor"
				/>
			</svg>
		</motion.div>
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
	config,
	events,
	rulerTicks,
	ticks,
}: {
	config: SessionThreadOverviewStripConfig;
	events: readonly SessionThreadOverviewTimelineEvent[];
	rulerTicks: readonly SessionThreadOverviewTick[];
	ticks: readonly SessionThreadOverviewTick[];
}) {
	const proximityLayerRef = useRef<HTMLDivElement>(null);
	const pointerX = useMotionValue(-1_000);
	const stripWidth = useMotionValue(0);
	const reduceMotion = useReducedMotion() ?? false;
	const lastTick = ticks.at(-1);
	const firstTick = ticks[0];
	const rangeDurationMs =
		lastTick && firstTick ? lastTick.timestamp - firstTick.timestamp : 0;
	const lastTickLabel = lastTick
		? formatTimelineFooterTick(
				lastTick.timestamp,
				firstTick?.timestamp,
				rangeDurationMs,
			)
		: undefined;
	const visibleEvents = events.filter(
		(event) =>
			event.xRatio >= config.xDomainStartRatio &&
			event.xRatio <= config.xDomainEndRatio,
	);
	const eventClusters = new Map<
		string,
		{
			errorEvents: SessionThreadOverviewTimelineEvent[];
			skillEvents: SessionThreadOverviewTimelineEvent[];
			xRatio: number;
		}
	>();
	for (const event of visibleEvents) {
		const clusterKey = event.xRatio.toFixed(6);
		const cluster = eventClusters.get(clusterKey) ?? {
			errorEvents: [],
			skillEvents: [],
			xRatio: event.xRatio,
		};
		if (event.kind === "error") {
			cluster.errorEvents.push(event);
		} else {
			cluster.skillEvents.push(event);
		}
		eventClusters.set(clusterKey, cluster);
	}
	const errorCount = visibleEvents
		.filter((event) => event.kind === "error")
		.reduce((total, event) => total + event.count, 0);
	const skillCount = visibleEvents
		.filter((event) => event.kind === "skill")
		.reduce((total, event) => total + event.count, 0);
	const majorTickRatios = ticks.map((tick) => tick.xRatio);
	const minimumOverlapRatio = 1 / Math.max(config.chartWidth, 1);
	const minorTicks = rulerTicks.filter(
		(tick) =>
			!majorTickRatios.some(
				(xRatio) => Math.abs(xRatio - tick.xRatio) < minimumOverlapRatio,
			),
	);

	function updateProximity(event: PointerEvent<HTMLDivElement>) {
		const bounds = proximityLayerRef.current?.getBoundingClientRect();
		if (!bounds || bounds.width <= 0) {
			return;
		}
		stripWidth.set(bounds.width);
		pointerX.set(event.clientX - bounds.left);
	}

	return (
		<div
			className="flex h-10 shrink-0 flex-col gap-0.5 border-t-[0.5px] border-(--session-overview-border) px-3 pt-1.5 pb-2"
			data-session-overview-axis-strip
			onPointerEnter={updateProximity}
			onPointerLeave={() => pointerX.set(-1_000)}
			onPointerMove={updateProximity}
		>
			<div
				ref={proximityLayerRef}
				className="relative h-2 shrink-0"
				role="img"
				aria-label={`${errorCount.toLocaleString()} errors and ${skillCount.toLocaleString()} skill uses on the timeline`}
			>
				{minorTicks.map((tick) => (
					<SessionOverviewProximityTick
						key={`minor-${tick.timestamp}-${tick.xRatio}`}
						config={config}
						kind="minor"
						pointerX={pointerX}
						reduceMotion={reduceMotion}
						stripWidth={stripWidth}
						tick={tick}
					/>
				))}
				{ticks.map((tick) => (
					<SessionOverviewProximityTick
						key={`major-${tick.timestamp}-${tick.xRatio}`}
						config={config}
						kind="major"
						pointerX={pointerX}
						reduceMotion={reduceMotion}
						stripWidth={stripWidth}
						tick={tick}
					/>
				))}
				{[...eventClusters.entries()].map(([clusterKey, cluster]) => {
					const errorEventCount = cluster.errorEvents.reduce(
						(total, event) => total + event.count,
						0,
					);
					const skillEventCount = cluster.skillEvents.reduce(
						(total, event) => total + event.count,
						0,
					);
					return (
						<span
							key={clusterKey}
							aria-hidden="true"
							className="pointer-events-none absolute inset-y-0 z-10 w-3 -translate-x-1/2"
							style={{
								left: `${(getChartX(cluster.xRatio, config) / config.chartWidth) * 100}%`,
							}}
						>
							<span className="absolute bottom-0 left-1/2 flex -translate-x-1/2 items-end gap-px">
								{errorEventCount > 0 ? (
									<SessionOverviewEventTick
										config={config}
										count={errorEventCount}
										kind="error"
										pointerX={pointerX}
										reduceMotion={reduceMotion}
										stripWidth={stripWidth}
										title={cluster.errorEvents
											.map((event) => event.label)
											.join(", ")}
										xRatio={cluster.xRatio}
									/>
								) : null}
								{skillEventCount > 0 ? (
									<SessionOverviewEventTick
										config={config}
										count={skillEventCount}
										kind="skill"
										pointerX={pointerX}
										reduceMotion={reduceMotion}
										stripWidth={stripWidth}
										title={cluster.skillEvents
											.map((event) => event.label)
											.join(", ")}
										xRatio={cluster.xRatio}
									/>
								) : null}
							</span>
						</span>
					);
				})}
			</div>
			<div className="relative min-h-4 flex-1" aria-hidden="true">
				{ticks.slice(0, -1).map((tick) => {
					const x = getChartX(tick.xRatio, config);
					return (
						<span
							key={tick.timestamp}
							className={cn(
								"absolute top-0 font-sans text-[0.625rem] leading-4 font-normal whitespace-nowrap text-(--session-overview-subtle) tabular-nums",
								tick.xRatio <= 0.02 ? "translate-x-0" : "-translate-x-1/2",
							)}
							style={{ left: `${(x / config.chartWidth) * 100}%` }}
						>
							{formatTimelineFooterTick(
								tick.timestamp,
								firstTick?.timestamp,
								rangeDurationMs,
							)}
						</span>
					);
				})}
				{lastTick && lastTickLabel ? (
					<span
						className="absolute top-0 -translate-x-full font-sans text-[0.625rem] leading-4 font-normal whitespace-nowrap text-(--session-overview-subtle) tabular-nums"
						data-session-overview-axis-end
						style={{
							left: `${(getChartX(lastTick.xRatio, config) / config.chartWidth) * 100}%`,
						}}
					>
						{lastTickLabel}
					</span>
				) : null}
			</div>
		</div>
	);
}

const SESSION_OVERVIEW_PROXIMITY_DISTANCE_LIMIT = 96;

export function transformSessionOverviewRulerScale(
	distance: number,
	intensity: number,
) {
	if (Math.abs(distance) > SESSION_OVERVIEW_PROXIMITY_DISTANCE_LIMIT) {
		return 1;
	}
	const normalizedDistance =
		1 - Math.abs(distance) / SESSION_OVERVIEW_PROXIMITY_DISTANCE_LIMIT;
	return 1 + intensity * normalizedDistance * normalizedDistance;
}

function useSessionOverviewProximityScale({
	config,
	intensity,
	pointerX,
	reduceMotion,
	stripWidth,
	xRatio,
}: {
	config: SessionThreadOverviewStripConfig;
	intensity: number;
	pointerX: MotionValue<number>;
	reduceMotion: boolean;
	stripWidth: MotionValue<number>;
	xRatio: number;
}) {
	const targetScale = useTransform(() => {
		if (reduceMotion) {
			return 1;
		}
		const width = stripWidth.get();
		const cursor = pointerX.get();
		const tickX = (getChartX(xRatio, config) / config.chartWidth) * width;
		return transformSessionOverviewRulerScale(tickX - cursor, intensity);
	});
	return useSpring(targetScale, {
		damping: 45,
		mass: 0.35,
		stiffness: 600,
	});
}

function SessionOverviewEventTick({
	config,
	count,
	kind,
	pointerX,
	reduceMotion,
	stripWidth,
	title,
	xRatio,
}: {
	config: SessionThreadOverviewStripConfig;
	count: number;
	kind: "error" | "skill";
	pointerX: MotionValue<number>;
	reduceMotion: boolean;
	stripWidth: MotionValue<number>;
	title: string;
	xRatio: number;
}) {
	const scaleY = useSessionOverviewProximityScale({
		config,
		intensity: 0.35,
		pointerX,
		reduceMotion,
		stripWidth,
		xRatio,
	});

	return (
		<motion.span
			className={cn(
				"h-[10.6667px] w-[1.5px] origin-bottom",
				kind === "error"
					? "bg-red-600 dark:bg-red-400"
					: "bg-(--session-overview-accent)",
			)}
			data-count={count}
			data-session-overview-event={kind}
			style={{ scaleY }}
			title={title}
		/>
	);
}

function SessionOverviewProximityTick({
	config,
	kind,
	pointerX,
	reduceMotion,
	stripWidth,
	tick,
}: {
	config: SessionThreadOverviewStripConfig;
	kind: "major" | "minor";
	pointerX: MotionValue<number>;
	reduceMotion: boolean;
	stripWidth: MotionValue<number>;
	tick: SessionThreadOverviewTick;
}) {
	const scaleY = useSessionOverviewProximityScale({
		config,
		intensity: kind === "major" ? 0.35 : 0.75,
		pointerX,
		reduceMotion,
		stripWidth,
		xRatio: tick.xRatio,
	});

	return (
		<motion.span
			aria-hidden="true"
			className={cn(
				"absolute bottom-0 w-[0.5px] -translate-x-1/2 origin-bottom",
				kind === "major"
					? "h-[10.6667px] bg-[color-mix(in_srgb,var(--session-overview-text)_44%,var(--session-overview-surface))]"
					: "h-2 bg-[color-mix(in_srgb,var(--session-overview-text)_24%,var(--session-overview-surface))]",
			)}
			data-session-overview-ruler-tick
			data-ruler-kind={kind}
			data-timestamp={new Date(tick.timestamp).toISOString()}
			style={{
				left: `${(getChartX(tick.xRatio, config) / config.chartWidth) * 100}%`,
				scaleY,
			}}
		/>
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
