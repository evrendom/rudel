import {
	type PointerEvent as ReactPointerEvent,
	type RefObject,
	useCallback,
	useLayoutEffect,
	useRef,
} from "react";

const MINIMUM_THUMB_HEIGHT_PX = 24;
const HORIZONTAL_SCROLLBAR_HEIGHT_PX = 8;
const EDGE_HOVER_WIDTH_PX = 12;
const IDLE_FADE_DELAY_MS = 900;

type ScrollbarGeometryInput = {
	clientHeight: number;
	clientWidth: number;
	headerHeight: number;
	scrollHeight: number;
	scrollTop: number;
	scrollWidth: number;
};

export type SessionTurnTableScrollbarGeometry = {
	hasHorizontalOverflow: boolean;
	hasVerticalOverflow: boolean;
	horizontalScrollbarHeight: number;
	maximumScrollTop: number;
	thumbHeight: number;
	thumbTop: number;
	thumbTravel: number;
	trackHeight: number;
};

export function getSessionTurnTableScrollbarGeometry({
	clientHeight,
	clientWidth,
	headerHeight,
	scrollHeight,
	scrollTop,
	scrollWidth,
}: ScrollbarGeometryInput): SessionTurnTableScrollbarGeometry {
	const hasHorizontalOverflow = scrollWidth > clientWidth;
	const horizontalScrollbarHeight = hasHorizontalOverflow
		? HORIZONTAL_SCROLLBAR_HEIGHT_PX
		: 0;
	const trackHeight = Math.max(
		0,
		clientHeight - headerHeight - horizontalScrollbarHeight,
	);
	const maximumScrollTop = Math.max(0, scrollHeight - clientHeight);
	const hasVerticalOverflow = maximumScrollTop > 0 && trackHeight > 0;
	if (!hasVerticalOverflow) {
		return {
			hasHorizontalOverflow,
			hasVerticalOverflow,
			horizontalScrollbarHeight,
			maximumScrollTop,
			thumbHeight: 0,
			thumbTop: 0,
			thumbTravel: 0,
			trackHeight,
		};
	}

	const thumbHeight = Math.min(
		trackHeight,
		Math.max(
			MINIMUM_THUMB_HEIGHT_PX,
			(clientHeight / scrollHeight) * trackHeight,
		),
	);
	const thumbTravel = Math.max(0, trackHeight - thumbHeight);
	const progress = Math.min(1, Math.max(0, scrollTop / maximumScrollTop));
	return {
		hasHorizontalOverflow,
		hasVerticalOverflow,
		horizontalScrollbarHeight,
		maximumScrollTop,
		thumbHeight,
		thumbTop: progress * thumbTravel,
		thumbTravel,
		trackHeight,
	};
}

type DragState = {
	maximumScrollTop: number;
	pointerId: number;
	startClientY: number;
	startScrollTop: number;
	thumbTravel: number;
};

type HoverBounds = {
	bottom: number;
	left: number;
	right: number;
	top: number;
};

