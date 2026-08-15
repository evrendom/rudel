import type { WheelEvent } from "react";
import {
	panSessionOverviewZoomWindowByPixels,
	type SessionOverviewZoomWindow,
	zoomSessionOverviewWindowAt,
} from "./session-thread-overview-zoom";

export function handleSessionOverviewZoomWheel(
	event: WheelEvent<HTMLDivElement>,
	{
		enabled,
		plotWidth,
		setZoomWindow,
		zoomAnchorRatio,
		zoomLevel,
	}: {
		enabled: boolean;
		plotWidth: number | undefined;
		setZoomWindow: (
			updater: (
				current: SessionOverviewZoomWindow,
			) => SessionOverviewZoomWindow,
		) => void;
		zoomAnchorRatio: number;
		zoomLevel: number;
	},
) {
	if (!enabled) {
		return;
	}

	if (event.ctrlKey || event.metaKey) {
		event.preventDefault();
		const requestedFactor = Math.exp(-event.deltaY * 0.002);
		setZoomWindow((currentWindow) =>
			zoomSessionOverviewWindowAt(
				currentWindow,
				zoomAnchorRatio,
				Math.min(Math.max(requestedFactor, 0.5), 2),
			),
		);
		return;
	}

	const horizontalDelta =
		Math.abs(event.deltaX) > 0
			? event.deltaX
			: event.shiftKey
				? event.deltaY
				: 0;
	if (
		zoomLevel <= 1.001 ||
		horizontalDelta === 0 ||
		plotWidth === undefined ||
		plotWidth <= 0
	) {
		return;
	}

	event.preventDefault();
	setZoomWindow((currentWindow) =>
		panSessionOverviewZoomWindowByPixels(
			currentWindow,
			horizontalDelta,
			plotWidth,
		),
	);
}
