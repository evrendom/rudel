import type {
	Dispatch,
	KeyboardEvent,
	MouseEvent,
	PointerEvent,
	RefObject,
	SetStateAction,
	WheelEvent,
} from "react";
import type { buildSessionThreadOverviewChart } from "./session-thread-overview-chart";
import type { SessionThreadOverviewStripConfig } from "./session-thread-overview-config";
import { SessionThreadOverviewEventDots } from "./session-thread-overview-event-dots";
import type { buildSessionThreadOverviewTimelineEvents } from "./session-thread-overview-events";
import { SessionThreadOverviewHoverCard } from "./session-thread-overview-hover-card";
import type { SessionOverviewLivelineCallHit } from "./session-thread-overview-liveline-geometry";
import type { buildSessionOverviewCallSeries } from "./session-thread-overview-model";
import {
	SessionOverviewCallMarker,
	SessionOverviewTimelineFooter,
	SessionOverviewTurnHitTargets,
} from "./session-thread-overview-strip-layers";
import {
	getChartX,
	getTurnLabel,
	type SessionOverviewHover,
} from "./session-thread-overview-strip-utils";
import type { buildSessionThreadOverviewClockTicks } from "./session-thread-overview-timeline";
import { SessionThreadOverviewTokenLayer } from "./session-thread-overview-token-layer";
import type { SessionOverviewZoomWindow } from "./session-thread-overview-zoom";
import { SessionOverviewZoomSelectionBand } from "./session-thread-overview-zoom-selection";
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
	hasViewport,
	markerRatio,
	onClickCapture,
	onPointerLeave,
	onPointerCancel,
	onPointerDown,
	onPointerMove,
	onPointerUp,
	onResetZoom,
	onSelect,
	onZoomSelectionConfirm,
	onViewportKeyDown,
	onViewportPointerDown,
	onViewportPointerMove,
	onWheel,
	options,
	plotLeft,
	plotRight,
	readout,
	readoutCall,
	readoutId,
	readoutTimestamp,
	resolvedConfig,
	selectedIndex,
	setFocusedIndex,
	timelineEvents,
	tokenGradientId,
	viewportStartX,
	viewportWidth,
	zoomSelection,
	zoomSelectionIsDraft,
}: {
	callSeries: CallSeries;
	chart: Chart;
	chartPlotRef: RefObject<HTMLDivElement | null>;
	footerTicks: TimelineTicks;
	hasViewport: boolean;
	markerRatio: number | undefined;
	onClickCapture: (event: MouseEvent<HTMLDivElement>) => void;
	onPointerCancel: (event: PointerEvent<HTMLDivElement>) => void;
	onPointerLeave: () => void;
	onPointerDown: (event: PointerEvent<HTMLDivElement>) => void;
	onPointerMove: (event: PointerEvent<HTMLDivElement>) => void;
	onPointerUp: (event: PointerEvent<HTMLDivElement>) => void;
	onResetZoom: (() => void) | undefined;
	onSelect: (index: number) => void;
	onZoomSelectionConfirm: () => void;
	onViewportKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
	onViewportPointerDown: (event: PointerEvent<HTMLDivElement>) => void;
	onViewportPointerMove: (event: PointerEvent<HTMLDivElement>) => void;
	onWheel: (event: WheelEvent<HTMLDivElement>) => void;
	options: readonly SessionTurnTablePaneOption[];
	plotLeft: number;
	plotRight: number;
	readout: SessionOverviewHover | undefined;
	readoutCall: SessionOverviewLivelineCallHit | undefined;
	readoutId: string;
	readoutTimestamp: number | undefined;
	resolvedConfig: SessionThreadOverviewStripConfig;
	selectedIndex: number;
	setFocusedIndex: Dispatch<SetStateAction<number | undefined>>;
	timelineEvents: TimelineEvents;
	tokenGradientId: string;
	viewportStartX: number;
	viewportWidth: number;
	zoomSelection: SessionOverviewZoomWindow | undefined;
	zoomSelectionIsDraft: boolean;
}) {
	const selectedOption = options[selectedIndex];
	return (
		<section
			aria-label="Session activity map (input context)"
			className="@container h-[4.07rem] shrink-0 border-b border-(--session-overview-border) bg-(--session-overview-chart-surface) [--session-overview-chart-surface:#fcfcfc] dark:[--session-overview-chart-surface:var(--session-overview-surface)]"
		>
			<div className="relative flex h-[4.07rem] min-w-0 flex-col overflow-visible bg-(--session-overview-chart-surface)">
				{zoomSelectionIsDraft ? null : (
					<SessionThreadOverviewHoverCard
						chart={chart}
						config={resolvedConfig}
						events={timelineEvents}
						hit={readoutCall}
						onZoomSelectionConfirm={onZoomSelectionConfirm}
						readout={readout}
						readoutId={readoutId}
						series={callSeries}
						timestamp={readoutTimestamp}
						zoomSelection={zoomSelection}
					/>
				)}
				<div
					className="relative h-[2.57rem] min-w-0 touch-pan-y cursor-crosshair overflow-hidden"
					onClickCapture={onClickCapture}
					onPointerCancel={onPointerCancel}
					onPointerDown={onPointerDown}
					onPointerLeave={onPointerLeave}
					onPointerMove={onPointerMove}
					onPointerUp={onPointerUp}
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
						<SessionThreadOverviewEventDots
							config={resolvedConfig}
							events={timelineEvents}
							series={callSeries}
						/>
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
								className="absolute top-0.5 bottom-3.5 z-20 cursor-crosshair touch-none rounded-[2px] outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--session-overview-accent)"
								data-session-overview-viewport-band
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
						{zoomSelection ? (
							<SessionOverviewZoomSelectionBand
								config={resolvedConfig}
								selection={zoomSelection}
							/>
						) : null}
					</div>
				</div>
				<SessionOverviewTimelineFooter
					onResetZoom={onResetZoom}
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
