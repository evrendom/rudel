import {
	type KeyboardEvent,
	type PointerEvent,
	useId,
	useMemo,
	useRef,
	useState,
} from "react";
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
import { getNearestLivelineCallAtX } from "./session-thread-overview-liveline-geometry";
import {
	buildSessionOverviewCallSeries,
	resolveSessionOverviewHoverTimestamp,
} from "./session-thread-overview-model";
import {
	getChartRatioAtX,
	getChartX,
	getPlotBounds,
	getSessionOverviewViewportLayout,
	type SessionOverviewHover,
} from "./session-thread-overview-strip-utils";
import { SessionThreadOverviewStripView } from "./session-thread-overview-strip-view";
import { buildSessionThreadOverviewClockTicks } from "./session-thread-overview-timeline";
import {
	getSessionOverviewZoomAnchor,
	getSessionOverviewZoomLevel,
	SESSION_OVERVIEW_ZOOM_STEP,
	zoomSessionOverviewWindowAt,
} from "./session-thread-overview-zoom";
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
	const reportedViewport = getSessionThreadOverviewViewport(
		chart.rows,
		visibleRange,
	);
	const viewport =
		reportedViewport ??
		(selectedRow
			? { xEndRatio: selectedRow.xRatio, xStartRatio: selectedRow.xRatio }
			: undefined);
	const { viewportStartX, viewportWidth } = getSessionOverviewViewportLayout(
		viewport,
		resolvedConfig,
	);
	const focusedRow =
		focusedIndex === undefined
			? undefined
			: chart.rows.find((row) => row.index === focusedIndex);
	const readout = hover ?? focusedRow;
	const markerRatio = focusedRow?.xRatio ?? selectedRatio;
	const readoutTimestampAtCursor = readout
		? chart.unprojectRatio(readout.xRatio)
		: undefined;
	const readoutCall = readout
		? getNearestLivelineCallAtX(
				callSeries,
				resolvedConfig,
				getChartX(readout.xRatio, resolvedConfig),
			)
		: undefined;
	const readoutTimestamp = resolveSessionOverviewHoverTimestamp(
		readoutCall?.call,
		readoutTimestampAtCursor,
	);
	const readoutElapsedMs =
		readoutTimestamp !== undefined && chart.axisStartTimestamp !== undefined
			? readoutTimestamp - chart.axisStartTimestamp
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
		const index =
			xRatio === undefined
				? undefined
				: getSessionThreadOverviewIndexAtRatio(chart.rows, xRatio);
		if (index !== undefined && xRatio !== undefined) {
			setHover({ index, xRatio });
		}
	}

	function scrubAtPointer(event: PointerEvent<HTMLDivElement>) {
		const xRatio = getPointerRatio(event.clientX);
		const index =
			xRatio === undefined
				? undefined
				: getSessionThreadOverviewIndexAtRatio(chart.rows, xRatio);
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
		<SessionThreadOverviewStripView
			callSeries={callSeries}
			chart={chart}
			chartPlotRef={chartPlotRef}
			footerTicks={footerTicks}
			hasViewport={viewport !== undefined}
			markerRatio={markerRatio}
			onPointerLeave={() => setHover(undefined)}
			onPointerMove={updateHoverAtPointer}
			onSelect={onSelect}
			onViewportKeyDown={handleViewportKeyDown}
			onViewportPointerDown={(event) => {
				event.preventDefault();
				event.currentTarget.setPointerCapture(event.pointerId);
				scrubAtPointer(event);
			}}
			onViewportPointerMove={(event) => {
				if (event.currentTarget.hasPointerCapture(event.pointerId)) {
					scrubAtPointer(event);
				}
			}}
			onWheel={(event) =>
				handleSessionOverviewZoomWheel(event, {
					enabled: true,
					plotWidth: chartPlotRef.current?.getBoundingClientRect().width,
					setZoomWindow,
					zoomAnchorRatio,
					zoomLevel,
				})
			}
			onZoomIn={() => zoomAt(zoomAnchorRatio, SESSION_OVERVIEW_ZOOM_STEP)}
			onZoomOut={() => zoomAt(zoomAnchorRatio, 1 / SESSION_OVERVIEW_ZOOM_STEP)}
			options={options}
			plotLeft={plotLeft}
			plotRight={plotRight}
			readout={readout}
			readoutCall={readoutCall}
			readoutElapsedMs={readoutElapsedMs}
			readoutId={readoutId}
			readoutTimestamp={readoutTimestamp}
			resolvedConfig={resolvedConfig}
			rulerTicks={rulerTicks}
			selectedIndex={selectedIndex}
			setFocusedIndex={setFocusedIndex}
			timelineEvents={timelineEvents}
			tokenGradientId={tokenGradientId}
			viewportStartX={viewportStartX}
			viewportWidth={viewportWidth}
			visibleAxisEndTimestamp={visibleAxisEndTimestamp}
			visibleAxisStartTimestamp={visibleAxisStartTimestamp}
			zoomLevel={zoomLevel}
		/>
	);
}
