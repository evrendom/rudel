import { useSyncExternalStore } from "react";

export type SessionContinuousTurnVisibleRange =
	| readonly [number, number]
	| undefined;

export type SessionContinuousTurnViewportStore = {
	getSnapshot: () => SessionContinuousTurnVisibleRange;
	publish: (visibleRange: readonly [number, number]) => void;
	subscribe: (listener: () => void) => () => void;
};

export function createSessionContinuousTurnViewportStore(): SessionContinuousTurnViewportStore {
	let snapshot: SessionContinuousTurnVisibleRange;
	const listeners = new Set<() => void>();

	return {
		getSnapshot: () => snapshot,
		publish: (visibleRange) => {
			if (
				snapshot?.[0] === visibleRange[0] &&
				snapshot[1] === visibleRange[1]
			) {
				return;
			}

			snapshot = [visibleRange[0], visibleRange[1]];
			for (const listener of listeners) {
				listener();
			}
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
		store.getSnapshot,
		store.getSnapshot,
	);
}
