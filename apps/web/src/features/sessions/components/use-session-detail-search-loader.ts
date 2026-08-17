import type {
	SessionDetailOverview,
	SessionDetailTurn,
	SessionDetailWindow,
	SessionDetailWindowRequest,
} from "@rudel/api-routes";
import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { useMountEffect } from "@/app/hooks/useMountEffect";
import {
	fetchSessionDetailTurn,
	fetchSessionDetailWindow,
	isSessionDetailStaleRevisionError,
	isSessionDetailWindowUnsupportedError,
	SESSION_DETAIL_BODY_CACHE_TIME_MS,
	SESSION_DETAIL_IMMUTABLE_STALE_TIME_MS,
	SESSION_DETAIL_WINDOW_CACHE_TIME_MS,
	sessionDetailTurnQueryKey,
	sessionDetailWindowQueryKey,
	shouldRetrySessionDetailFastQuery,
} from "./session-detail-fast-query";
import { SessionDetailFastRevisionMismatchError } from "./session-detail-fast-response";
import {
	loadRemainingSessionDetailOverviewPages,
	loadSessionDetailTurnBodies,
} from "./session-detail-full-transcript";
import {
	getSessionDetailTurnSearchText,
	type SessionDetailSearchLoadState,
} from "./session-detail-search";
import {
	getSessionDetailSkeletonDebugKey,
	getSessionDetailSkeletonTurnPolicy,
	type SessionDetailSkeletonDebugMode,
	waitForSessionDetailSkeletonDelay,
} from "./session-detail-skeleton-debug";
import { WINDOW_RETENTION_LIMIT } from "./session-transcript-window-store";

export function useSessionDetailSearchLoader(input: {
	debugMode: SessionDetailSkeletonDebugMode;
	firstOverview: SessionDetailOverview;
	latestPage: SessionDetailOverview;
	loadPage: (
		cursor: string,
		signal?: AbortSignal,
	) => Promise<SessionDetailOverview>;
	onPagesLoaded: (pages: readonly SessionDetailOverview[]) => void;
	onStaleRevision: (error: unknown) => void;
	pages: readonly SessionDetailOverview[];
}) {
	const queryClient = useQueryClient();
	const [loadState, setLoadState] = useState<SessionDetailSearchLoadState>({
		status: "idle",
	});
	const [loadModeKey, setLoadModeKey] = useState(() =>
		getSessionDetailSkeletonDebugKey(input.debugMode),
	);
	const controllerRef = useRef<AbortController | undefined>(undefined);

	useMountEffect(() => () => controllerRef.current?.abort());

	async function loadSearchIndex() {
		const nextLoadModeKey = getSessionDetailSkeletonDebugKey(input.debugMode);
		const controller = new AbortController();
		controllerRef.current?.abort();
		controllerRef.current = controller;
		const searchIndex = new Map(
			loadModeKey === nextLoadModeKey && "index" in loadState
				? loadState.index
				: [],
		);
		const legacyBodies = new Map(
			loadModeKey === nextLoadModeKey && "bodies" in loadState
				? loadState.bodies
				: [],
		);
		setLoadModeKey(nextLoadModeKey);
		setLoadState({
			bodies: legacyBodies,
			completed: 0,
			index: searchIndex,
			phase: "pages",
			status: "loading",
			total: 0,
		});

		try {
			const remainingPages = await loadRemainingSessionDetailOverviewPages({
				first: input.latestPage,
				loadPage: (cursor) => input.loadPage(cursor, controller.signal),
				signal: controller.signal,
			});
			const allPages = [...input.pages, ...remainingPages];
			input.onPagesLoaded(allPages.slice(1));
			const allTurns = allPages.flatMap((page) => page.turnPage.items);
			const searchableTurns = allTurns.filter(
				(turn) =>
					getSessionDetailSkeletonTurnPolicy(input.debugMode, turn.index)
						.hydrate,
			);
			const searchableTurnIds = new Set(
				searchableTurns.map((turn) => turn.turnId),
			);
			setLoadState({
				bodies: legacyBodies,
				completed: 0,
				index: new Map(searchIndex),
				phase: "turns",
				status: "loading",
				total: searchableTurns.length,
			});

			let failedTurnIds: readonly string[] = [];
			try {
				failedTurnIds = await loadSearchIndexFromWindows({
					controller,
					debugModeKey: nextLoadModeKey,
					onProgress: (completed) => {
						setLoadState({
							bodies: legacyBodies,
							completed,
							index: new Map(searchIndex),
							phase: "turns",
							status: "loading",
							total: searchableTurns.length,
						});
					},
					queryClient,
					revision: input.firstOverview.revision,
					searchIndex,
					searchableTurnIds,
					sessionId: input.firstOverview.session.sessionId,
				});
			} catch (error) {
				if (!isSessionDetailWindowUnsupportedError(error)) {
					throw error;
				}
				failedTurnIds = await loadLegacySearchIndex({
					controller,
					debugMode: input.debugMode,
					legacyBodies,
					onProgress: (completed, total) => {
						setLoadState({
							bodies: new Map(legacyBodies),
							completed,
							index: new Map(searchIndex),
							phase: "turns",
							status: "loading",
							total,
						});
					},
					queryClient,
					revision: input.firstOverview.revision,
					searchIndex,
					sessionId: input.firstOverview.session.sessionId,
					turns: searchableTurns,
				});
			}
			setLoadState(
				failedTurnIds.length > 0
					? {
							bodies: new Map(legacyBodies),
							failedTurnIds,
							index: new Map(searchIndex),
							status: "failed",
						}
					: {
							bodies: new Map(legacyBodies),
							index: new Map(searchIndex),
							status: "complete",
						},
			);
		} catch (error) {
			if (controller.signal.aborted) {
				return;
			}
			if (isSessionDetailStaleRevisionError(error)) {
				input.onStaleRevision(error);
				return;
			}
			setLoadState({
				bodies: legacyBodies,
				failedTurnIds: [],
				index: searchIndex,
				status: "failed",
			});
		} finally {
			if (controllerRef.current === controller) {
				controllerRef.current = undefined;
			}
		}
	}

	return {
		cancel: () => {
			controllerRef.current?.abort(
				new DOMException("Transcript indexing was cancelled.", "AbortError"),
			);
			setLoadState((current) =>
				current.status === "loading"
					? {
							bodies: current.bodies,
							completed: current.completed,
							index: current.index,
							status: "cancelled",
							total: current.total,
						}
					: current,
			);
		},
		focus: () => {
			const currentModeKey = getSessionDetailSkeletonDebugKey(input.debugMode);
			if (
				loadModeKey !== currentModeKey ||
				(loadState.status !== "loading" && loadState.status !== "complete")
			) {
				void loadSearchIndex();
			}
		},
		loadModeKey,
		loadState,
	};
}

