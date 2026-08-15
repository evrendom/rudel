import { useMemo, useState } from "react";
import {
	DEFAULT_SESSION_OVERVIEW_ZOOM_WINDOW,
	getSessionOverviewZoomWindowFollowingSelection,
	type SessionOverviewZoomWindow,
} from "./session-thread-overview-zoom";

type ZoomWindowUpdater = (
	current: SessionOverviewZoomWindow,
) => SessionOverviewZoomWindow;

export function useSessionThreadOverviewZoom(
	selectedRatio: number | undefined,
) {
	const [zoomState, setZoomState] = useState(() => ({
		followedSelectionRatio: selectedRatio,
		window: DEFAULT_SESSION_OVERVIEW_ZOOM_WINDOW,
	}));
	const zoomWindow = useMemo(
		() =>
			getSessionOverviewZoomWindowFollowingSelection(
				zoomState.window,
				zoomState.followedSelectionRatio,
				selectedRatio,
			),
		[zoomState, selectedRatio],
	);

	function setZoomWindow(updater: ZoomWindowUpdater) {
		setZoomState((currentState) => ({
			followedSelectionRatio: selectedRatio,
			window: updater(
				getSessionOverviewZoomWindowFollowingSelection(
					currentState.window,
					currentState.followedSelectionRatio,
					selectedRatio,
				),
			),
		}));
	}

	return { setZoomWindow, zoomWindow };
}
