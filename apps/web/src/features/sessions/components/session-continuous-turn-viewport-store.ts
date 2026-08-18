import { useState, useSyncExternalStore } from "react";
import { useMountEffect } from "@/app/hooks/useMountEffect";
import type { SessionTurnSelection } from "./session-turn-table-selection";

type SessionContinuousTurnVisibleRange = readonly [number, number] | undefined;

type SessionContinuousTurnViewportSnapshot = {
	activeSelection: SessionTurnSelection | undefined;
	viewedSelections: readonly SessionTurnSelection[];
	visibleRange: SessionContinuousTurnVisibleRange;
};

export type SessionContinuousTurnViewportStore = {
	getSnapshot: () => SessionContinuousTurnViewportSnapshot;
	publishSelection: (selection: SessionTurnSelection) => void;
	publishViewport: (
		activeSelection: SessionTurnSelection,
		visibleRange: readonly [number, number],
		viewedSelections: readonly SessionTurnSelection[],
	) => void;
	subscribe: (listener: () => void) => () => void;
};

export function createSessionContinuousTurnViewportStore(): SessionContinuousTurnViewportStore {
	let snapshot: SessionContinuousTurnViewportSnapshot = {
		activeSelection: undefined,
		viewedSelections: [],
		visibleRange: undefined,
	};
	const listeners = new Set<() => void>();
	const notify = () => {
		for (const listener of listeners) {
			listener();
		}
	};

	return {
		getSnapshot: () => snapshot,
		publishSelection: (selection) => {
			if (
				snapshot.activeSelection?.index === selection.index &&
				snapshot.activeSelection.speaker === selection.speaker
			) {
				return;
			}
			snapshot = {
				...snapshot,
				activeSelection: selection,
			};
			notify();
		},
		publishViewport: (activeSelection, visibleRange, viewedSelections) => {
			const viewedSelectionsUnchanged =
				snapshot.viewedSelections.length === viewedSelections.length &&
				snapshot.viewedSelections.every(
					(selection, index) =>
						selection.index === viewedSelections[index]?.index &&
						selection.speaker === viewedSelections[index]?.speaker,
				);
			if (
				snapshot.activeSelection?.index === activeSelection.index &&
				snapshot.activeSelection.speaker === activeSelection.speaker &&
				snapshot.visibleRange?.[0] === visibleRange[0] &&
				snapshot.visibleRange[1] === visibleRange[1] &&
				viewedSelectionsUnchanged
			) {
				return;
			}
			snapshot = {
				activeSelection,
				viewedSelections,
				visibleRange: [visibleRange[0], visibleRange[1]],
			};
			notify();
		},
		subscribe: (listener) => {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
	};
}

export function useSessionContinuousTurnVisibleRange(
	store: SessionContinuousTurnViewportStore,
) {
	return useSyncExternalStore(
		store.subscribe,
		() => store.getSnapshot().visibleRange,
		() => store.getSnapshot().visibleRange,
	);
}

export function useSessionContinuousTurnViewedSelections(
	store: SessionContinuousTurnViewportStore,
) {
	return useSyncExternalStore(
		store.subscribe,
		() => store.getSnapshot().viewedSelections,
		() => store.getSnapshot().viewedSelections,
	);
}

export function useSessionContinuousTurnActiveSelection(
	store: SessionContinuousTurnViewportStore,
) {
	return useSyncExternalStore(
		store.subscribe,
		() => store.getSnapshot().activeSelection,
		() => store.getSnapshot().activeSelection,
	);
}

export function useSessionContinuousTurnTrailingActiveSelection(
	store: SessionContinuousTurnViewportStore,
) {
	const [selection, setSelection] = useState(
		() => store.getSnapshot().activeSelection,
	);

	useMountEffect(() => {
		let timeout: number | undefined;
		const scheduleSelection = () => {
			window.clearTimeout(timeout);
			timeout = window.setTimeout(() => {
				setSelection(store.getSnapshot().activeSelection);
			}, 50);
		};
		scheduleSelection();
		const unsubscribe = store.subscribe(scheduleSelection);
		return () => {
			window.clearTimeout(timeout);
			unsubscribe();
		};
	});

	return selection;
}
