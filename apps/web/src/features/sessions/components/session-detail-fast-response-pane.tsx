// biome-ignore-all lint/nursery/noExcessiveLinesPerFile: The staged virtual transcript controller remains colocated until the legacy path is removed.
import type {
	SessionDetailOverview,
	SessionDetailSpineTurn,
	SessionDetailWindow,
	SessionDetailWindowRequest,
} from "@rudel/api-routes";
import {
	type QueryClient,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import {
	type RefObject,
	startTransition,
	useCallback,
	// biome-ignore lint/style/noRestrictedImports: external-store and URL-anchor synchronization require dependency-aware effects.
	useEffect,
	useImperativeHandle,
	useMemo,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";
import { useSearchParams } from "react-router-dom";
import { useMountEffect } from "@/app/hooks/useMountEffect";
import { Button } from "@/app/ui/button";
import { Skeleton } from "@/app/ui/skeleton";
import {
	ConversationTrace,
	TraceExpansionNamespaceProvider,
} from "@/components/conversation/ConversationTrace";
import type {
	TraceEvent,
	TraceItem,
} from "@/components/conversation/conversation-trace";
import { ConversationTraceDelegationPayloadRow } from "@/components/conversation/conversation-trace-delegation-payload-row";
import { formatModelDisplayLabel } from "@/features/dashboard/components/dashboard-model-brand";
import type { SessionContinuousTurnViewportStore } from "./session-continuous-turn-viewport-store";
import { SessionDetailActivityStrip } from "./session-detail-activity-strip";
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
import type { SessionDetailLevel } from "./session-detail-level";
import type {
	buildSessionDetailOverviewViewModel,
	SessionDetailOverviewTurnOption,
} from "./session-detail-overview-model";
import {
	buildSessionDetailOverviewTurnOptions,
	buildSessionDetailSpineTurnOption,
	normalizeSessionDetailTurnBody,
} from "./session-detail-overview-model";
import {
	applySessionDetailSkeletonDebugMode,
	getSessionDetailSkeletonDebugKey,
	resolveSessionDetailSkeletonDebugMode,
} from "./session-detail-skeleton-debug";
import {
	SessionDetailSubagentBranch,
	type SessionDetailSubagentSummary,
} from "./session-detail-subagent-branch";
import {
	SessionTranscriptList,
	type SessionTranscriptListHandle,
} from "./session-transcript-list";
import {
	buildSessionTranscriptRowModel,
	createTranscriptSectionCache,
	stabilizeTranscriptRows,
} from "./session-transcript-sections";
import { createSessionTranscriptWindowStore } from "./session-transcript-window-store";
import type { SessionTurnSelection } from "./session-turn-table-selection";
import { markTranscriptMeasure } from "./transcript-debug";
import {
	createTranscriptTraceInstanceId,
	ensureTranscriptTrace,
	recordAnchorJournal,
	recordTranscriptComponentLifecycle,
} from "./transcript-forensics";

type SessionDetailOverviewViewModel = ReturnType<
	typeof buildSessionDetailOverviewViewModel
>;
type SessionDetailWindowLoader = (
	request: SessionDetailWindowRequest,
	signal: AbortSignal,
) => Promise<SessionDetailWindow>;
const EMPTY_PROTECTED_TURN_IDS: ReadonlySet<string> = new Set();

export function SessionDetailFastResponsePane({
	activityTotals,
	anchorEventId,
	anchorEventRequestId,
	anchorRequestTurnId,
	anchorTurnId,
	bottomPaddingClassName,
	onMinimumWidthChange,
	onSelectTurn,
	onStaleRevision,
	options,
	overviewLoading,
	responseScrollRef,
	revision,
	selection,
	sessionId,
	subagents,
	userImageUrl,
	viewModel,
	viewportStore,
	transcriptListRef,
	turnSpine,
}: {
	activityTotals: SessionDetailOverview["activityTotals"];
	anchorEventId: string | undefined;
	anchorEventRequestId: number;
	anchorRequestTurnId: string | undefined;
	anchorTurnId: string | undefined;
	bottomPaddingClassName: string;
	onMinimumWidthChange: (width: number) => void;
	onSelectTurn: (target: {
		eventId: string | undefined;
		turnIndex: number;
	}) => void;
	onStaleRevision: (error: unknown) => void;
	options: readonly SessionDetailOverviewTurnOption[];
	overviewLoading: boolean;
	responseScrollRef: RefObject<HTMLDivElement | null>;
	revision: string;
	selection: SessionTurnSelection;
	sessionId: string;
	subagents: readonly SessionDetailSubagentSummary[];
	userImageUrl: string | undefined;
	viewModel: SessionDetailOverviewViewModel;
	viewportStore: SessionContinuousTurnViewportStore;
	transcriptListRef: RefObject<SessionTranscriptListHandle | null>;
	turnSpine: readonly SessionDetailSpineTurn[];
}) {
	const queryClient = useQueryClient();
	const [searchParams] = useSearchParams();
	const detailLevel: SessionDetailLevel = "normal";
	const requestedTranscriptMode = searchParams.get("transcript");
	const requestedSkeletonMode = searchParams.get("skeletons");
	const skeletonDebugMode = useMemo(
		() =>
			resolveSessionDetailSkeletonDebugMode(
				requestedSkeletonMode,
				import.meta.env.DEV,
			),
		[requestedSkeletonMode],
	);
	const transcriptDebugEnabled =
		import.meta.env.DEV && searchParams.get("transcriptDebug") === "1";
	ensureTranscriptTrace(transcriptDebugEnabled);
	const [traceInstanceId] = useState(() =>
		createTranscriptTraceInstanceId("pane"),
	);
	const paneFingerprintRef = useRef(`${sessionId}:${revision}`);
	paneFingerprintRef.current = `${sessionId}:${revision}`;
	useMountEffect(() => {
		if (requestedTranscriptMode === "legacy") {
			console.warn(
				"[SessionDetailView] ?transcript=legacy is deprecated; the windowed virtual transcript is now the only renderer.",
			);
		}
	});
	useMountEffect(() => {
		if (!transcriptDebugEnabled) {
			return;
		}
		recordTranscriptComponentLifecycle({
			component: "pane",
			instanceId: traceInstanceId,
			phase: "mount",
			propsFingerprint: paneFingerprintRef.current,
		});
		return () =>
			recordTranscriptComponentLifecycle({
				component: "pane",
				instanceId: traceInstanceId,
				phase: "unmount",
				propsFingerprint: paneFingerprintRef.current,
			});
	});
	const skeletonDebugKey = getSessionDetailSkeletonDebugKey(skeletonDebugMode);
	const loadWindow = useCallback<SessionDetailWindowLoader>(
		async (request, signal) =>
			applySessionDetailSkeletonDebugMode(
				await fetchSessionDetailWindow(request, signal),
				skeletonDebugMode,
				signal,
			),
		[skeletonDebugMode],
	);
	const initialWindowRequest = useMemo<SessionDetailWindowRequest>(
		() => ({
			includeBodies: true,
			mode: "initial",
			sessionId,
		}),
		[sessionId],
	);
	const initialWindowQuery = useQuery({
		gcTime: SESSION_DETAIL_WINDOW_CACHE_TIME_MS,
		queryFn: ({ signal }) => loadWindow(initialWindowRequest, signal),
		queryKey: sessionDetailWindowQueryKey(
			initialWindowRequest,
			skeletonDebugKey,
		),
		retry: shouldRetrySessionDetailFastQuery,
		staleTime: SESSION_DETAIL_IMMUTABLE_STALE_TIME_MS,
	});
	const hasStaleInitialWindow =
		initialWindowQuery.error !== null &&
		isSessionDetailStaleRevisionError(initialWindowQuery.error);
	useEffect(() => {
		if (
			initialWindowQuery.data &&
			initialWindowQuery.data.revision !== revision
		) {
			onStaleRevision(new Error("The transcript window revision changed."));
		} else if (
			initialWindowQuery.error &&
			isSessionDetailStaleRevisionError(initialWindowQuery.error)
		) {
			onStaleRevision(initialWindowQuery.error);
		}
	}, [
		initialWindowQuery.data,
		initialWindowQuery.error,
		onStaleRevision,
		revision,
	]);
	return (
		<div className="flex h-full min-h-0 min-w-0 flex-col">
			<SessionDetailActivityStrip
				activityTotals={activityTotals}
				onMinimumWidthChange={onMinimumWidthChange}
				onJump={onSelectTurn}
				options={options}
				overviewLoading={overviewLoading}
				subagents={subagents}
			/>
			<section
				ref={responseScrollRef}
				aria-label="Conversation thread"
				className={`session-constellation-tree session-constellation-tree-v2 session-transcript-mask h-full min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain bg-(--session-overview-surface) [overflow-anchor:none] [scrollbar-gutter:stable] ${bottomPaddingClassName}`}
				data-conversation-trace-scroll-container
				data-session-constellation-version="v2"
				data-session-trace-presentation="constellation-tree-branch-dots-no-horizontal"
			>
				{initialWindowQuery.isPending || hasStaleInitialWindow ? (
					<TurnBodySkeleton />
				) : null}
				{initialWindowQuery.error && !hasStaleInitialWindow ? (
					<PaneMessage
						actionLabel="Retry transcript"
						message="The transcript window could not be loaded."
						onAction={() => {
							void initialWindowQuery.refetch();
						}}
					/>
				) : null}
				{initialWindowQuery.data ? (
					<SessionDetailVirtualTranscript
						anchorEventId={anchorEventId}
						anchorEventRequestId={anchorEventRequestId}
						anchorSpeaker={selection.speaker}
						anchorRequestTurnId={anchorRequestTurnId}
						anchorTurnId={anchorTurnId}
						debugEnabled={transcriptDebugEnabled}
						initialWindow={initialWindowQuery.data}
						level={detailLevel}
						loadWindow={loadWindow}
						onStaleRevision={onStaleRevision}
						queryClient={queryClient}
						responseScrollRef={responseScrollRef}
						selectedTurnId={anchorTurnId ?? options[selection.index]?.turnId}
						sessionId={sessionId}
						subagents={subagents}
						windowModeKey={skeletonDebugKey}
						userImageUrl={userImageUrl}
						viewModel={viewModel}
						viewportStore={viewportStore}
						transcriptListRef={transcriptListRef}
						turnSpine={turnSpine}
					/>
				) : null}
			</section>
		</div>
	);
}

function SessionDetailVirtualTranscript({
	anchorEventId,
	anchorEventRequestId,
	anchorSpeaker,
	anchorRequestTurnId,
	anchorTurnId,
	debugEnabled,
	initialWindow,
	level,
	loadWindow,
	onStaleRevision,
	queryClient,
	responseScrollRef,
	selectedTurnId,
	sessionId,
	subagents,
	windowModeKey,
	userImageUrl,
	viewModel,
	viewportStore,
	transcriptListRef,
	turnSpine,
}: {
	anchorEventId: string | undefined;
	anchorEventRequestId: number;
	anchorSpeaker: SessionTurnSelection["speaker"];
	anchorRequestTurnId: string | undefined;
	anchorTurnId: string | undefined;
	debugEnabled: boolean;
	initialWindow: SessionDetailWindow;
	level: SessionDetailLevel;
	loadWindow: SessionDetailWindowLoader;
	onStaleRevision: (error: unknown) => void;
	queryClient: QueryClient;
	responseScrollRef: RefObject<HTMLDivElement | null>;
	selectedTurnId: string | undefined;
	sessionId: string;
	subagents: readonly SessionDetailSubagentSummary[];
	windowModeKey: string;
	userImageUrl: string | undefined;
	viewModel: SessionDetailOverviewViewModel;
	viewportStore: SessionContinuousTurnViewportStore;
	transcriptListRef: RefObject<SessionTranscriptListHandle | null>;
	turnSpine: readonly SessionDetailSpineTurn[];
}) {
	const listRef = useRef<SessionTranscriptListHandle>(null);
	const imperativeAnchorRef = useRef<
		| {
				promise: Promise<boolean>;
				speaker: SessionTurnSelection["speaker"] | undefined;
				turnId: string;
		  }
		| undefined
	>(undefined);
	const handledAnchorRef = useRef<
		| {
				requestId: number;
				turnId: string;
		  }
		| undefined
	>(undefined);
	const pendingAnchorFlashRef = useRef<
		| {
				requestId: number;
				speaker: SessionTurnSelection["speaker"];
				turnId: string;
		  }
		| undefined
	>(undefined);
	const anchorFlashSequenceRef = useRef(0);
	const flashTranscriptSpeakerSegment = useCallback(
		(turnId: string, speaker: SessionTurnSelection["speaker"]) => {
			anchorFlashSequenceRef.current += 1;
			const sequence = anchorFlashSequenceRef.current;
			const container = responseScrollRef.current;
			const turnElements = findTranscriptAnchorRowElements(
				container,
				turnId,
				speaker,
			);
			if (turnElements.length === 0 || !container) {
				return false;
			}
			const stickyHeaderElements = findTranscriptStickyHeaderElements(
				container,
				turnId,
				speaker,
			);
			flashTranscriptAnchors([...turnElements, ...stickyHeaderElements]);
			if (stickyHeaderElements.length === 0) {
				scheduleTranscriptStickyHeaderFlash({
					container,
					isActive: () => anchorFlashSequenceRef.current === sequence,
					speaker,
					turnId,
				});
			}
			return true;
		},
		[responseScrollRef],
	);
	useImperativeHandle(
		transcriptListRef,
		() => ({
			scrollToTurn: (turnId, options) => {
				const promise =
					listRef.current?.scrollToTurn(turnId, options) ??
					Promise.resolve(false);
				imperativeAnchorRef.current = {
					promise,
					speaker: options?.speaker,
					turnId,
				};
				return promise;
			},
		}),
		[],
	);
	const [sectionCache] = useState(createTranscriptSectionCache);
	const optionCacheRef = useRef(
		new Map<
			string,
			{
				option: SessionDetailOverviewTurnOption;
				turn: SessionDetailWindow["turns"][number];
			}
		>(),
	);
	const normalizedBodyCacheRef = useRef(
		new WeakMap<
			NonNullable<SessionDetailWindow["turns"][number]["body"]>,
			{
				inlineBranches: ReadonlyMap<string, InlineSubagentBranch>;
				rootBody: ReturnType<typeof normalizeSessionDetailTurnBody>;
			}
		>(),
	);
	const [expandedTurnIds, setExpandedTurnIds] = useState<ReadonlySet<string>>(
		() => new Set(),
	);
	const [fallbackBodies, setFallbackBodies] = useState<
		ReadonlyMap<
			string,
			NonNullable<SessionDetailWindow["turns"][number]["body"]>
		>
	>(() => new Map());
	const [fallbackStates, setFallbackStates] = useState<
		ReadonlyMap<string, "error" | "loading">
	>(() => new Map());
	const getCachedTurnBody = useCallback(
		(body: NonNullable<SessionDetailWindow["turns"][number]["body"]>) => {
			const existing = normalizedBodyCacheRef.current.get(body);
			if (existing) {
				return existing;
			}
			markTranscriptMeasure("body-normalize", "start", debugEnabled);
			try {
				const normalized = normalizeSessionDetailTurnBody(body);
				const cached = {
					inlineBranches: collectInlineSubagentBranches([
						normalized.responseItems,
					]),
					rootBody: {
						...normalized,
						responseItems: rootTraceItems(normalized.responseItems),
					},
				};
				normalizedBodyCacheRef.current.set(body, cached);
				return cached;
			} finally {
				markTranscriptMeasure("body-normalize", "end", debugEnabled);
			}
		},
		[debugEnabled],
	);
	const fetchWindow = useCallback(
		async (request: SessionDetailWindowRequest, signal?: AbortSignal) => {
			const queryKey = sessionDetailWindowQueryKey(request, windowModeKey);
			const cancelQuery = () => {
				void queryClient.cancelQueries({ exact: true, queryKey });
			};
			signal?.addEventListener("abort", cancelQuery, { once: true });
			try {
				signal?.throwIfAborted();
				return await queryClient.fetchQuery({
					gcTime: SESSION_DETAIL_WINDOW_CACHE_TIME_MS,
					queryFn: ({ signal: querySignal }) =>
						loadWindow(request, querySignal),
					queryKey,
					retry: shouldRetrySessionDetailFastQuery,
					staleTime: SESSION_DETAIL_IMMUTABLE_STALE_TIME_MS,
				});
			} finally {
				signal?.removeEventListener("abort", cancelQuery);
			}
		},
		[loadWindow, queryClient, windowModeKey],
	);
	const evictWindow = useCallback(
		(request: SessionDetailWindowRequest) => {
			queryClient.removeQueries({
				exact: true,
				queryKey: sessionDetailWindowQueryKey(request, windowModeKey),
			});
		},
		[queryClient, windowModeKey],
	);
	const windowStore = useMemo(
		() =>
			createSessionTranscriptWindowStore({
				fetchWindow,
				initialWindow,
				onEvictWindow: evictWindow,
				sessionId,
			}),
		[evictWindow, fetchWindow, initialWindow, sessionId],
	);
	const subscribe = useCallback(
		(listener: () => void) => windowStore.subscribe(listener),
		[windowStore],
	);
	const snapshot = useSyncExternalStore(
		subscribe,
		windowStore.getSnapshot,
		windowStore.getSnapshot,
	);
	const subagentsById = useMemo(
		() => new Map(subagents.map((subagent) => [subagent.subagentId, subagent])),
		[subagents],
	);
	const inlineSubagentBranchesByEventId = useMemo(() => {
		const branches = new Map<string, InlineSubagentBranch>();
		for (const turn of snapshot.turns) {
			const body = fallbackBodies.get(turn.turnId) ?? turn.body;
			if (!body) {
				continue;
			}
			for (const [eventId, branch] of getCachedTurnBody(body).inlineBranches) {
				branches.set(eventId, branch);
			}
		}
		return branches;
	}, [fallbackBodies, getCachedTurnBody, snapshot.turns]);
	const renderEventSubtree = useCallback(
		(event: TraceEvent) => {
			if (event.kind !== "tool") {
				return undefined;
			}
			const subagentId = event.result?.subagentId;
			const subagent = subagentId ? subagentsById.get(subagentId) : undefined;
			if (subagent) {
				return {
					content: (
						<SessionDetailSubagentBranch
							delegationEvent={event}
							onStaleRevision={onStaleRevision}
							revision={snapshot.revision}
							sessionId={sessionId}
							subagent={subagent}
						/>
					),
					kind: "replace-event" as const,
				};
			}
			const inlineBranch = inlineSubagentBranchesByEventId.get(event.id);
			return inlineBranch
				? {
						content: (
							<SessionDetailInlineSubagentBranch
								agentModel={viewModel.safeModelUsed}
								branch={inlineBranch}
								branchesByEventId={inlineSubagentBranchesByEventId}
							/>
						),
						kind: "replace-event" as const,
					}
				: undefined;
		},
		[
			inlineSubagentBranchesByEventId,
			onStaleRevision,
			sessionId,
			snapshot.revision,
			subagentsById,
			viewModel.safeModelUsed,
		],
	);
	useEffect(() => {
		for (const turn of snapshot.turns) {
			if (!turn.body) {
				sectionCache.deleteTurn(turn.turnId);
			}
		}
	}, [sectionCache, snapshot.turns]);

	const windowOptions = useMemo(() => {
		const built = buildSessionDetailOverviewTurnOptions(snapshot.turns);
		return built.map((option, index) => {
			const turn = snapshot.turns[index];
			const cached = optionCacheRef.current.get(option.turnId);
			if (turn && cached?.turn === turn) {
				return cached.option;
			}
			if (turn) {
				optionCacheRef.current.set(option.turnId, { option, turn });
			}
			return option;
		});
	}, [snapshot.turns]);
	const effectiveSpine = useMemo(
		() =>
			turnSpine.length > 0
				? turnSpine
				: initialWindow.turns.map((turn) => ({
						eventCount: turn.toolCallCount,
						responseBytes: 0,
						turnId: turn.turnId,
					})),
		[initialWindow.turns, turnSpine],
	);
	const hasFullSpine = effectiveSpine.length === snapshot.total;
	const rawModel = useMemo(() => {
		markTranscriptMeasure("model-build", "start", debugEnabled);
		try {
			const optionById = new Map(
				windowOptions.map((option) => [option.turnId, option]),
			);
			const turnById = new Map(
				snapshot.turns.map((turn) => [turn.turnId, turn]),
			);
			return buildSessionTranscriptRowModel({
				cache: sectionCache,
				folds: {
					expandedTurnIds,
					protectedTurnIds: EMPTY_PROTECTED_TURN_IDS,
				},
				level,
				newerEdge:
					hasFullSpine || !snapshot.newerCursor
						? undefined
						: snapshot.newerState,
				olderEdge:
					hasFullSpine || !snapshot.olderCursor
						? undefined
						: snapshot.olderState,
				revision: snapshot.revision,
				turns: effectiveSpine.map((spineTurn, index) => {
					const turn = turnById.get(spineTurn.turnId);
					const option =
						optionById.get(spineTurn.turnId) ??
						buildSessionDetailSpineTurnOption(spineTurn, index);
					const body =
						fallbackBodies.get(spineTurn.turnId) ?? turn?.body ?? undefined;
					const normalizedBody = body
						? getCachedTurnBody(body).rootBody
						: undefined;
					const fallbackState = fallbackStates.get(spineTurn.turnId);
					return {
						body: normalizedBody,
						bodyState:
							fallbackState ??
							(turn?.bodyOmitted === "oversized" && !normalizedBody
								? ("error" as const)
								: ("loading" as const)),
						estimatedHeight: estimatePendingTurnHeight(spineTurn),
						option,
						requestUsagePlacement: "start" as const,
					};
				}),
			});
		} finally {
			markTranscriptMeasure("model-build", "end", debugEnabled);
		}
	}, [
		debugEnabled,
		effectiveSpine,
		expandedTurnIds,
		fallbackBodies,
		fallbackStates,
		getCachedTurnBody,
		hasFullSpine,
		level,
		sectionCache,
		snapshot,
		windowOptions,
	]);
	const previousRowsRef = useRef(rawModel.rows);
	const model = useMemo(() => {
		const rows = stabilizeTranscriptRows(
			previousRowsRef.current,
			rawModel.rows,
		);
		previousRowsRef.current = rows;
		return { ...rawModel, rows };
	}, [rawModel]);

	const loadDirection = useCallback(
		(direction: "newer" | "older") => {
			void windowStore.loadDirection(direction).catch((error: unknown) => {
				if (isSessionDetailStaleRevisionError(error)) {
					onStaleRevision(error);
				}
			});
		},
		[onStaleRevision, windowStore],
	);
	const loadAnchor = useCallback(
		async (turnId: string) => {
			const startedAt = debugEnabled ? performance.now() : undefined;
			if (debugEnabled) {
				recordAnchorJournal({
					elapsedMs: 0,
					phase: "fetch-start",
					turnId,
					type: "anchorWindow",
				});
			}
			try {
				const loaded = await windowStore.loadAnchor(turnId);
				if (debugEnabled && startedAt !== undefined) {
					recordAnchorJournal({
						elapsedMs: performance.now() - startedAt,
						phase: "fetch-done",
						turnId,
						type: "anchorWindow",
					});
				}
				return loaded;
			} catch (error) {
				if (debugEnabled && startedAt !== undefined) {
					recordAnchorJournal({
						elapsedMs: performance.now() - startedAt,
						phase: "fetch-error",
						turnId,
						type: "anchorWindow",
					});
				}
				if (isSessionDetailStaleRevisionError(error)) {
					onStaleRevision(error);
				}
				return false;
			}
		},
		[debugEnabled, onStaleRevision, windowStore],
	);
	const observeVisibleTurnIds = useCallback(
		(turnIds: readonly string[]) => {
			void windowStore
				.observeVisibleTurnIds(turnIds)
				.catch((error: unknown) => {
					if (isSessionDetailStaleRevisionError(error)) {
						onStaleRevision(error);
					}
				});
		},
		[onStaleRevision, windowStore],
	);
	const retryTurn = useCallback(
		(turnId: string) => {
			const input = { revision: snapshot.revision, sessionId, turnId };
			setFallbackStates((current) => new Map(current).set(turnId, "loading"));
			void queryClient
				.fetchQuery({
					gcTime: SESSION_DETAIL_BODY_CACHE_TIME_MS,
					queryFn: ({ signal }) => fetchSessionDetailTurn(input, signal),
					queryKey: sessionDetailTurnQueryKey(input),
					retry: shouldRetrySessionDetailFastQuery,
					staleTime: SESSION_DETAIL_IMMUTABLE_STALE_TIME_MS,
				})
				.then((body) => {
					startTransition(() => {
						setFallbackBodies((current) => new Map(current).set(turnId, body));
						setFallbackStates((current) => {
							const next = new Map(current);
							next.delete(turnId);
							return next;
						});
					});
				})
				.catch((error: unknown) => {
					if (isSessionDetailStaleRevisionError(error)) {
						onStaleRevision(error);
						return;
					}
					setFallbackStates((current) => new Map(current).set(turnId, "error"));
				});
		},
		[onStaleRevision, queryClient, sessionId, snapshot.revision],
	);
	const expandTurn = useCallback((turnId: string) => {
		setExpandedTurnIds((current) =>
			current.has(turnId) ? current : new Set([...current, turnId]),
		);
	}, []);
	const toggleFold = useCallback((turnId: string) => {
		setExpandedTurnIds((current) => {
			const next = new Set(current);
			if (next.has(turnId)) {
				next.delete(turnId);
			} else {
				next.add(turnId);
			}
			return next;
		});
	}, []);

	useEffect(() => {
		if (model.rows.length === 0) {
			return;
		}
		const pendingFlash = pendingAnchorFlashRef.current;
		if (!pendingFlash) {
			return;
		}
		if (
			!flashTranscriptSpeakerSegment(pendingFlash.turnId, pendingFlash.speaker)
		) {
			return;
		}
		pendingAnchorFlashRef.current = undefined;
	}, [flashTranscriptSpeakerSegment, model.rows]);

	useEffect(() => {
		if (!anchorTurnId) {
			return;
		}
		if (
			anchorRequestTurnId !== undefined &&
			anchorTurnId !== anchorRequestTurnId
		) {
			if (debugEnabled) {
				recordAnchorJournal({
					outcome: "stale-pair-blocked",
					pairTurnId: anchorRequestTurnId,
					requestId: anchorEventRequestId,
					storedPromiseResult: undefined,
					turnId: anchorTurnId,
					type: "retryEffect",
				});
				console.warn(
					`[anchor] blocked stale request pair: anchorTurnId=${anchorTurnId} pairTurnId=${anchorRequestTurnId} requestId=${anchorEventRequestId}`,
				);
			}
			return;
		}
		if (!model.turnFirstRowIndex.has(anchorTurnId)) {
			if (debugEnabled) {
				recordAnchorJournal({
					outcome: "skipped-no-model",
					pairTurnId: anchorRequestTurnId,
					requestId: anchorEventRequestId,
					storedPromiseResult: undefined,
					turnId: anchorTurnId,
					type: "retryEffect",
				});
			}
			return;
		}
		if (
			pendingAnchorFlashRef.current?.requestId !== undefined &&
			pendingAnchorFlashRef.current.requestId !== anchorEventRequestId
		) {
			pendingAnchorFlashRef.current = undefined;
		}
		if (
			handledAnchorRef.current?.turnId === anchorTurnId &&
			handledAnchorRef.current.requestId === anchorEventRequestId
		) {
			if (debugEnabled) {
				recordAnchorJournal({
					outcome: "skipped-handled",
					pairTurnId: anchorRequestTurnId,
					requestId: anchorEventRequestId,
					storedPromiseResult: undefined,
					turnId: anchorTurnId,
					type: "retryEffect",
				});
			}
			return;
		}
		handledAnchorRef.current = {
			requestId: anchorEventRequestId,
			turnId: anchorTurnId,
		};
		let cancelled = false;
		const imperativeAnchor = imperativeAnchorRef.current;
		const usesStoredPromise =
			imperativeAnchor?.turnId === anchorTurnId &&
			imperativeAnchor.speaker === anchorSpeaker;
		const scrollPromise = usesStoredPromise
			? imperativeAnchor.promise
			: listRef.current?.scrollToTurn(anchorTurnId, {
					expandFolds: anchorEventId !== undefined,
					speaker: anchorSpeaker,
				});
		if (usesStoredPromise) {
			imperativeAnchorRef.current = undefined;
		} else if (debugEnabled) {
			recordAnchorJournal({
				outcome: "ran",
				pairTurnId: anchorRequestTurnId,
				requestId: anchorEventRequestId,
				storedPromiseResult: undefined,
				turnId: anchorTurnId,
				type: "retryEffect",
			});
		}
		if (!scrollPromise) {
			return;
		}
		void scrollPromise.then((found) => {
			if (debugEnabled && usesStoredPromise) {
				recordAnchorJournal({
					outcome: "used-stored-promise",
					pairTurnId: anchorRequestTurnId,
					requestId: anchorEventRequestId,
					storedPromiseResult: found,
					turnId: anchorTurnId,
					type: "retryEffect",
				});
			}
			if (!found || cancelled) {
				return;
			}
			if (!anchorEventId) {
				if (!flashTranscriptSpeakerSegment(anchorTurnId, anchorSpeaker)) {
					pendingAnchorFlashRef.current = {
						requestId: anchorEventRequestId,
						speaker: anchorSpeaker,
						turnId: anchorTurnId,
					};
				}
				return;
			}
			let attempts = 0;
			function scrollToEvent() {
				if (cancelled) {
					return;
				}
				const eventElement = document.getElementById(
					`trace-event-${anchorEventId}`,
				);
				if (eventElement) {
					eventElement.dataset.sessionActivityAnchorRequest =
						String(anchorEventRequestId);
					const scrollElement = responseScrollRef.current;
					const distance = scrollElement
						? Math.abs(
								eventElement.getBoundingClientRect().top -
									scrollElement.getBoundingClientRect().top -
									scrollElement.clientHeight / 2,
							)
						: 0;
					const reducedMotion = window.matchMedia(
						"(prefers-reduced-motion: reduce)",
					).matches;
					eventElement.scrollIntoView({
						behavior:
							reducedMotion || distance > (scrollElement?.clientHeight ?? 0) * 2
								? "auto"
								: "smooth",
						block: "center",
					});
					anchorFlashSequenceRef.current += 1;
					flashTranscriptAnchors([eventElement]);
					return;
				}
				attempts += 1;
				if (attempts < 60) {
					window.requestAnimationFrame(scrollToEvent);
				}
			}
			window.requestAnimationFrame(scrollToEvent);
		});
		return () => {
			cancelled = true;
		};
	}, [
		anchorEventId,
		anchorEventRequestId,
		anchorSpeaker,
		anchorRequestTurnId,
		anchorTurnId,
		debugEnabled,
		flashTranscriptSpeakerSegment,
		model.turnFirstRowIndex,
		responseScrollRef,
	]);

	return (
		<SessionTranscriptList
			ref={listRef}
			bodyTurnCount={snapshot.turns.filter((turn) => turn.body).length}
			debugEnabled={debugEnabled}
			level={level}
			model={model}
			onLoadAnchor={loadAnchor}
			onLoadDirection={loadDirection}
			onExpandTurn={expandTurn}
			onRetryTurn={retryTurn}
			onToggleFold={toggleFold}
			onVisibleTurnIds={observeVisibleTurnIds}
			pendingCount={snapshot.pending}
			scrollContainerRef={responseScrollRef}
			selectedTurnId={selectedTurnId}
			renderEventSubtree={renderEventSubtree}
			userImageUrl={userImageUrl}
			viewModel={viewModel}
			viewportStore={viewportStore}
			windowsLoaded={snapshot.windowsLoaded}
		/>
	);
}

function isRootAgentName(agentName: string | undefined) {
	return (
		agentName === undefined || agentName === "/root" || agentName === "root"
	);
}

function estimatePendingTurnHeight(turn: SessionDetailSpineTurn) {
	return Math.round(
		Math.min(
			1_200,
			Math.max(160, 144 + turn.eventCount * 20 + turn.responseBytes / 120),
		),
	);
}

function flashTranscriptAnchors(elements: readonly HTMLElement[]) {
	if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
		return;
	}
	for (const element of elements) {
		element.animate(
			[
				{
					backgroundColor:
						"color-mix(in oklab, var(--session-overview-accent) 16%, transparent)",
				},
				{ backgroundColor: "transparent" },
			],
			{ duration: 300, easing: "ease-out" },
		);
	}
}

function findTranscriptAnchorRowElements(
	container: HTMLElement | null,
	turnId: string,
	speaker: SessionTurnSelection["speaker"],
) {
	if (!container) {
		return [];
	}
	const escapedTurnId = CSS.escape(turnId);
	const turnSelector = `[data-transcript-turn-id="${escapedTurnId}"]`;
	const turnElements = [
		...container.querySelectorAll<HTMLElement>(turnSelector),
	];
	const preferredElements = turnElements.filter((element) => {
		const rowKind = element.dataset.transcriptRowKind;
		return speaker === "member"
			? rowKind === "member"
			: rowKind !== "member" && rowKind !== "turn-pending";
	});
	if (preferredElements.length > 0) {
		return preferredElements;
	}
	if (
		turnElements.some(
			(element) => element.dataset.transcriptRowKind === "turn-pending",
		)
	) {
		return [];
	}
	const fallbackElement = turnElements[0];
	return fallbackElement ? [fallbackElement] : [];
}

function findTranscriptStickyHeaderElements(
	container: HTMLElement,
	turnId: string,
	speaker: SessionTurnSelection["speaker"],
) {
	const stickyHeaderSelector = [
		`[data-transcript-sticky-header-owner="${CSS.escape(turnId)}"]`,
		`[data-transcript-sticky-header-kind="${speaker === "member" ? "member" : "model"}"]`,
	].join("");
	return [...container.querySelectorAll<HTMLElement>(stickyHeaderSelector)];
}

function scheduleTranscriptStickyHeaderFlash({
	container,
	isActive,
	speaker,
	turnId,
}: {
	container: HTMLElement;
	isActive: () => boolean;
	speaker: SessionTurnSelection["speaker"];
	turnId: string;
}) {
	if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
		return;
	}
	let attempts = 0;
	function tryFlash() {
		if (!isActive()) {
			return;
		}
		const stickyHeaderElements = findTranscriptStickyHeaderElements(
			container,
			turnId,
			speaker,
		);
		if (stickyHeaderElements.length > 0) {
			flashTranscriptAnchors(stickyHeaderElements);
			return;
		}
		attempts += 1;
		if (attempts < 60) {
			window.requestAnimationFrame(tryFlash);
		}
	}
	window.requestAnimationFrame(tryFlash);
}

