import {
	type KeyboardEvent,
	type MouseEvent,
	type PointerEvent,
	useId,
	useMemo,
	useRef,
	useState,
} from "react";
import { resolveSessionOverviewHoverAtRatio } from "./session-thread-overview-call-activity";
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
	resolveSessionOverviewHoverTimestamp,
} from "./session-thread-overview-model";
import {
	getChartRatioAtX,
	getPlotBounds,
	getSessionOverviewViewportLayout,
	type SessionOverviewHover,
} from "./session-thread-overview-strip-utils";
import { SessionThreadOverviewStripView } from "./session-thread-overview-strip-view";
import { buildSessionThreadOverviewClockTicks } from "./session-thread-overview-timeline";
import {
	DEFAULT_SESSION_OVERVIEW_ZOOM_WINDOW,
	getSessionOverviewZoomAnchor,
	getSessionOverviewZoomLevel,
	getSessionOverviewZoomSelection,
	getSessionOverviewZoomWindowFromSelection,
	type SessionOverviewZoomWindow,
} from "./session-thread-overview-zoom";
import { handleSessionOverviewZoomWheel } from "./session-thread-overview-zoom-interactions";
import type { SessionTurnTablePaneOption } from "./session-turn-table-pane";
import { useSessionThreadOverviewZoom } from "./use-session-thread-overview-zoom";

const SESSION_OVERVIEW_PLOT_HEIGHT_SCALE = 0.51;
const SESSION_OVERVIEW_ZOOM_DRAG_THRESHOLD_PX = 6;