export function SessionTurnTableScrollbar({
	scrollElementRef,
}: {
	scrollElementRef: RefObject<HTMLDivElement | null>;
}) {
	const animationFrameRef = useRef<number | undefined>(undefined);
	const dragStateRef = useRef<DragState | undefined>(undefined);
	const edgeHoveredRef = useRef(false);
	const hideTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
		undefined,
	);
	const hoverBoundsRef = useRef<HoverBounds | undefined>(undefined);
	const thumbRef = useRef<HTMLDivElement>(null);
	const trackRef = useRef<HTMLDivElement>(null);

	const clearHideTimer = useCallback(() => {
		if (hideTimerRef.current !== undefined) {
			clearTimeout(hideTimerRef.current);
			hideTimerRef.current = undefined;
		}
	}, []);

	const setVisible = useCallback((visible: boolean) => {
		const track = trackRef.current;
		if (!track) {
			return;
		}
		track.dataset.visible = String(
			visible && track.dataset.overflow === "true",
		);
	}, []);

	const scheduleHide = useCallback(() => {
		clearHideTimer();
		hideTimerRef.current = setTimeout(() => {
			if (!edgeHoveredRef.current && dragStateRef.current === undefined) {
				setVisible(false);
			}
			hideTimerRef.current = undefined;
		}, IDLE_FADE_DELAY_MS);
	}, [clearHideTimer, setVisible]);

	const showTemporarily = useCallback(() => {
		clearHideTimer();
		setVisible(true);
		scheduleHide();
	}, [clearHideTimer, scheduleHide, setVisible]);

	const syncGeometry = useCallback(() => {
		const scrollElement = scrollElementRef.current;
		const thumb = thumbRef.current;
		const track = trackRef.current;
		if (!scrollElement || !thumb || !track) {
			return;
		}

		const headerHeight =
			scrollElement.querySelector<HTMLElement>("thead")?.getBoundingClientRect()
				.height ?? 0;
		const geometry = getSessionTurnTableScrollbarGeometry({
			clientHeight: scrollElement.clientHeight,
			clientWidth: scrollElement.clientWidth,
			headerHeight,
			scrollHeight: scrollElement.scrollHeight,
			scrollTop: scrollElement.scrollTop,
			scrollWidth: scrollElement.scrollWidth,
		});
		const scrollRect = scrollElement.getBoundingClientRect();
		hoverBoundsRef.current = {
			bottom: scrollRect.bottom - geometry.horizontalScrollbarHeight,
			left: scrollRect.right - EDGE_HOVER_WIDTH_PX,
			right: scrollRect.right,
			top: scrollRect.top + headerHeight,
		};

		track.dataset.overflow = String(geometry.hasVerticalOverflow);
		track.style.top = `${headerHeight}px`;
		track.style.bottom = `${geometry.horizontalScrollbarHeight}px`;
		thumb.style.height = `${geometry.thumbHeight}px`;
		thumb.style.top = `${geometry.thumbTop}px`;
		thumb.dataset.maximumScrollTop = String(geometry.maximumScrollTop);
		thumb.dataset.trackBottom = String(headerHeight + geometry.trackHeight);
		thumb.dataset.trackTop = String(headerHeight);
		if (!geometry.hasVerticalOverflow) {
			setVisible(false);
		}
	}, [scrollElementRef, setVisible]);

	const scheduleGeometrySync = useCallback(() => {
		if (animationFrameRef.current !== undefined) {
			return;
		}
		animationFrameRef.current = requestAnimationFrame(() => {
			animationFrameRef.current = undefined;
			syncGeometry();
		});
	}, [syncGeometry]);

	useLayoutEffect(() => {
		const scrollElement = scrollElementRef.current;
		if (!scrollElement) {
			return;
		}

		const handleScroll = () => {
			scheduleGeometrySync();
			showTemporarily();
		};
		const handlePointerMove = (event: PointerEvent) => {
			const bounds = hoverBoundsRef.current;
			const isEdgeHovered =
				bounds !== undefined &&
				event.clientX >= bounds.left &&
				event.clientX <= bounds.right &&
				event.clientY >= bounds.top &&
				event.clientY <= bounds.bottom;
			if (isEdgeHovered === edgeHoveredRef.current) {
				return;
			}
			edgeHoveredRef.current = isEdgeHovered;
			if (isEdgeHovered) {
				clearHideTimer();
				setVisible(true);
			} else {
				scheduleHide();
			}
		};
		const resizeObserver = new ResizeObserver(scheduleGeometrySync);
		resizeObserver.observe(scrollElement);
		const table = scrollElement.querySelector<HTMLElement>("table");
		if (table) {
			resizeObserver.observe(table);
		}
		const mutationObserver = new MutationObserver(scheduleGeometrySync);
		mutationObserver.observe(scrollElement, {
			characterData: true,
			childList: true,
			subtree: true,
		});
		scrollElement.addEventListener("scroll", handleScroll, { passive: true });
		document.addEventListener("pointermove", handlePointerMove, {
			passive: true,
		});
		syncGeometry();

		return () => {
			clearHideTimer();
			if (animationFrameRef.current !== undefined) {
				cancelAnimationFrame(animationFrameRef.current);
			}
			mutationObserver.disconnect();
			resizeObserver.disconnect();
			scrollElement.removeEventListener("scroll", handleScroll);
			document.removeEventListener("pointermove", handlePointerMove);
		};
	}, [
		clearHideTimer,
		scheduleGeometrySync,
		scheduleHide,
		scrollElementRef,
		setVisible,
		showTemporarily,
		syncGeometry,
	]);

	function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
		const scrollElement = scrollElementRef.current;
		const track = trackRef.current;
		if (!scrollElement || !track) {
			return;
		}
		const headerHeight =
			scrollElement.querySelector<HTMLElement>("thead")?.getBoundingClientRect()
				.height ?? 0;
		const geometry = getSessionTurnTableScrollbarGeometry({
			clientHeight: scrollElement.clientHeight,
			clientWidth: scrollElement.clientWidth,
			headerHeight,
			scrollHeight: scrollElement.scrollHeight,
			scrollTop: scrollElement.scrollTop,
			scrollWidth: scrollElement.scrollWidth,
		});
		if (!geometry.hasVerticalOverflow || geometry.thumbTravel <= 0) {
			return;
		}

		clearHideTimer();
		dragStateRef.current = {
			maximumScrollTop: geometry.maximumScrollTop,
			pointerId: event.pointerId,
			startClientY: event.clientY,
			startScrollTop: scrollElement.scrollTop,
			thumbTravel: geometry.thumbTravel,
		};
		track.dataset.dragging = "true";
		setVisible(true);
		event.currentTarget.setPointerCapture(event.pointerId);
		event.preventDefault();
	}

	function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
		const dragState = dragStateRef.current;
		const scrollElement = scrollElementRef.current;
		if (!dragState || !scrollElement) {
			return;
		}
		const pointerDelta = event.clientY - dragState.startClientY;
		scrollElement.scrollTop =
			dragState.startScrollTop +
			(pointerDelta / dragState.thumbTravel) * dragState.maximumScrollTop;
	}

	function finishDrag(event: ReactPointerEvent<HTMLDivElement>) {
		const dragState = dragStateRef.current;
		if (!dragState || dragState.pointerId !== event.pointerId) {
			return;
		}
		if (event.currentTarget.hasPointerCapture(event.pointerId)) {
			event.currentTarget.releasePointerCapture(event.pointerId);
		}
		dragStateRef.current = undefined;
		if (trackRef.current) {
			trackRef.current.dataset.dragging = "false";
		}
		scheduleHide();
	}

	return (
		<div
			aria-hidden="true"
			className="session-turn-table-scrollbar"
			data-dragging="false"
			data-overflow="false"
			data-session-turn-table-scrollbar
			data-visible="false"
			ref={trackRef}
		>
			<div
				className="session-turn-table-scrollbar-thumb"
				data-session-turn-table-scrollbar-thumb
				onPointerCancel={finishDrag}
				onPointerDown={handlePointerDown}
				onPointerMove={handlePointerMove}
				onPointerUp={finishDrag}
				ref={thumbRef}
			/>
		</div>
	);
}
