import {
	type KeyboardEvent,
	type PointerEvent,
	useId,
	useMemo,
	useRef,
	useState,
} from "react";
import { cn } from "@/lib/utils";
import {
	buildSessionThreadOverviewChart,
	getSessionThreadOverviewIndexAtRatio,
	getSessionThreadOverviewViewport,
} from "./session-thread-overview-chart";
import {
	getSessionThreadOverviewTimelineSettings,
	resolveSessionThreadOverviewStripConfig,
	type SessionThreadOverviewStripConfig,
} from "./session-thread-overview-config";
import { buildSessionThreadOverviewTimelineEvents } from "./session-thread-overview-events";
import {
	buildSessionOverviewCallSeries,
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
	getChartRatioAtX,
	getChartX,
	getPlotBounds,
	getSessionOverviewViewportLayout,
	getTurnLabel,
	type SessionOverviewHover,
} from "./session-thread-overview-strip-parts";
import { formatTimelineMoment } from "./session-thread-overview-time-format";
import { buildSessionThreadOverviewClockTicks } from "./session-thread-overview-timeline";
import { SessionThreadOverviewTokenLayer } from "./session-thread-overview-token-layer";
import {
	getSessionOverviewZoomAnchor,
	getSessionOverviewZoomLevel,
	SESSION_OVERVIEW_MAX_ZOOM_LEVEL,
	SESSION_OVERVIEW_ZOOM_STEP,
	zoomSessionOverviewWindowAt,
} from "./session-thread-overview-zoom";
import { SessionThreadOverviewZoomControls } from "./session-thread-overview-zoom-controls";
import { handleSessionOverviewZoomWheel } from "./session-thread-overview-zoom-interactions";
import type { SessionTurnTablePaneOption } from "./session-turn-table-pane";
import { useSessionThreadOverviewZoom } from "./use-session-thread-overview-zoom";

const SESSION_OVERVIEW_PLOT_HEIGHT_SCALE = 0.51;