export async function loadSearchIndexFromWindows(input: {
	controller: AbortController;
	debugModeKey: string;
	loadWindow?: (
		request: SessionDetailWindowRequest,
		signal: AbortSignal,
	) => Promise<SessionDetailWindow>;
	onProgress: (completed: number) => void;
	queryClient: QueryClient;
	revision: string;
	searchIndex: Map<string, readonly string[]>;
	searchableTurnIds: ReadonlySet<string>;
	sessionId: string;
}) {
	const completedTurnIds = new Set<string>();
	const failedTurnIds = new Set<string>();
	const retainedQueryKeys: Array<
		ReturnType<typeof sessionDetailWindowQueryKey>
	> = [];
	const seenCursors = new Set<string>();
	let request: SessionDetailWindowRequest = {
		includeBodies: true,
		mode: "initial",
		sessionId: input.sessionId,
	};
	const mutableRetainedKeys = [...retainedQueryKeys];
	while (true) {
		input.controller.signal.throwIfAborted();
		const queryKey = sessionDetailWindowQueryKey(request, input.debugModeKey);
		const window: SessionDetailWindow = input.loadWindow
			? await input.loadWindow(request, input.controller.signal)
			: await input.queryClient.fetchQuery({
					gcTime: SESSION_DETAIL_WINDOW_CACHE_TIME_MS,
					queryFn: ({ signal }) =>
						fetchSessionDetailWindow(
							request,
							AbortSignal.any([signal, input.controller.signal]),
						),
					queryKey,
					retry: shouldRetrySessionDetailFastQuery,
					staleTime: SESSION_DETAIL_IMMUTABLE_STALE_TIME_MS,
				});
		if (window.revision !== input.revision) {
			throw new SessionDetailFastRevisionMismatchError(
				input.revision,
				window.revision,
			);
		}
		mutableRetainedKeys.push(queryKey);
		while (mutableRetainedKeys.length > WINDOW_RETENTION_LIMIT) {
			// The initial query is actively observed by the transcript controller;
			// retain it and evict the oldest directional window instead.
			const [evictedKey] = mutableRetainedKeys.splice(1, 1);
			if (evictedKey) {
				input.queryClient.removeQueries({ exact: true, queryKey: evictedKey });
			}
		}
		for (const turn of window.turns) {
			if (!input.searchableTurnIds.has(turn.turnId)) {
				continue;
			}
			if (turn.body) {
				input.searchIndex.set(
					turn.turnId,
					getSessionDetailTurnSearchText(turn.body),
				);
			} else if (turn.bodyOmitted === "oversized" && turn.hasBody) {
				try {
					const body = await loadTurnWithCache({
						controller: input.controller,
						delayMs: 0,
						queryClient: input.queryClient,
						revision: input.revision,
						sessionId: input.sessionId,
						turnId: turn.turnId,
					});
					input.searchIndex.set(
						turn.turnId,
						getSessionDetailTurnSearchText(body),
					);
					input.queryClient.removeQueries({
						exact: true,
						queryKey: sessionDetailTurnQueryKey({
							revision: input.revision,
							sessionId: input.sessionId,
							turnId: turn.turnId,
						}),
					});
				} catch (error) {
					if (isSessionDetailStaleRevisionError(error)) {
						throw error;
					}
					failedTurnIds.add(turn.turnId);
				}
			}
			completedTurnIds.add(turn.turnId);
		}
		input.onProgress(completedTurnIds.size);
		if (!window.newerCursor) {
			break;
		}
		if (seenCursors.has(window.newerCursor)) {
			throw new Error(
				"Session detail search received a repeated window cursor",
			);
		}
		seenCursors.add(window.newerCursor);
		request = {
			cursor: window.newerCursor,
			includeBodies: true,
			mode: "newer",
			sessionId: input.sessionId,
		};
	}
	return [...failedTurnIds];
}

