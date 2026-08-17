import type {
	Dispatch,
	KeyboardEvent,
	PointerEvent,
	RefObject,
	SetStateAction,
	WheelEvent,
} from "react";
import { cn } from "@/lib/utils";
import type { buildSessionThreadOverviewChart } from "./session-thread-overview-chart";
import type { SessionThreadOverviewStripConfig } from "./session-thread-overview-config";
import type { buildSessionThreadOverviewTimelineEvents } from "./session-thread-overview-events";
import type { SessionOverviewLivelineCallHit } from "./session-thread-overview-liveline-geometry";
import type { buildSessionOverviewCallSeries } from "./session-thread-overview-model";
import {
	formatElapsedSinceStart,
	formatTimelineMomentWithSeconds,
} from "./session-thread-overview-model";
import {
	SessionOverviewCallMarker,
	SessionOverviewHoverValueLabel,
	SessionOverviewTimelineFooter,
	SessionOverviewTurnHitTargets,
} from "./session-thread-overview-strip-layers";
import {
	getChartX,
	getTurnLabel,
	type SessionOverviewHover,
} from "./session-thread-overview-strip-utils";
import { formatTimelineMoment } from "./session-thread-overview-time-format";
import type { buildSessionThreadOverviewClockTicks } from "./session-thread-overview-timeline";
import { SessionThreadOverviewTokenLayer } from "./session-thread-overview-token-layer";
import { SESSION_OVERVIEW_MAX_ZOOM_LEVEL } from "./session-thread-overview-zoom";
import { SessionThreadOverviewZoomControls } from "./session-thread-overview-zoom-controls";
import type { SessionTurnTablePaneOption } from "./session-turn-table-pane";

type Chart = ReturnType<typeof buildSessionThreadOverviewChart>;
type CallSeries = ReturnType<typeof buildSessionOverviewCallSeries>;
type TimelineEvents = ReturnType<
	typeof buildSessionThreadOverviewTimelineEvents
>;
type TimelineTicks = ReturnType<typeof buildSessionThreadOverviewClockTicks>;

