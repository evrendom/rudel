import type { SessionDetailTurn } from "@rudel/api-routes";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useRef, useState } from "react";
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
	attachSessionDetailTurnBody,
	type SessionDetailOverviewTurnOption,
} from "./session-detail-overview-model";
import type { SessionDetailSearchLoadState } from "./session-detail-search";
import {
	getSessionDetailSkeletonDebugKey,
	getSessionDetailSkeletonTurnPolicy,
	isSessionDetailSkeletonDebugActive,
	type SessionDetailSkeletonDebugMode,
	waitForSessionDetailSkeletonDelay,
} from "./session-detail-skeleton-debug";

type UseSessionDetailFastTurnBodiesOptions = {
	onApproachEnd: () => void;
	onStaleRevision: (error: unknown) => void;
	options: readonly SessionDetailOverviewTurnOption[];
	revision: string;
	searchLoad: SessionDetailSearchLoadState;
	searchLoadModeKey: string;
	sessionId: string;
	skeletonDebugMode: SessionDetailSkeletonDebugMode;
};

export function useSessionDetailFastTurnBodies({
	onApproachEnd,
	onStaleRevision,
	options,
	revision,
	searchLoad,
	searchLoadModeKey,
	sessionId,
	skeletonDebugMode,
}: UseSessionDetailFastTurnBodiesOptions) {
	const queryClient = useQueryClient();
	const [turnBodies, setTurnBodies] = useState<
		ReadonlyMap<string, SessionDetailTurn>
	>(() => new Map());
	const [bodyStates, setBodyStates] = useState<
		ReadonlyMap<string, "error" | "loading">
	>(() => new Map());
	const pendingTurnControllersRef = useRef<Map<string, AbortController>>(
		new Map(),
	);
	const pendingTurnIdsRef = useRef<Set<string>>(new Set());
	const skeletonDebugKey = getSessionDetailSkeletonDebugKey(skeletonDebugMode);
	const availableTurnBodies = useMemo(() => {
		if (searchLoadModeKey !== skeletonDebugKey || !("bodies" in searchLoad)) {
			return turnBodies;
		}
		return mergeSessionDetailTurnBodies(turnBodies, searchLoad.bodies);
	}, [searchLoad, searchLoadModeKey, skeletonDebugKey, turnBodies]);
	const effectiveTurnBodies = useMemo(() => {
		if (!isSessionDetailSkeletonDebugActive(skeletonDebugMode)) {
			return availableTurnBodies;
		}
		const visibleBodies = new Map<string, SessionDetailTurn>();
		for (const [index, option] of options.entries()) {
			const policy = getSessionDetailSkeletonTurnPolicy(
				skeletonDebugMode,
				index,
			);
			const body = availableTurnBodies.get(option.turnId);
			if (policy.hydrate && body) {
				visibleBodies.set(option.turnId, body);
			}
		}
		return visibleBodies;
	}, [availableTurnBodies, options, skeletonDebugMode]);
	const loadedOptions = useMemo(
		() =>
			options.map((option) => {
				const body = effectiveTurnBodies.get(option.turnId);
				return body ? attachSessionDetailTurnBody(option, body) : option;
			}),
		[effectiveTurnBodies, options],
	);

	const loadTurnBody = useCallback(
		async (index: number) => {
			const option = options[index];
			const policy = getSessionDetailSkeletonTurnPolicy(
				skeletonDebugMode,
				index,
			);
			if (
				!option?.hasBody ||
				!policy.hydrate ||
				pendingTurnIdsRef.current.has(option.turnId) ||
				effectiveTurnBodies.has(option.turnId)
			) {
				return;
			}
			pendingTurnIdsRef.current.add(option.turnId);
			const controller = new AbortController();
			pendingTurnControllersRef.current.set(option.turnId, controller);
			const input = { revision, sessionId, turnId: option.turnId };
			const queryKey = sessionDetailTurnQueryKey(input);
			setBodyStates((current) =>
				updateSessionDetailBodyState(current, option.turnId, "loading"),
			);
			try {
				const body = await queryClient.fetchQuery({
					gcTime: SESSION_DETAIL_BODY_CACHE_TIME_MS,
					queryFn: ({ signal }) =>
						fetchSessionDetailTurn(
							input,
							AbortSignal.any([signal, controller.signal]),
						),
					queryKey,
					retry: shouldRetrySessionDetailFastQuery,
					staleTime: SESSION_DETAIL_IMMUTABLE_STALE_TIME_MS,
				});
				await waitForSessionDetailSkeletonDelay(
					policy.delayMs,
					controller.signal,
				);
				setTurnBodies((current) =>
					mergeSessionDetailTurnBodies(
						current,
						new Map([[option.turnId, body]]),
					),
				);
				setBodyStates((current) =>
					updateSessionDetailBodyState(current, option.turnId, undefined),
				);
			} catch (error) {
				if (controller.signal.aborted) {
					setBodyStates((current) =>
						updateSessionDetailBodyState(current, option.turnId, undefined),
					);
					return;
				}
				if (isSessionDetailStaleRevisionError(error)) {
					onStaleRevision(error);
					return;
				}
				setBodyStates((current) =>
					updateSessionDetailBodyState(current, option.turnId, "error"),
				);
			} finally {
				if (
					pendingTurnControllersRef.current.get(option.turnId) === controller
				) {
					pendingTurnControllersRef.current.delete(option.turnId);
					pendingTurnIdsRef.current.delete(option.turnId);
				}
			}
		},
		[
			effectiveTurnBodies,
			onStaleRevision,
			options,
			queryClient,
			revision,
			sessionId,
			skeletonDebugMode,
		],
	);

	// Loads are never aborted for leaving the viewport: completed bodies land
	// in the react-query cache for the next visit, and abort-on-leave turned
	// fast scrolling into a fetch/cancel storm.
	const handleViewportRangeChange = useCallback(
		(viewportIndices: readonly number[]) => {
			for (const index of viewportIndices) {
				void loadTurnBody(index);
			}
			if ((viewportIndices.at(-1) ?? -1) >= options.length - 5) {
				onApproachEnd();
			}
		},
		[loadTurnBody, onApproachEnd, options.length],
	);
	const handleRetryTurnBody = useCallback(
		(index: number) => {
			void loadTurnBody(index);
		},
		[loadTurnBody],
	);

	useMountEffect(() => () => {
		for (const controller of pendingTurnControllersRef.current.values()) {
			controller.abort(
				new DOMException("Session detail pane unmounted.", "AbortError"),
			);
		}
		pendingTurnControllersRef.current.clear();
		pendingTurnIdsRef.current.clear();
	});

	return {
		bodyStates,
		effectiveTurnBodies,
		handleRetryTurnBody,
		handleViewportRangeChange,
		loadedOptions,
	};
}

function mergeSessionDetailTurnBodies(
	current: ReadonlyMap<string, SessionDetailTurn>,
	incoming: ReadonlyMap<string, SessionDetailTurn>,
) {
	let changed = false;
	const next = new Map(current);
	for (const [turnId, body] of incoming) {
		if (next.get(turnId) !== body) {
			next.set(turnId, body);
			changed = true;
		}
	}
	return changed ? next : current;
}

function updateSessionDetailBodyState(
	current: ReadonlyMap<string, "error" | "loading">,
	turnId: string,
	state: "error" | "loading" | undefined,
) {
	if (current.get(turnId) === state) {
		return current;
	}
	const next = new Map(current);
	if (state) {
		next.set(turnId, state);
	} else {
		next.delete(turnId);
	}
	return next;
}