async function loadLegacySearchIndex(input: {
	controller: AbortController;
	debugMode: SessionDetailSkeletonDebugMode;
	legacyBodies: Map<string, SessionDetailTurn>;
	onProgress: (completed: number, total: number) => void;
	queryClient: QueryClient;
	revision: string;
	searchIndex: Map<string, readonly string[]>;
	sessionId: string;
	turns: SessionDetailOverview["turnPage"]["items"];
}) {
	const result = await loadSessionDetailTurnBodies({
		concurrency: 3,
		loadTurn: (turn) =>
			loadTurnWithCache({
				controller: input.controller,
				delayMs: getSessionDetailSkeletonTurnPolicy(input.debugMode, turn.index)
					.delayMs,
				queryClient: input.queryClient,
				revision: input.revision,
				sessionId: input.sessionId,
				turnId: turn.turnId,
			}),
		onProgress: ({ completed, total }) => input.onProgress(completed, total),
		onTurnLoaded: (turn, body) => {
			input.legacyBodies.set(turn.turnId, body);
			input.searchIndex.set(turn.turnId, getSessionDetailTurnSearchText(body));
		},
		signal: input.controller.signal,
		shouldStop: isSessionDetailStaleRevisionError,
		turns: input.turns,
	});
	return [...result.failures.keys()];
}

async function loadTurnWithCache(input: {
	controller: AbortController;
	delayMs: number;
	queryClient: QueryClient;
	revision: string;
	sessionId: string;
	turnId: string;
}): Promise<SessionDetailTurn> {
	input.controller.signal.throwIfAborted();
	const turnInput = {
		revision: input.revision,
		sessionId: input.sessionId,
		turnId: input.turnId,
	};
	const result = await input.queryClient.fetchQuery({
		gcTime: SESSION_DETAIL_BODY_CACHE_TIME_MS,
		queryFn: ({ signal }) =>
			fetchSessionDetailTurn(
				turnInput,
				AbortSignal.any([signal, input.controller.signal]),
			),
		queryKey: sessionDetailTurnQueryKey(turnInput),
		retry: shouldRetrySessionDetailFastQuery,
		staleTime: SESSION_DETAIL_IMMUTABLE_STALE_TIME_MS,
	});
	await waitForSessionDetailSkeletonDelay(
		input.delayMs,
		input.controller.signal,
	);
	input.controller.signal.throwIfAborted();
	return result;
}