// The canonical session activity map. It plots model calls on the session
// timescale and lets the user inspect input context usage.
export function SessionThreadOverviewStrip({
	config,
	onSelect,
	options,
	selectedIndex,
	visibleRange,
}: {
	config?: Partial<SessionThreadOverviewStripConfig>;
	onSelect: (index: number) => void;
	options: readonly SessionTurnTablePaneOption[];
	selectedIndex: number;
	visibleRange: readonly [number, number] | undefined;
}) {
	const readoutId = useId();
	const tokenGradientId = useId();
	const chartPlotRef = useRef<HTMLDivElement>(null);
	// The axis sits low so the activity signal can use nearly the full plot.
	const baseConfig = useMemo(
		() =>
			resolveSessionThreadOverviewStripConfig({
				axisY: 74 * SESSION_OVERVIEW_PLOT_HEIGHT_SCALE,
				chartHeight: 80 * SESSION_OVERVIEW_PLOT_HEIGHT_SCALE,
				chartWidth: 615,
				eventY: 68 * SESSION_OVERVIEW_PLOT_HEIGHT_SCALE,
				maxBarHeight: 70 * SESSION_OVERVIEW_PLOT_HEIGHT_SCALE,
				plotPadding: 0,
				...config,
			}),
		[config],
	);
	const chartOptions = useMemo(
		() =>
			options.map((option) => ({
				...option,
				reasoningCount: 0,
				subagentCount: 0,
			})),
		[options],
	);
	const chart = useMemo(
		() =>
			buildSessionThreadOverviewChart(
				chartOptions,
				[],
				getSessionThreadOverviewTimelineSettings(baseConfig),
			),
		[baseConfig, chartOptions],
	);
	const selectedRow = chart.rows.find((row) => row.index === selectedIndex);
	const selectedRatio = selectedRow?.xRatio;
	const { setZoomWindow, zoomWindow } =
		useSessionThreadOverviewZoom(selectedRatio);
	const resolvedConfig = useMemo(
		() => ({
			...baseConfig,
			xDomainEndRatio: zoomWindow.xEndRatio,
			xDomainStartRatio: zoomWindow.xStartRatio,
		}),
		[baseConfig, zoomWindow],
	);
	const { plotLeft, plotRight } = getPlotBounds(resolvedConfig);
	const [hover, setHover] = useState<SessionOverviewHover | undefined>();
	const [focusedIndex, setFocusedIndex] = useState<number | undefined>();
	const callSeries = useMemo(
		() =>
			buildSessionOverviewCallSeries(
				chart.rows,
				(rowIndex) => options[rowIndex]?.metrics.usageEvents ?? [],
			),
		[chart.rows, options],
	);
	const selectedOption = options[selectedIndex];
	const reportedViewport = getSessionThreadOverviewViewport(
		chart.rows,
		visibleRange,
	);
	const viewport =
		reportedViewport ??
		(selectedRow
			? {
					xEndRatio: selectedRow.xRatio,
					xStartRatio: selectedRow.xRatio,
				}
			: undefined);
	const { viewportStartX, viewportWidth } = getSessionOverviewViewportLayout(
		viewport,
		resolvedConfig,
	);
	const readout =
		hover ??
		(focusedIndex === undefined
			? undefined
			: (() => {
					const focusedRow = chart.rows.find(
						(row) => row.index === focusedIndex,
					);
					return focusedRow
						? { index: focusedRow.index, xRatio: focusedRow.xRatio }
						: undefined;
				})());
	const focusedRow =
		focusedIndex === undefined
			? undefined
			: chart.rows.find((row) => row.index === focusedIndex);
	const markerRatio = focusedRow?.xRatio ?? selectedRatio;
	const hoverTimestamp = hover ? chart.unprojectRatio(hover.xRatio) : undefined;
	const hoverElapsedMs =
		hoverTimestamp !== undefined && chart.axisStartTimestamp !== undefined
			? hoverTimestamp - chart.axisStartTimestamp
			: undefined;
	const visibleAxisStartTimestamp = chart.unprojectRatio(
		zoomWindow.xStartRatio,
	);
	const visibleAxisEndTimestamp = chart.unprojectRatio(zoomWindow.xEndRatio);
	const zoomLevel = getSessionOverviewZoomLevel(zoomWindow);
	const zoomAnchorRatio = getSessionOverviewZoomAnchor(
		zoomWindow,
		selectedRatio,
	);
	const footerTicks = useMemo(
		() =>
			buildSessionThreadOverviewClockTicks(chart, {
				includeBounds: true,
				minimumSpacingRatio: 0.12,
				targetTickCount: 6,
				xEndRatio: zoomWindow.xEndRatio,
				xStartRatio: zoomWindow.xStartRatio,
			}),
		[chart, zoomWindow],
	);
	const rulerTicks = useMemo(
		() =>
			buildSessionThreadOverviewClockTicks(chart, {
				includeBounds: false,
				targetTickCount: Math.max(Math.round(baseConfig.chartWidth / 6), 40),
				xEndRatio: zoomWindow.xEndRatio,
				xStartRatio: zoomWindow.xStartRatio,
			}),
		[baseConfig.chartWidth, chart, zoomWindow],
	);
	const timelineEvents = useMemo(
		() => buildSessionThreadOverviewTimelineEvents(chart, options),
		[chart, options],
	);

	function getPointerRatio(clientX: number) {
		const bounds = chartPlotRef.current?.getBoundingClientRect();
		if (!bounds || bounds.width <= 0) {
			return undefined;
		}
		return getChartRatioAtX(
			((clientX - bounds.left) / bounds.width) * resolvedConfig.chartWidth,
			resolvedConfig,
		);
	}

	function updateHoverAtPointer(event: PointerEvent<HTMLDivElement>) {
		if (!resolvedConfig.showCrosshair) {
			return;
		}
		const xRatio = getPointerRatio(event.clientX);
		if (xRatio === undefined) {
			return;
		}
		const index = getSessionThreadOverviewIndexAtRatio(chart.rows, xRatio);
		if (index !== undefined) {
			setHover({ index, xRatio });
		}
	}

	function scrubAtPointer(event: PointerEvent<HTMLDivElement>) {
		const xRatio = getPointerRatio(event.clientX);
		if (xRatio === undefined) {
			return;
		}
		const index = getSessionThreadOverviewIndexAtRatio(chart.rows, xRatio);
		if (index !== undefined) {
			onSelect(index);
		}
	}

	function zoomAt(anchorRatio: number, zoomFactor: number) {
		setZoomWindow((currentWindow) =>
			zoomSessionOverviewWindowAt(currentWindow, anchorRatio, zoomFactor),
		);
	}

	function handleViewportKeyDown(event: KeyboardEvent<HTMLDivElement>) {
		if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
			return;
		}
		event.preventDefault();
		onSelect(
			Math.min(
				Math.max(selectedIndex + (event.key === "ArrowRight" ? 1 : -1), 0),
				Math.max(chart.rows.length - 1, 0),
			),
		);
	}

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
								config={resolvedConfig}
								series={callSeries}
								x={getChartX(hover.xRatio, resolvedConfig)}
							/>
						</div>
					) : null}
					<div className="absolute inset-y-0 right-0 z-40 flex items-center gap-2">
						<SessionThreadOverviewZoomControls
							canZoomIn={zoomLevel < SESSION_OVERVIEW_MAX_ZOOM_LEVEL - 0.001}
							canZoomOut={zoomLevel > 1.001}
							onZoomIn={() =>
								zoomAt(zoomAnchorRatio, SESSION_OVERVIEW_ZOOM_STEP)
							}
							onZoomOut={() =>
								zoomAt(zoomAnchorRatio, 1 / SESSION_OVERVIEW_ZOOM_STEP)
							}
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
					onPointerLeave={() => setHover(undefined)}
					onPointerMove={updateHoverAtPointer}
					onWheel={(event) =>
						handleSessionOverviewZoomWheel(event, {
							enabled: true,
							plotWidth: chartPlotRef.current?.getBoundingClientRect().width,
							setZoomWindow,
							zoomAnchorRatio,
							zoomLevel,
						})
					}
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

						{resolvedConfig.showViewportBand && viewport ? (
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
								onKeyDown={handleViewportKeyDown}
								onPointerDown={(event) => {
									event.preventDefault();
									event.currentTarget.setPointerCapture(event.pointerId);
									scrubAtPointer(event);
								}}
								onPointerMove={(event) => {
									if (event.currentTarget.hasPointerCapture(event.pointerId)) {
										scrubAtPointer(event);
									}
								}}
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
