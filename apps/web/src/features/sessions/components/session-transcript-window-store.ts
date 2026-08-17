import type {
	SessionDetailWindow,
	SessionDetailWindowRequest,
	SessionDetailWindowTurn,
} from "@rudel/api-routes";

export type TranscriptWindowDirection = "newer" | "older";
export type TranscriptWindowEdgeState = "error" | "idle" | "loading";

export type SessionTranscriptWindowSnapshot = {
	newerCursor: string | null;
	newerState: TranscriptWindowEdgeState;
	olderCursor: string | null;
	olderState: TranscriptWindowEdgeState;
	pending: number;
	revision: string;
	total: number;
	turns: readonly SessionDetailWindowTurn[];
	windowsLoaded: number;
};

export type SessionTranscriptWindowStore = {
	getSnapshot: () => SessionTranscriptWindowSnapshot;
	loadAnchor: (turnId: string) => Promise<boolean>;
	loadDirection: (direction: TranscriptWindowDirection) => Promise<boolean>;
	mergeWindow: (
		window: SessionDetailWindow,
		mode: "anchor" | "initial" | TranscriptWindowDirection,
	) => boolean;
	subscribe: (listener: () => void) => () => void;
};

export function createSessionTranscriptWindowStore(input: {
	fetchWindow: (
		request: SessionDetailWindowRequest,
	) => Promise<SessionDetailWindow>;
	initialWindow: SessionDetailWindow;
	sessionId: string;
}): SessionTranscriptWindowStore {
	const { fetchWindow, initialWindow, sessionId } = input;
	const turnById = new Map(
		initialWindow.turns.map((turn) => [turn.turnId, turn]),
	);
	const listeners = new Set<() => void>();
	const pending = new Map<
		TranscriptWindowDirection | "anchor",
		Promise<boolean>
	>();
	let windowsLoaded = 1;
	let snapshot: SessionTranscriptWindowSnapshot = {
		newerCursor: initialWindow.newerCursor,
		newerState: "idle",
		olderCursor: initialWindow.olderCursor,
		olderState: "idle",
		pending: 0,
		revision: initialWindow.revision,
		total: initialWindow.total,
		turns: sortWindowTurns(turnById.values()),
		windowsLoaded,
	};

	const publish = () => {
		snapshot = {
			...snapshot,
			pending: pending.size,
			turns: sortWindowTurns(turnById.values()),
			windowsLoaded,
		};
		for (const listener of listeners) {
			listener();
		}
	};
	const setEdgeState = (
		direction: TranscriptWindowDirection,
		state: TranscriptWindowEdgeState,
	) => {
		snapshot = {
			...snapshot,
			[direction === "older" ? "olderState" : "newerState"]: state,
		};
		publish();
	};

	const store: SessionTranscriptWindowStore = {
		getSnapshot: () => snapshot,
		loadAnchor: (turnId) => {
			const active = pending.get("anchor");
			if (active) {
				return active;
			}
			const request = {
				anchorTurnId: turnId,
				includeBodies: true as const,
				mode: "anchor" as const,
				revision: snapshot.revision,
				sessionId,
			};
			const operation = fetchWindow(request)
				.then((window) => store.mergeWindow(window, "anchor"))
				.finally(() => {
					pending.delete("anchor");
					publish();
				});
			pending.set("anchor", operation);
			publish();
			return operation;
		},
		loadDirection: (direction) => {
			const active = pending.get(direction);
			if (active) {
				return active;
			}
			const cursor =
				direction === "older" ? snapshot.olderCursor : snapshot.newerCursor;
			if (!cursor) {
				return Promise.resolve(false);
			}
			setEdgeState(direction, "loading");
			const request = {
				cursor,
				includeBodies: true as const,
				mode: direction,
				sessionId,
			};
			const operation = fetchWindow(request)
				.then((window) => {
					const merged = store.mergeWindow(window, direction);
					setEdgeState(direction, "idle");
					return merged;
				})
				.catch((error: unknown) => {
					setEdgeState(direction, "error");
					throw error;
				})
				.finally(() => {
					pending.delete(direction);
					publish();
				});
			pending.set(direction, operation);
			publish();
			return operation;
		},
		mergeWindow: (window, mode) => {
			if (window.revision !== snapshot.revision) {
				return false;
			}
			for (const turn of window.turns) {
				turnById.set(turn.turnId, turn);
			}
			windowsLoaded += 1;
			snapshot = {
				...snapshot,
				newerCursor:
					mode === "initial" || mode === "anchor" || mode === "newer"
						? window.newerCursor
						: snapshot.newerCursor,
				olderCursor:
					mode === "initial" || mode === "anchor" || mode === "older"
						? window.olderCursor
						: snapshot.olderCursor,
				total: window.total,
			};
			publish();
			return true;
		},
		subscribe: (listener) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
	};
	return store;
}

function sortWindowTurns(turns: Iterable<SessionDetailWindowTurn>) {
	return [...turns].sort(
		(left, right) =>
			left.index - right.index || left.turnId.localeCompare(right.turnId),
	);
}
