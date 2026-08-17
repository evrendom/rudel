import type {
	SessionDetailWindow,
	SessionDetailWindowRequest,
	SessionDetailWindowTurn,
} from "@rudel/api-routes";
import { measureTranscriptSuspect } from "./transcript-forensics";

export const WINDOW_RETENTION_LIMIT = 8;

type TranscriptWindowDirection = "newer" | "older";
type TranscriptWindowEdgeState = "error" | "idle" | "loading";

type SessionTranscriptWindowSnapshot = {
	bodyWindowsRetained: number;
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

type SessionTranscriptWindowStore = {
	getSnapshot: () => SessionTranscriptWindowSnapshot;
	loadAnchor: (turnId: string) => Promise<boolean>;
	loadDirection: (direction: TranscriptWindowDirection) => Promise<boolean>;
	mergeWindow: (
		window: SessionDetailWindow,
		mode: "anchor" | "initial" | TranscriptWindowDirection,
		request?: SessionDetailWindowRequest,
	) => boolean;
	observeVisibleTurnIds: (turnIds: readonly string[]) => Promise<boolean>;
	subscribe: (listener: () => void) => () => void;
};

type BodyWindowRecord = {
	bodies: Map<string, NonNullable<SessionDetailWindowTurn["body"]>>;
	centerIndex: number;
	key: string;
	request: SessionDetailWindowRequest | undefined;
	turnIds: readonly string[];
};

export function createSessionTranscriptWindowStore(input: {
	fetchWindow: (
		request: SessionDetailWindowRequest,
	) => Promise<SessionDetailWindow>;
	initialWindow: SessionDetailWindow;
	onEvictWindow?: (request: SessionDetailWindowRequest) => void;
	retentionLimit?: number;
	sessionId: string;
}): SessionTranscriptWindowStore {
	const {
		fetchWindow,
		initialWindow,
		onEvictWindow,
		retentionLimit = WINDOW_RETENTION_LIMIT,
		sessionId,
	} = input;
	const initialRequest = {
		includeBodies: true as const,
		mode: "initial" as const,
		sessionId,
	};
	const turnById = new Map(
		initialWindow.turns.map((turn) => [turn.turnId, turn]),
	);
	const listeners = new Set<() => void>();
	const pending = new Map<
		TranscriptWindowDirection | "anchor" | "rehydrate",
		Promise<boolean>
	>();
	const bodyWindows: BodyWindowRecord[] = [
		createBodyWindowRecord(initialWindow, initialRequest, "initial:0"),
	];
	let visibleTurnIds = new Set<string>();
	let viewportCenter = getWindowCenter(initialWindow.turns);
	let windowsLoaded = 1;
	let snapshot: SessionTranscriptWindowSnapshot = {
		bodyWindowsRetained: countRetainedBodyWindows(bodyWindows),
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
			bodyWindowsRetained: countRetainedBodyWindows(bodyWindows),
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
	const refreshTurnBody = (turnId: string) => {
		const turn = turnById.get(turnId);
		if (!turn || turn.bodyOmitted === "oversized") {
			return;
		}
		const body = [...bodyWindows]
			.reverse()
			.map((record) => record.bodies.get(turnId))
			.find((candidate) => candidate !== undefined);
		if (turn.body !== (body ?? null)) {
			turnById.set(turnId, { ...turn, body: body ?? null });
		}
	};
	const enforceRetention = () => {
		let changed = false;
		while (countRetainedBodyWindows(bodyWindows) > retentionLimit) {
			const candidate = [...bodyWindows]
				.filter(
					(record) =>
						record.bodies.size > 0 &&
						record.request?.mode !== "initial" &&
						!record.turnIds.some((turnId) => visibleTurnIds.has(turnId)),
				)
				.sort(
					(left, right) =>
						Math.abs(right.centerIndex - viewportCenter) -
						Math.abs(left.centerIndex - viewportCenter),
				)[0];
			if (!candidate) {
				break;
			}
			const affectedTurnIds = [...candidate.bodies.keys()];
			candidate.bodies.clear();
			if (candidate.request) {
				onEvictWindow?.(candidate.request);
			}
			for (const turnId of affectedTurnIds) {
				refreshTurnBody(turnId);
			}
			changed = true;
		}
		return changed;
	};
	const rehydrateVisibleWindow = () => {
		const active = pending.get("rehydrate");
		if (active) {
			return active;
		}
		const record = bodyWindows.find(
			(candidate) =>
				candidate.bodies.size === 0 &&
				candidate.request !== undefined &&
				candidate.turnIds.some((turnId) => {
					const turn = turnById.get(turnId);
					return (
						visibleTurnIds.has(turnId) &&
						turn?.hasBody === true &&
						turn.bodyOmitted !== "oversized"
					);
				}),
		);
		if (!record?.request) {
			return Promise.resolve(false);
		}
		const operation = fetchWindow(record.request)
			.then((window) => {
				if (window.revision !== snapshot.revision) {
					return false;
				}
				record.bodies = getWindowBodies(window.turns);
				for (const turn of window.turns) {
					turnById.set(turn.turnId, turn);
				}
				enforceRetention();
				publish();
				return true;
			})
			.finally(() => {
				pending.delete("rehydrate");
				publish();
			});
		pending.set("rehydrate", operation);
		publish();
		return operation;
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
				.then((window) => store.mergeWindow(window, "anchor", request))
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
					const merged = store.mergeWindow(window, direction, request);
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
		mergeWindow: (window, mode, request) =>
			measureTranscriptSuspect(
				"window-merge",
				{ mode, turns: window.turns.length },
				() => {
					if (window.revision !== snapshot.revision) {
						return false;
					}
					for (const turn of window.turns) {
						turnById.set(turn.turnId, turn);
					}
					const key = request
						? JSON.stringify(request)
						: `${mode}:${windowsLoaded}:${window.turns[0]?.turnId ?? "empty"}`;
					const existingIndex = bodyWindows.findIndex(
						(record) => record.key === key,
					);
					const record = createBodyWindowRecord(window, request, key);
					if (existingIndex >= 0) {
						bodyWindows[existingIndex] = record;
					} else {
						bodyWindows.push(record);
						windowsLoaded += 1;
					}
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
					enforceRetention();
					publish();
					return true;
				},
			),
		observeVisibleTurnIds: (turnIds) => {
			visibleTurnIds = new Set(turnIds);
			const indices = turnIds.flatMap((turnId) => {
				const index = turnById.get(turnId)?.index;
				return index === undefined ? [] : [index];
			});
			if (indices.length > 0) {
				viewportCenter =
					indices.reduce((total, index) => total + index, 0) / indices.length;
			}
			const changed = enforceRetention();
			if (changed) {
				publish();
			}
			return rehydrateVisibleWindow();
		},
		subscribe: (listener) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
	};
	return store;
}

function createBodyWindowRecord(
	window: SessionDetailWindow,
	request: SessionDetailWindowRequest | undefined,
	key: string,
): BodyWindowRecord {
	return {
		bodies: getWindowBodies(window.turns),
		centerIndex: getWindowCenter(window.turns),
		key,
		request,
		turnIds: window.turns.map((turn) => turn.turnId),
	};
}

function getWindowBodies(turns: readonly SessionDetailWindowTurn[]) {
	return new Map(
		turns.flatMap((turn) =>
			turn.body ? ([[turn.turnId, turn.body]] as const) : [],
		),
	);
}

function getWindowCenter(turns: readonly SessionDetailWindowTurn[]) {
	if (turns.length === 0) {
		return 0;
	}
	return turns.reduce((total, turn) => total + turn.index, 0) / turns.length;
}

function countRetainedBodyWindows(windows: readonly BodyWindowRecord[]) {
	return windows.filter((window) => window.bodies.size > 0).length;
}

function sortWindowTurns(turns: Iterable<SessionDetailWindowTurn>) {
	return [...turns].sort(
		(left, right) =>
			left.index - right.index || left.turnId.localeCompare(right.turnId),
	);
}