function rootTraceItems(items: readonly TraceItem[]) {
	return items.filter(
		(item) => item.kind !== "agent" || isRootAgentName(item.agentName),
	);
}

type InlineSubagentBranch = {
	delegationEvent: Extract<TraceEvent, { kind: "tool" }>;
	items: TraceItem[];
	subagentId: string;
};

function collectInlineSubagentItems(items: readonly TraceItem[]) {
	const itemsById = new Map<string, TraceItem[]>();
	for (const item of items) {
		if (item.kind !== "agent" || isRootAgentName(item.agentName)) {
			continue;
		}
		const existing = itemsById.get(item.agentName) ?? [];
		existing.push(item);
		itemsById.set(item.agentName, existing);
	}
	return itemsById;
}

function collectInlineSubagentBranches(
	turns: readonly (readonly TraceItem[])[],
) {
	const branchesByEventId = new Map<string, InlineSubagentBranch>();
	for (const items of turns) {
		const itemsById = collectInlineSubagentItems(items);
		for (const item of items) {
			if (item.kind !== "agent") {
				continue;
			}
			for (const event of item.events) {
				if (event.kind !== "tool") {
					continue;
				}
				const subagentId = event.result?.subagentId;
				const subagentItems = subagentId
					? itemsById.get(subagentId)
					: undefined;
				if (subagentId && subagentItems) {
					branchesByEventId.set(event.id, {
						delegationEvent: event,
						items: subagentItems,
						subagentId,
					});
				}
			}
		}
	}
	return branchesByEventId;
}

