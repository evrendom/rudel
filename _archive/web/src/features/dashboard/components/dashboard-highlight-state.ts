import { useCallback, useRef, useState } from "react";

export type DashboardHighlightSource = "chart" | "table" | null;

type DashboardHighlightState = {
	highlightSource: DashboardHighlightSource;
	highlightedItemId: string | null;
};

export type DashboardHighlightChangeHandler = (
	itemId: string | null,
	source?: Exclude<DashboardHighlightSource, null>,
) => void;

const DEFAULT_HIGHLIGHT_STATE: DashboardHighlightState = {
	highlightSource: null,
	highlightedItemId: null,
};

export function useDashboardHighlightState() {
	const [state, setState] = useState<DashboardHighlightState>(
		DEFAULT_HIGHLIGHT_STATE,
	);
	const stateRef = useRef<DashboardHighlightState>(DEFAULT_HIGHLIGHT_STATE);

	const setHighlight = useCallback<DashboardHighlightChangeHandler>(
		(itemId, source = "table") => {
			const nextState =
				itemId == null
					? DEFAULT_HIGHLIGHT_STATE
					: {
							highlightSource: source,
							highlightedItemId: itemId,
						};

			if (
				stateRef.current.highlightedItemId === nextState.highlightedItemId &&
				stateRef.current.highlightSource === nextState.highlightSource
			) {
				return;
			}

			stateRef.current = nextState;
			setState(nextState);
		},
		[],
	);

	return {
		highlightSource: state.highlightSource,
		highlightedItemId: state.highlightedItemId,
		setHighlight,
	};
}