type SessionOverviewZoomDrag = {
	hasCrossedThreshold: boolean;
	pointerId: number;
	startClientX: number;
	startRatio: number;
};

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
				plotPadding: 0,
				...config,
			}),
		[config],
	);
	const chart = useMemo(
		() =>
			buildSessionThreadOverviewChart(
				options,
				getSessionThreadOverviewTimelineSettings(baseConfig),
			),
		[baseConfig, options],
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
	const [hoverRatio, setHoverRatio] = useState<number | undefined>();
	const [focusedIndex, setFocusedIndex] = useState<number | undefined>();
	const [draftZoomSelection, setDraftZoomSelection] = useState<
		SessionOverviewZoomWindow | undefined
	>();
	const [pendingZoomSelection, setPendingZoomSelection] = useState<
		SessionOverviewZoomWindow | undefined
	>();
	const zoomDragRef = useRef<SessionOverviewZoomDrag | undefined>(undefined);
	const suppressClickUntilRef = useRef(0);
	const callSeries = useMemo(
		() =>
			buildSessionOverviewCallSeries(
				chart.rows,
				(rowIndex) => options[rowIndex]?.metrics.usageEvents ?? [],
			),
		[chart.rows, options],
	);
	const timelineEvents = useMemo(
		() => buildSessionThreadOverviewTimelineEvents(chart, options),
		[chart, options],
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
	const readoutRatio = hoverRatio ?? focusedRow?.xRatio;
	const readout: SessionOverviewHover | undefined =
		readoutRatio === undefined
			? undefined
			: resolveSessionOverviewHoverAtRatio(
					chart.rows,
					timelineEvents,
					callSeries,
					resolvedConfig,
					readoutRatio,
				);
	const markerRatio = focusedRow?.xRatio ?? selectedRatio;
	const readoutTimestampAtCursor = readout
		? chart.unprojectRatio(readout.xRatio)
		: undefined;
	const readoutCall = readout?.kind === "call" ? readout.hit : undefined;
	const readoutTimestamp = resolveSessionOverviewHoverTimestamp(
		readoutCall?.call,
		readoutTimestampAtCursor,
	);
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
		if (xRatio !== undefined) {
			setHoverRatio(xRatio);
		}
	}

	function handlePlotPointerDown(event: PointerEvent<HTMLDivElement>) {
		const target = event.target;
		if (
			!event.isPrimary ||
			event.button !== 0 ||
			(target instanceof Element &&
				target.closest("[data-session-overview-viewport-band]"))
		) {
			return;
		}

		const startRatio = getPointerRatio(event.clientX);
		if (startRatio === undefined) {
			return;
		}
		event.currentTarget.setPointerCapture(event.pointerId);
		zoomDragRef.current = {
			hasCrossedThreshold: false,
			pointerId: event.pointerId,
			startClientX: event.clientX,
			startRatio,
		};
		setDraftZoomSelection(undefined);
		setPendingZoomSelection(undefined);
	}

	function handlePlotPointerMove(event: PointerEvent<HTMLDivElement>) {
		const drag = zoomDragRef.current;
		if (!drag || drag.pointerId !== event.pointerId) {
			updateHoverAtPointer(event);
			return;
		}

		const currentRatio = getPointerRatio(event.clientX);
		if (currentRatio === undefined) {
			return;
		}
		if (
			!drag.hasCrossedThreshold &&
			Math.abs(event.clientX - drag.startClientX) <
				SESSION_OVERVIEW_ZOOM_DRAG_THRESHOLD_PX
		) {
			updateHoverAtPointer(event);
			return;
		}

		drag.hasCrossedThreshold = true;
		event.preventDefault();
		setHoverRatio(undefined);
		setDraftZoomSelection(
			getSessionOverviewZoomSelection(drag.startRatio, currentRatio),
		);
	}

	function finishPlotDrag(event: PointerEvent<HTMLDivElement>) {
		const drag = zoomDragRef.current;
		if (!drag || drag.pointerId !== event.pointerId) {
			return;
		}

		if (event.currentTarget.hasPointerCapture(event.pointerId)) {
			event.currentTarget.releasePointerCapture(event.pointerId);
		}
		const currentRatio = getPointerRatio(event.clientX);
		if (drag.hasCrossedThreshold && currentRatio !== undefined) {
			setPendingZoomSelection(
				getSessionOverviewZoomSelection(drag.startRatio, currentRatio),
			);
			suppressClickUntilRef.current = Date.now() + 250;
		}
		zoomDragRef.current = undefined;
		setDraftZoomSelection(undefined);
	}

	function cancelPlotDrag(event: PointerEvent<HTMLDivElement>) {
		if (zoomDragRef.current?.pointerId !== event.pointerId) {
			return;
		}
		zoomDragRef.current = undefined;
		setDraftZoomSelection(undefined);
	}

	function handlePlotClickCapture(event: MouseEvent<HTMLDivElement>) {
		if (Date.now() > suppressClickUntilRef.current) {
			return;
		}
		event.preventDefault();
		event.stopPropagation();
		suppressClickUntilRef.current = 0;
	}

	function handleSelect(index: number) {
		setDraftZoomSelection(undefined);
		setPendingZoomSelection(undefined);
		onSelect(index);
	}

	function confirmZoomSelection() {
		if (!pendingZoomSelection) {
			return;
		}
		setZoomWindow(() =>
			getSessionOverviewZoomWindowFromSelection(pendingZoomSelection),
		);
		setPendingZoomSelection(undefined);
		setHoverRatio(undefined);
	}

	function resetZoom() {
		setZoomWindow(() => DEFAULT_SESSION_OVERVIEW_ZOOM_WINDOW);
		setDraftZoomSelection(undefined);
		setPendingZoomSelection(undefined);
		setHoverRatio(undefined);
	}

	function scrubAtPointer(event: PointerEvent<HTMLDivElement>) {
		const xRatio = getPointerRatio(event.clientX);
		const index =
			xRatio === undefined
				? undefined
				: getSessionThreadOverviewIndexAtRatio(chart.rows, xRatio);
		if (index !== undefined) {
			handleSelect(index);
		}
	}

	function handleViewportKeyDown(event: KeyboardEvent<HTMLDivElement>) {
		if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
			return;
		}
		event.preventDefault();
		handleSelect(
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
			onClickCapture={handlePlotClickCapture}
			onPointerCancel={cancelPlotDrag}
			onPointerDown={handlePlotPointerDown}
			onPointerLeave={() => {
				if (!zoomDragRef.current) {
					setHoverRatio(undefined);
				}
			}}
			onPointerMove={handlePlotPointerMove}
			onPointerUp={finishPlotDrag}
			onResetZoom={zoomLevel > 1.001 ? resetZoom : undefined}
			onSelect={handleSelect}
			onZoomSelectionConfirm={confirmZoomSelection}
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
			onWheel={(event) => {
				setDraftZoomSelection(undefined);
				setPendingZoomSelection(undefined);
				handleSessionOverviewZoomWheel(event, {
					enabled: true,
					plotWidth: chartPlotRef.current?.getBoundingClientRect().width,
					setZoomWindow,
					zoomAnchorRatio,
					zoomLevel,
				});
			}}
			options={options}
			plotLeft={plotLeft}
			plotRight={plotRight}
			readout={readout}
			readoutCall={readoutCall}
			readoutId={readoutId}
			readoutTimestamp={readoutTimestamp}
			resolvedConfig={resolvedConfig}
			selectedIndex={selectedIndex}
			setFocusedIndex={setFocusedIndex}
			timelineEvents={timelineEvents}
			tokenGradientId={tokenGradientId}
			viewportStartX={viewportStartX}
			viewportWidth={viewportWidth}
			zoomSelection={draftZoomSelection ?? pendingZoomSelection}
			zoomSelectionIsDraft={draftZoomSelection !== undefined}
		/>
	);
}