function SessionDetailInlineSubagentBranch({
	agentModel,
	branch,
	branchesByEventId,
}: {
	agentModel: string | undefined;
	branch: InlineSubagentBranch;
	branchesByEventId: ReadonlyMap<string, InlineSubagentBranch>;
}) {
	const renderEventSubtree = (event: TraceEvent) => {
		if (event.kind !== "tool") {
			return undefined;
		}
		const childBranch = branchesByEventId.get(event.id);
		return childBranch
			? {
					content: (
						<SessionDetailInlineSubagentBranch
							agentModel={agentModel}
							branch={childBranch}
							branchesByEventId={branchesByEventId}
						/>
					),
					kind: "replace-event" as const,
				}
			: undefined;
	};
	const agentLabel = agentModel
		? formatModelDisplayLabel(agentModel)
		: "Subagent";

	return (
		<div
			className="min-w-0 pl-9"
			data-session-subagent-branch={branch.subagentId}
		>
			<TraceExpansionNamespaceProvider namespace={branch.subagentId}>
				<ConversationTrace
					agentIntroRow={
						<ConversationTraceDelegationPayloadRow
							event={branch.delegationEvent}
						/>
					}
					agentLabel={agentLabel}
					agentModel={agentModel}
					expandedSpeakerLayout="trace-tree"
					items={branch.items}
					renderEventSubtree={renderEventSubtree}
				/>
			</TraceExpansionNamespaceProvider>
		</div>
	);
}

function TurnBodySkeleton() {
	return (
		<div aria-busy="true" className="grid gap-3 p-4">
			<output className="sr-only">Loading selected turn</output>
			<Skeleton className="h-16 w-full rounded-md" />
			<Skeleton className="h-32 w-full rounded-md" />
		</div>
	);
}

function PaneMessage({
	actionLabel,
	message,
	onAction,
}: {
	actionLabel?: string;
	message: string;
	onAction?: () => void;
}) {
	return (
		<div className="flex min-h-48 flex-col items-center justify-center gap-3 p-6 text-center text-sm text-(--session-overview-muted)">
			<p>{message}</p>
			{actionLabel && onAction ? (
				<Button onClick={onAction} size="sm" type="button" variant="outline">
					{actionLabel}
				</Button>
			) : null}
		</div>
	);
}