export function SessionThreadOverviewStripView({
	callSeries,
	chart,
	chartPlotRef,
	footerTicks,
	hover,
	hoverElapsedMs,
	hoveredCall,
	hoverTimestamp,
	hasViewport,
	markerRatio,
	onPointerLeave,
	onPointerMove,
	onSelect,
	onViewportKeyDown,
	onViewportPointerDown,
	onViewportPointerMove,
	onWheel,
	onZoomIn,
	onZoomOut,
	options,
	plotLeft,
	plotRight,
	readout,
	readoutId,
	resolvedConfig,
	rulerTicks,
	selectedIndex,
	setFocusedIndex,
	timelineEvents,
	tokenGradientId,
	viewportStartX,
	viewportWidth,
	visibleAxisEndTimestamp,
	visibleAxisStartTimestamp,
	zoomLevel,
}: {
	callSeries: CallSeries;
	chart: Chart;
	chartPlotRef: RefObject<HTMLDivElement | null>;
	footerTicks: TimelineTicks;
	hover: SessionOverviewHover | undefined;
	hoverElapsedMs: number | undefined;
	hoveredCall: SessionOverviewLivelineCallHit | undefined;
	hoverTimestamp: number | undefined;
	hasViewport: boolean;
	markerRatio: number | undefined;
	onPointerLeave: () => void;
	onPointerMove: (event: PointerEvent<HTMLDivElement>) => void;
	onSelect: (index: number) => void;
	onViewportKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
	onViewportPointerDown: (event: PointerEvent<HTMLDivElement>) => void;
	onViewportPointerMove: (event: PointerEvent<HTMLDivElement>) => void;
	onWheel: (event: WheelEvent<HTMLDivElement>) => void;
	onZoomIn: () => void;
	onZoomOut: () => void;
	options: readonly SessionTurnTablePaneOption[];
	plotLeft: number;
	plotRight: number;
	readout: SessionOverviewHover | undefined;
	readoutId: string;
	resolvedConfig: SessionThreadOverviewStripConfig;
	rulerTicks: TimelineTicks;
	selectedIndex: number;
	setFocusedIndex: Dispatch<SetStateAction<number | undefined>>;
	timelineEvents: TimelineEvents;
	tokenGradientId: string;
	viewportStartX: number;
	viewportWidth: number;
	visibleAxisEndTimestamp: number | undefined;
	visibleAxisStartTimestamp: number | undefined;
	zoomLevel: number;
}) {
	const selectedOption = options[selectedIndex];
	return (
		<section
			aria-label="Session activity map (input context)"
			className="@container h-[6.57rem] shrink-0 border-b border-(--session-overview-border) bg-(--session-overview-surface)"
		>
			<div
				id={readoutId}
				className="relative h-6 shrink-0 border-b border-(--session-overview-border)"
			>
				<div className="absolute inset-y-0 left-3 right-3">
					{visibleAxisStartTimestamp !== undefined ? (
						<span
							className={cn(
								"absolute top-1/2 left-0 -translate-y-1/2 font-mono text-[0.5625rem] whitespace-nowrap text-(--session-overview-subtle) tabular-nums transition-opacity duration-150 motion-reduce:transition-none",
								hover && "opacity-0",
							)}
						>
							{formatTimelineMoment(visibleAxisStartTimestamp)}
						</span>
					) : null}
					{hover && hoverTimestamp !== undefined ? (
						<div
							aria-hidden="true"
							className="pointer-events-none absolute top-1/2 z-40 -translate-x-1/2 -translate-y-1/2 bg-(--session-overview-surface) px-1 font-mono text-[0.5625rem] font-medium whitespace-nowrap text-(--session-overview-text) tabular-nums"
							style={{
								left: `${(Math.min(Math.max(getChartX(hover.xRatio, resolvedConfig), 70), resolvedConfig.chartWidth - 70) / resolvedConfig.chartWidth) * 100}%`,
							}}
						>
							{formatTimelineMomentWithSeconds(hoverTimestamp)}
							{hoverElapsedMs !== undefined ? (
								<span className="text-(--session-overview-muted)">
									{" "}
									{formatElapsedSinceStart(hoverElapsedMs)}
								</span>
							) : null}
							<SessionOverviewHoverValueLabel
								hit={hoveredCall}
								series={callSeries}
							/>
						</div>
					) : null}
					<div className="absolute inset-y-0 right-0 z-40 flex items-center gap-2">
						<SessionThreadOverviewZoomControls
							canZoomIn={zoomLevel < SESSION_OVERVIEW_MAX_ZOOM_LEVEL - 0.001}
							canZoomOut={zoomLevel > 1.001}
							onZoomIn={onZoomIn}
							onZoomOut={onZoomOut}
							zoomLevel={zoomLevel}
						/>
						{visibleAxisEndTimestamp !== undefined ? (
							<span
								className={cn(
									"font-mono text-[0.5625rem] whitespace-nowrap text-(--session-overview-subtle) tabular-nums transition-opacity duration-150 motion-reduce:transition-none",
									hover && "opacity-0",
								)}
							>
								{formatTimelineMoment(visibleAxisEndTimestamp)}
							</span>
						) : null}
					</div>
				</div>
			</div>

			<div className="relative flex h-[5.07rem] min-w-0 flex-col overflow-hidden bg-(--session-overview-surface)">
				<div
					className="relative h-[2.57rem] min-w-0 overflow-hidden"
					onPointerLeave={onPointerLeave}
					onPointerMove={onPointerMove}
					onWheel={onWheel}
				>
					<div ref={chartPlotRef} className="absolute inset-0">
						<svg
							aria-hidden="true"
							className="h-full w-full"
							preserveAspectRatio="none"
							viewBox={`0 0 ${resolvedConfig.chartWidth} ${resolvedConfig.chartHeight}`}
						>
							<SessionThreadOverviewTokenLayer
								breaks={chart.breaks}
								config={resolvedConfig}
								gradientId={tokenGradientId}
								plotLeft={plotLeft}
								plotRight={plotRight}
								series={callSeries}
							/>
							{resolvedConfig.showCrosshair && readout ? (
								<path
									d={`M ${getChartX(readout.xRatio, resolvedConfig)} 2 V ${resolvedConfig.eventY + 5}`}
									className="stroke-[color-mix(in_srgb,var(--session-overview-text)_28%,transparent)]"
									vectorEffect="non-scaling-stroke"
								/>
							) : null}
						</svg>
						<SessionOverviewTurnHitTargets
							config={resolvedConfig}
							onFocusIndexChange={setFocusedIndex}
							onSelect={onSelect}
							options={options}
							readoutId={readoutId}
							readoutIndex={readout?.index}
							rows={chart.rows}
							selectedIndex={selectedIndex}
						/>
						{resolvedConfig.showViewportBand && hasViewport ? (
							<div
								role="slider"
								aria-label="Visible transcript range"
								aria-valuemax={Math.max(chart.rows.length - 1, 0)}
								aria-valuemin={0}
								aria-valuenow={selectedIndex}
								aria-valuetext={
									selectedOption
										? getTurnLabel(selectedOption)
										: "Session start"
								}
								className="absolute top-0.5 bottom-3.5 z-20 cursor-ew-resize touch-none rounded-[2px] outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--session-overview-accent)"
								style={{
									left: `${(viewportStartX / resolvedConfig.chartWidth) * 100}%`,
									width: `${(viewportWidth / resolvedConfig.chartWidth) * 100}%`,
								}}
								tabIndex={0}
								onKeyDown={onViewportKeyDown}
								onPointerDown={onViewportPointerDown}
								onPointerMove={onViewportPointerMove}
							/>
						) : null}
					</div>
				</div>
				<SessionOverviewTimelineFooter
					config={resolvedConfig}
					events={timelineEvents}
					rulerTicks={resolvedConfig.showTicks ? rulerTicks : []}
					ticks={resolvedConfig.showTicks ? footerTicks : []}
				/>
				<SessionOverviewCallMarker
					config={resolvedConfig}
					selectedXRatio={markerRatio}
				/>
			</div>
		</section>
	);
}
