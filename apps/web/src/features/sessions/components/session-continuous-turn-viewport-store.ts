import { useState, useSyncExternalStore } from "react";
import { useMountEffect } from "@/app/hooks/useMountEffect";
import type { SessionTurnSelection } from "./session-turn-table-selection";

type SessionContinuousTurnVisibleRange = readonly [number, number] | undefined;

type SessionContinuousTurnViewportSnapshot = {
	activeSelection: SessionTurnSelection | undefined;
	visibleRange: SessionContinuousTurnVisibleRange;
};

export type SessionContinuousTurnViewportStore = {
	getSnapshot: () => SessionContinuousTurnViewportSnapshot;
	publishSelection: (selection: SessionTurnSelection) => void;
	publishViewport: (
		activeIndex: number,
		visibleRange: readonly [number, number],
	) => void;
	subscribe: (listener: () => void) => () => void;
};

export function createSessionContinuousTurnViewportStore(): SessionContinuousTurnViewportStore {
	let snapshot: SessionContinuousTurnViewportSnapshot = {
		activeSelection: undefined,
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
		publishViewport: (activeIndex, visibleRange) => {
			const currentSelection = snapshot.activeSelection;
			if (
				currentSelection?.index === activeIndex &&
				snapshot.visibleRange?.[0] === visibleRange[0] &&
				snapshot.visibleRange[1] === visibleRange[1]
			) {
				return;
			}
			snapshot = {
				activeSelection: {
					index: activeIndex,
					speaker: currentSelection?.speaker ?? "model",
				},
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
