export type SessionOverviewZoomWindow = {
	xEndRatio: number;
	xStartRatio: number;
};

export const DEFAULT_SESSION_OVERVIEW_ZOOM_WINDOW: SessionOverviewZoomWindow = {
	xEndRatio: 1,
	xStartRatio: 0,
};

// 128× lets a multi-day session zoom down to a minutes-wide window, enough
// to separate individual model calls within one turn.
export const SESSION_OVERVIEW_MAX_ZOOM_LEVEL = 128;
export const SESSION_OVERVIEW_ZOOM_STEP = 1.5;

const MINIMUM_ZOOM_SPAN = 1 / SESSION_OVERVIEW_MAX_ZOOM_LEVEL;

function clamp(value: number, minimum: number, maximum: number) {
	return Math.min(Math.max(value, minimum), maximum);
}

export function getSessionOverviewZoomLevel(window: SessionOverviewZoomWindow) {
	const span = window.xEndRatio - window.xStartRatio;
	return span > 0 ? 1 / span : 1;
}

export function getSessionOverviewZoomAnchor(
	window: SessionOverviewZoomWindow,
	selectedRatio: number | undefined,
) {
	return selectedRatio ?? (window.xStartRatio + window.xEndRatio) / 2;
}

export function centerSessionOverviewZoomWindowAt(
	window: SessionOverviewZoomWindow,
	targetRatio: number,
) {
	const span = window.xEndRatio - window.xStartRatio;
	if (span <= 0 || span >= 1) {
		return DEFAULT_SESSION_OVERVIEW_ZOOM_WINDOW;
	}

	const nextStart = clamp(targetRatio - span / 2, 0, 1 - span);
	return {
		xEndRatio: nextStart + span,
		xStartRatio: nextStart,
	};
}

export function getSessionOverviewZoomWindowFollowingSelection(
	window: SessionOverviewZoomWindow,
	followedSelectionRatio: number | undefined,
	selectedRatio: number | undefined,
) {
	return selectedRatio === undefined || selectedRatio === followedSelectionRatio
		? window
		: centerSessionOverviewZoomWindowAt(window, selectedRatio);
}

export function panSessionOverviewZoomWindow(
	window: SessionOverviewZoomWindow,
	deltaRatio: number,
): SessionOverviewZoomWindow {
	const span = window.xEndRatio - window.xStartRatio;
	if (span <= 0 || span >= 1) {
		return DEFAULT_SESSION_OVERVIEW_ZOOM_WINDOW;
	}

	const nextStart = clamp(window.xStartRatio + deltaRatio, 0, 1 - span);
	return {
		xEndRatio: nextStart + span,
		xStartRatio: nextStart,
	};
}

export function panSessionOverviewZoomWindowByPixels(
	window: SessionOverviewZoomWindow,
	deltaPixels: number,
	viewportWidth: number,
) {
	const visibleSpan = window.xEndRatio - window.xStartRatio;
	return panSessionOverviewZoomWindow(
		window,
		(deltaPixels / viewportWidth) * visibleSpan,
	);
}

export function zoomSessionOverviewWindowAt(
	window: SessionOverviewZoomWindow,
	anchorRatio: number,
	zoomFactor: number,
): SessionOverviewZoomWindow {
	const boundedAnchor = clamp(anchorRatio, 0, 1);
	const anchorWindow =
		boundedAnchor < window.xStartRatio || boundedAnchor > window.xEndRatio
			? centerSessionOverviewZoomWindowAt(window, boundedAnchor)
			: window;
	const currentStart = clamp(anchorWindow.xStartRatio, 0, 1);
	const currentEnd = clamp(anchorWindow.xEndRatio, currentStart, 1);
	const currentSpan = currentEnd - currentStart;
	if (currentSpan <= 0 || zoomFactor <= 0) {
		return DEFAULT_SESSION_OVERVIEW_ZOOM_WINDOW;
	}

	const nextSpan = clamp(currentSpan / zoomFactor, MINIMUM_ZOOM_SPAN, 1);
	if (nextSpan === 1) {
		return DEFAULT_SESSION_OVERVIEW_ZOOM_WINDOW;
	}

	const anchorPosition = (boundedAnchor - currentStart) / currentSpan;
	const nextStart = clamp(
		boundedAnchor - anchorPosition * nextSpan,
		0,
		1 - nextSpan,
	);

	return {
		xEndRatio: nextStart + nextSpan,
		xStartRatio: nextStart,
	};
}
