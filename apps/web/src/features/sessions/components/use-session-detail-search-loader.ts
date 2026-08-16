import type {
	SessionDetailOverview,
	SessionDetailTurn,
} from "@rudel/api-routes";
import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { useMountEffect } from "@/app/hooks/useMountEffect";
import {
	fetchSessionDetailTurn,
	isSessionDetailStaleRevisionError,
	SESSION_DETAIL_BODY_CACHE_TIME_MS,
	SESSION_DETAIL_IMMUTABLE_STALE_TIME_MS,
	sessionDetailTurnQueryKey,
	shouldRetrySessionDetailFastQuery,
} from "./session-detail-fast-query";
import {
	loadRemainingSessionDetailOverviewPages,
	loadSessionDetailTurnBodies,
} from "./session-detail-full-transcript";
import type { SessionDetailSearchLoadState } from "./session-detail-search";
import {
	getSessionDetailSkeletonDebugKey,
	getSessionDetailSkeletonTurnPolicy,
	type SessionDetailSkeletonDebugMode,
	waitForSessionDetailSkeletonDelay,
} from "./session-detail-skeleton-debug";

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
		const streamedBodies = new Map(
			loadModeKey === nextLoadModeKey && "bodies" in loadState
				? loadState.bodies
				: [],
		);
		setLoadModeKey(nextLoadModeKey);
		setLoadState({
			bodies: streamedBodies,
			completed: 0,
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
			const hydratableTurns = allTurns.filter(
				(turn) =>
					getSessionDetailSkeletonTurnPolicy(input.debugMode, turn.index)
						.hydrate,
			);
			setLoadState({
				bodies: streamedBodies,
				completed: 0,
				phase: "turns",
				status: "loading",
				total: hydratableTurns.filter((turn) => turn.hasBody).length,
			});
			const result = await loadSessionDetailTurnBodies({
				concurrency: 3,
				loadTurn: (turn) =>
					loadTurnWithCache({
						controller,
						delayMs: getSessionDetailSkeletonTurnPolicy(
							input.debugMode,
							turn.index,
						).delayMs,
						queryClient,
						revision: input.firstOverview.revision,
						sessionId: input.firstOverview.session.sessionId,
						turnId: turn.turnId,
					}),
				onProgress: ({ completed, total }) => {
					if (!controller.signal.aborted) {
						setLoadState({
							bodies: new Map(streamedBodies),
							completed,
							phase: "turns",
							status: "loading",
							total,
						});
					}
				},
				onTurnLoaded: (turn, body) => {
					if (!controller.signal.aborted) {
						streamedBodies.set(turn.turnId, body);
						setLoadState((current) =>
							current.status === "loading"
								? { ...current, bodies: new Map(streamedBodies) }
								: current,
						);
					}
				},
				signal: controller.signal,
				shouldStop: isSessionDetailStaleRevisionError,
				turns: hydratableTurns,
			});
			setLoadState(
				result.failures.size > 0
					? {
							bodies: result.bodies,
							failedTurnIds: [...result.failures.keys()],
							status: "failed",
						}
					: { bodies: result.bodies, status: "complete" },
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
				bodies: streamedBodies,
				failedTurnIds: [],
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
