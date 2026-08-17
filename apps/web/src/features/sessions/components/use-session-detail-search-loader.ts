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
	SESSION_DETAIL_BODY_CACHE_TIME_MS,
	SESSION_DETAIL_IMMUTABLE_STALE_TIME_MS,
	SESSION_DETAIL_WINDOW_CACHE_TIME_MS,
	sessionDetailTurnQueryKey,
	sessionDetailWindowQueryKey,
	shouldRetrySessionDetailFastQuery,
} from "./session-detail-fast-query";
import { SessionDetailFastRevisionMismatchError } from "./session-detail-fast-response";
import { loadRemainingSessionDetailOverviewPages } from "./session-detail-full-transcript";
import {
	getSessionDetailTurnSearchText,
	type SessionDetailSearchLoadState,
} from "./session-detail-search";
import { WINDOW_RETENTION_LIMIT } from "./session-transcript-window-store";

const SEARCH_WINDOW_MODE_KEY = "search";

export function useSessionDetailSearchLoader(input: {
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
	const controllerRef = useRef<AbortController | undefined>(undefined);

	useMountEffect(() => () => controllerRef.current?.abort());

	async function loadSearchIndex() {
		const controller = new AbortController();
		controllerRef.current?.abort();
		controllerRef.current = controller;
		const searchIndex = new Map("index" in loadState ? loadState.index : []);
		setLoadState({
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
			const searchableTurns = allTurns;
			const searchableTurnIds = new Set(
				searchableTurns.map((turn) => turn.turnId),
			);
			setLoadState({
				completed: 0,
				index: new Map(searchIndex),
				phase: "turns",
				status: "loading",
				total: searchableTurns.length,
			});

			const failedTurnIds = await loadSearchIndexFromWindows({
				controller,
				windowModeKey: SEARCH_WINDOW_MODE_KEY,
				onProgress: (completed) => {
					setLoadState({
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
			setLoadState(
				failedTurnIds.length > 0
					? {
							failedTurnIds,
							index: new Map(searchIndex),
							status: "failed",
						}
					: {
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
							completed: current.completed,
							index: current.index,
							status: "cancelled",
							total: current.total,
						}
					: current,
			);
		},
		focus: () => {
			if (loadState.status !== "loading" && loadState.status !== "complete") {
				void loadSearchIndex();
			}
		},
		loadState,
	};
}

export async function loadSearchIndexFromWindows(input: {
	controller: AbortController;
	windowModeKey: string;
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
		const queryKey = sessionDetailWindowQueryKey(request, input.windowModeKey);
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

async function loadTurnWithCache(input: {
	controller: AbortController;
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
	input.controller.signal.throwIfAborted();
	return result;
}
