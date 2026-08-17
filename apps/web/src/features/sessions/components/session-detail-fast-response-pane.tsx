// biome-ignore-all lint/nursery/noExcessiveLinesPerFile: The staged virtual transcript controller remains colocated until the legacy path is removed.
import type {
	SessionDetailOverview,
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
	// biome-ignore lint/style/noRestrictedImports: external-store, URL-anchor, and delayed-debug synchronization require dependency-aware effects.
	useEffect,
	useMemo,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";
import { useSearchParams } from "react-router-dom";
import { useMountEffect } from "@/app/hooks/useMountEffect";
import { Button } from "@/app/ui/button";
import { Skeleton } from "@/app/ui/skeleton";
import { ConversationTrace } from "@/components/conversation/ConversationTrace";
import { buildConversationTrace } from "@/components/conversation/conversation-trace";
import { parseConversations } from "@/lib/conversation-schema";
import { SessionContinuousTurnThread } from "./session-continuous-turn-thread";
import type { SessionContinuousTurnViewportStore } from "./session-continuous-turn-viewport-store";
import {
	fetchSessionDetailSubagent,
	fetchSessionDetailTurn,
	fetchSessionDetailWindow,
	isSessionDetailStaleRevisionError,
	isSessionDetailWindowUnsupportedError,
	SESSION_DETAIL_BODY_CACHE_TIME_MS,
	SESSION_DETAIL_IMMUTABLE_STALE_TIME_MS,
	SESSION_DETAIL_WINDOW_CACHE_TIME_MS,
	sessionDetailSubagentQueryKey,
	sessionDetailTurnQueryKey,
	sessionDetailWindowQueryKey,
	shouldRetrySessionDetailFastQuery,
} from "./session-detail-fast-query";
import { useSessionDetailFastTurnBodies } from "./session-detail-fast-turn-bodies";
import {
	resolveSessionDetailLevel,
	type SessionDetailLevel,
} from "./session-detail-level";
import { SessionDetailLevelToggle } from "./session-detail-level-toggle";
import type {
	buildSessionDetailOverviewViewModel,
	SessionDetailOverviewTurnOption,
} from "./session-detail-overview-model";
import {
	attachSessionDetailTurnBody,
	buildSessionDetailOverviewTurnOptions,
} from "./session-detail-overview-model";
import type { SessionDetailSearchLoadState } from "./session-detail-search";
import { SessionDetailSearchControl } from "./session-detail-search-control";
import {
	getSessionDetailSkeletonDebugKey,
	getSessionDetailSkeletonTurnPolicy,
	type SessionDetailSkeletonDebugMode,
} from "./session-detail-skeleton-debug";
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

type SessionDetailOverviewViewModel = ReturnType<
	typeof buildSessionDetailOverviewViewModel
>;
type SubagentSummary = SessionDetailOverview["subagents"][number];

export function SessionDetailFastResponsePane({
	anchorTurnId,
	bottomPaddingClassName,
	onCancelSearchLoad,
	onApproachEnd,
	onSearchFocus,
	onSearchHit,
	onStaleRevision,
	options,
	responseScrollRef,
	revision,
	searchLoad,
	searchLoadModeKey,
	selection,
	sessionId,
	skeletonDebugMode,
	subagents,
	userImageUrl,
	viewModel,
	viewportStore,
}: {
	anchorTurnId: string | undefined;
	bottomPaddingClassName: string;
	onCancelSearchLoad: () => void;
	onApproachEnd: () => void;
	onSearchFocus: () => void;
	onSearchHit: (index: number) => void;
	onStaleRevision: (error: unknown) => void;
	options: readonly SessionDetailOverviewTurnOption[];
	responseScrollRef: RefObject<HTMLDivElement | null>;
	revision: string;
	searchLoad: SessionDetailSearchLoadState;
	searchLoadModeKey: string;
	selection: SessionTurnSelection;
	sessionId: string;
	skeletonDebugMode: SessionDetailSkeletonDebugMode;
	subagents: readonly SubagentSummary[];
	userImageUrl: string | undefined;
	viewModel: SessionDetailOverviewViewModel;
	viewportStore: SessionContinuousTurnViewportStore;
}) {
	const queryClient = useQueryClient();
	const [searchParams, setSearchParams] = useSearchParams();
	const detailLevel = resolveSessionDetailLevel(searchParams.get("level"));
	const wantsVirtualTranscript = searchParams.get("transcript") === "virtual";
	const transcriptDebugEnabled =
		import.meta.env.DEV && searchParams.get("transcriptDebug") === "1";
	const skeletonDebugKey = getSessionDetailSkeletonDebugKey(skeletonDebugMode);
	const initialWindowRequest = useMemo<SessionDetailWindowRequest>(
		() => ({
			includeBodies: true,
			mode: "initial",
			sessionId,
		}),
		[sessionId],
	);
	const initialWindowQuery = useQuery({
		enabled: wantsVirtualTranscript,
		gcTime: SESSION_DETAIL_WINDOW_CACHE_TIME_MS,
		queryFn: ({ signal }) =>
			fetchSessionDetailWindow(initialWindowRequest, signal),
		queryKey: sessionDetailWindowQueryKey(
			initialWindowRequest,
			skeletonDebugKey,
		),
		retry: (failureCount, error) =>
			!isSessionDetailWindowUnsupportedError(error) &&
			shouldRetrySessionDetailFastQuery(failureCount, error),
		staleTime: SESSION_DETAIL_IMMUTABLE_STALE_TIME_MS,
	});
	const {
		bodyStates,
		effectiveTurnBodies,
		handleRetryTurnBody,
		handleViewportRangeChange,
		loadedOptions,
	} = useSessionDetailFastTurnBodies({
		onApproachEnd,
		onStaleRevision,
		options,
		revision,
		searchLoad,
		searchLoadModeKey,
		sessionId,
		skeletonDebugMode,
	});
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

	useMountEffect(() => {
		responseScrollRef.current
			?.querySelector<HTMLElement>(
				`[data-continuous-turn-index="${selection.index}"]`,
			)
			?.scrollIntoView({ block: "nearest" });
	});

	function handleDetailLevelChange(nextLevel: SessionDetailLevel) {
		setSearchParams(
			(previousSearchParams) => {
				const nextSearchParams = new URLSearchParams(previousSearchParams);
				if (nextLevel === "normal") {
					nextSearchParams.delete("level");
				} else {
					nextSearchParams.set("level", nextLevel);
				}
				return nextSearchParams;
			},
			{ replace: true },
		);
	}

	return (
		<div className="flex h-full min-h-0 min-w-0 flex-col">
			<header className="flex min-h-12 shrink-0 items-center gap-3 border-b border-(--session-overview-border) bg-(--session-overview-surface) px-3">
				<h2 className="min-w-0 truncate text-base font-medium tracking-[-0.01em] text-(--session-overview-text) sm:text-sm">
					Session Detail
				</h2>
				<SessionDetailLevelToggle
					onChange={handleDetailLevelChange}
					value={detailLevel}
				/>
				<SessionDetailSearchControl
					bodies={effectiveTurnBodies}
					loadState={searchLoad}
					onCancel={onCancelSearchLoad}
					onFocus={onSearchFocus}
					onSelectResult={onSearchHit}
					options={options}
				/>
			</header>
			<section
				ref={responseScrollRef}
				aria-label="Conversation thread"
				className={`session-constellation-tree h-full min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain bg-(--session-overview-surface) [overflow-anchor:none] [scrollbar-gutter:stable] ${bottomPaddingClassName}`}
				data-conversation-trace-scroll-container
				data-session-trace-presentation="constellation-tree-branch-dots-no-horizontal"
			>
				{wantsVirtualTranscript && initialWindowQuery.isPending ? (
					<TurnBodySkeleton />
				) : null}
				{wantsVirtualTranscript &&
				initialWindowQuery.error &&
				!isSessionDetailWindowUnsupportedError(initialWindowQuery.error) ? (
					<PaneMessage
						actionLabel="Retry transcript"
						message="The transcript window could not be loaded."
						onAction={() => {
							void initialWindowQuery.refetch();
						}}
					/>
				) : null}
				{wantsVirtualTranscript && initialWindowQuery.data ? (
					<SessionDetailVirtualTranscript
						anchorTurnId={anchorTurnId}
						debugEnabled={transcriptDebugEnabled}
						initialWindow={initialWindowQuery.data}
						level={detailLevel}
						onApproachEnd={onApproachEnd}
						onStaleRevision={onStaleRevision}
						queryClient={queryClient}
						responseScrollRef={responseScrollRef}
						selectedTurnId={anchorTurnId ?? options[selection.index]?.turnId}
						sessionId={sessionId}
						skeletonDebugKey={skeletonDebugKey}
						skeletonDebugMode={skeletonDebugMode}
						userImageUrl={userImageUrl}
						viewModel={viewModel}
						viewportStore={viewportStore}
					/>
				) : null}
				{!wantsVirtualTranscript ||
				isSessionDetailWindowUnsupportedError(initialWindowQuery.error) ? (
					<SessionContinuousTurnThread
						bodyStates={bodyStates}
						debugMode={skeletonDebugMode}
						onRetryTurnBody={handleRetryTurnBody}
						onViewportRangeChange={handleViewportRangeChange}
						options={loadedOptions}
						scrollContainerRef={responseScrollRef}
						traceCallDisplayMode={detailLevel}
						userImageUrl={userImageUrl}
						viewModel={viewModel}
						viewportStore={viewportStore}
					/>
				) : null}
				<SessionDetailSubagents
					onStaleRevision={onStaleRevision}
					revision={revision}
					sessionId={sessionId}
					subagents={subagents}
				/>
			</section>
		</div>
	);
}

function SessionDetailVirtualTranscript({
	anchorTurnId,
	debugEnabled,
	initialWindow,
	level,
	onApproachEnd,
	onStaleRevision,
	queryClient,
	responseScrollRef,
	selectedTurnId,
	sessionId,
	skeletonDebugKey,
	skeletonDebugMode,
	userImageUrl,
	viewModel,
	viewportStore,
}: {
	anchorTurnId: string | undefined;
	debugEnabled: boolean;
	initialWindow: SessionDetailWindow;
	level: SessionDetailLevel;
	onApproachEnd: () => void;
	onStaleRevision: (error: unknown) => void;
	queryClient: QueryClient;
	responseScrollRef: RefObject<HTMLDivElement | null>;
	selectedTurnId: string | undefined;
	sessionId: string;
	skeletonDebugKey: string;
	skeletonDebugMode: SessionDetailSkeletonDebugMode;
	userImageUrl: string | undefined;
	viewModel: SessionDetailOverviewViewModel;
	viewportStore: SessionContinuousTurnViewportStore;
}) {
	const listRef = useRef<SessionTranscriptListHandle>(null);
	const [sectionCache] = useState(createTranscriptSectionCache);
	const [expandedTurnIds, setExpandedTurnIds] = useState<ReadonlySet<string>>(
		() => new Set(),
	);
	const [missingTurnId, setMissingTurnId] = useState<string>();
	const [fallbackBodies, setFallbackBodies] = useState<
		ReadonlyMap<
			string,
			NonNullable<SessionDetailWindow["turns"][number]["body"]>
		>
	>(() => new Map());
	const [fallbackStates, setFallbackStates] = useState<
		ReadonlyMap<string, "error" | "loading">
	>(() => new Map());
	const [debugReadyTurnIds, setDebugReadyTurnIds] = useState<
		ReadonlySet<string>
	>(() => new Set());
	const fetchWindow = useCallback(
		(request: SessionDetailWindowRequest) =>
			queryClient.fetchQuery({
				gcTime: SESSION_DETAIL_WINDOW_CACHE_TIME_MS,
				queryFn: ({ signal }) => fetchSessionDetailWindow(request, signal),
				queryKey: sessionDetailWindowQueryKey(request, skeletonDebugKey),
				retry: shouldRetrySessionDetailFastQuery,
				staleTime: SESSION_DETAIL_IMMUTABLE_STALE_TIME_MS,
			}),
		[queryClient, skeletonDebugKey],
	);
	const windowStore = useMemo(
		() =>
			createSessionTranscriptWindowStore({
				fetchWindow,
				initialWindow,
				sessionId,
			}),
		[fetchWindow, initialWindow, sessionId],
	);
	const subscribe = useCallback(
		(listener: () => void) =>
			windowStore.subscribe(() => startTransition(listener)),
		[windowStore],
	);
	const snapshot = useSyncExternalStore(
		subscribe,
		windowStore.getSnapshot,
		windowStore.getSnapshot,
	);

	useEffect(() => {
		const timers: number[] = [];
		for (const [index, turn] of snapshot.turns.entries()) {
			const policy = getSessionDetailSkeletonTurnPolicy(
				skeletonDebugMode,
				index,
			);
			if (
				policy.hydrate &&
				policy.delayMs > 0 &&
				!debugReadyTurnIds.has(turn.turnId)
			) {
				timers.push(
					window.setTimeout(() => {
						setDebugReadyTurnIds((current) => {
							if (current.has(turn.turnId)) {
								return current;
							}
							return new Set([...current, turn.turnId]);
						});
					}, policy.delayMs),
				);
			}
		}
		return () => {
			for (const timer of timers) {
				window.clearTimeout(timer);
			}
		};
	}, [debugReadyTurnIds, skeletonDebugMode, snapshot.turns]);

	const windowOptions = useMemo(
		() => buildSessionDetailOverviewTurnOptions(snapshot.turns),
		[snapshot.turns],
	);
	const rawModel = useMemo(() => {
		const optionById = new Map(
			windowOptions.map((option) => [option.turnId, option]),
		);
		return buildSessionTranscriptRowModel({
			cache: sectionCache,
			folds: {
				expandedTurnIds,
				protectedTurnIds: new Set(selectedTurnId ? [selectedTurnId] : []),
			},
			includeSubagentsAnchor: true,
			level,
			newerEdge: snapshot.newerCursor ? snapshot.newerState : undefined,
			olderEdge: snapshot.olderCursor ? snapshot.olderState : undefined,
			revision: snapshot.revision,
			turns: snapshot.turns.flatMap((turn, index) => {
				const option = optionById.get(turn.turnId);
				if (!option) {
					return [];
				}
				const policy = getSessionDetailSkeletonTurnPolicy(
					skeletonDebugMode,
					index,
				);
				const body = fallbackBodies.get(turn.turnId) ?? turn.body ?? undefined;
				const normalizedBody = body
					? attachSessionDetailTurnBody(option, {
							revision: snapshot.revision,
							responseItems: body.responseItems,
							turnId: turn.turnId,
							userItems: body.userItems,
						}).turn
					: undefined;
				const debugBodyReady =
					policy.hydrate &&
					(policy.delayMs === 0 || debugReadyTurnIds.has(turn.turnId));
				const visibleBody = debugBodyReady ? normalizedBody : undefined;
				const fallbackState = fallbackStates.get(turn.turnId);
				return [
					{
						body: visibleBody,
						bodyState:
							fallbackState ??
							(turn.bodyOmitted === "oversized" && !visibleBody
								? ("error" as const)
								: ("loading" as const)),
						option,
						requestUsagePlacement: "start" as const,
					},
				];
			}),
		});
	}, [
		debugReadyTurnIds,
		expandedTurnIds,
		fallbackBodies,
		fallbackStates,
		level,
		sectionCache,
		selectedTurnId,
		skeletonDebugMode,
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
			void windowStore
				.loadDirection(direction)
				.then(() => {
					if (direction === "newer") {
						onApproachEnd();
					}
				})
				.catch((error: unknown) => {
					if (isSessionDetailStaleRevisionError(error)) {
						onStaleRevision(error);
					}
				});
		},
		[onApproachEnd, onStaleRevision, windowStore],
	);
	const loadAnchor = useCallback(
		async (turnId: string) => {
			setMissingTurnId(undefined);
			try {
				const loaded = await windowStore.loadAnchor(turnId);
				if (!loaded) {
					setMissingTurnId(turnId);
				}
				return loaded;
			} catch (error) {
				if (isSessionDetailStaleRevisionError(error)) {
					onStaleRevision(error);
				} else {
					setMissingTurnId(turnId);
				}
				return false;
			}
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
		if (!anchorTurnId) {
			return;
		}
		void listRef.current
			?.scrollToTurn(anchorTurnId, { expandFolds: true })
			.then((found) => {
				if (!found) {
					setMissingTurnId(anchorTurnId);
				}
			});
	}, [anchorTurnId]);

	return (
		<>
			{missingTurnId ? (
				<output className="pointer-events-none fixed top-16 right-4 z-50 rounded-md border border-(--session-overview-border) bg-(--session-overview-surface) px-3 py-2 text-xs text-(--session-overview-text) shadow-sm">
					Turn {missingTurnId} no longer exists in the latest upload.
				</output>
			) : null}
			<SessionTranscriptList
				ref={listRef}
				bodyTurnCount={snapshot.turns.filter((turn) => turn.body).length}
				debugEnabled={debugEnabled}
				model={model}
				onLoadAnchor={loadAnchor}
				onLoadDirection={loadDirection}
				onExpandTurn={expandTurn}
				onRetryTurn={retryTurn}
				onToggleFold={toggleFold}
				pendingCount={snapshot.pending}
				scrollContainerRef={responseScrollRef}
				selectedTurnId={selectedTurnId}
				userImageUrl={userImageUrl}
				viewModel={viewModel}
				viewportStore={viewportStore}
				windowsLoaded={snapshot.windowsLoaded}
			/>
		</>
	);
}

function SessionDetailSubagents({
	onStaleRevision,
	revision,
	sessionId,
	subagents,
}: {
	onStaleRevision: (error: unknown) => void;
	revision: string;
	sessionId: string;
	subagents: readonly SubagentSummary[];
}) {
	if (subagents.length === 0) {
		return null;
	}
	return (
		<section className="border-t border-(--session-overview-border) p-3">
			<h3 className="mb-2 text-xs font-medium text-(--session-overview-muted)">
				Subagents ({subagents.length.toLocaleString()})
			</h3>
			<div className="grid gap-2">
				{subagents.map((subagent) => (
					<SessionDetailSubagentDisclosure
						key={subagent.subagentId}
						onStaleRevision={onStaleRevision}
						revision={revision}
						sessionId={sessionId}
						subagent={subagent}
					/>
				))}
			</div>
		</section>
	);
}

function SessionDetailSubagentDisclosure({
	onStaleRevision,
	revision,
	sessionId,
	subagent,
}: {
	onStaleRevision: (error: unknown) => void;
	revision: string;
	sessionId: string;
	subagent: SubagentSummary;
}) {
	const queryClient = useQueryClient();
	const [open, setOpen] = useState(false);
	const input = { revision, sessionId, subagentId: subagent.subagentId };
	const queryKey = sessionDetailSubagentQueryKey(input);
	const query = useQuery({
		enabled: open && subagent.hasTranscript,
		gcTime: SESSION_DETAIL_BODY_CACHE_TIME_MS,
		queryFn: async ({ signal }) => {
			try {
				return await fetchSessionDetailSubagent(input, signal);
			} catch (error) {
				if (isSessionDetailStaleRevisionError(error)) {
					onStaleRevision(error);
				}
				throw error;
			}
		},
		queryKey,
		retry: shouldRetrySessionDetailFastQuery,
		staleTime: SESSION_DETAIL_IMMUTABLE_STALE_TIME_MS,
	});
	const trace = useMemo(
		() =>
			query.data
				? buildConversationTrace(parseConversations(query.data.content))
				: [],
		[query.data],
	);

	return (
		<details
			className="rounded-lg border border-(--session-overview-border)"
			onToggle={(event) => {
				const nextOpen = event.currentTarget.open;
				setOpen(nextOpen);
				if (!nextOpen) {
					void queryClient.cancelQueries({ exact: true, queryKey });
				}
			}}
		>
			<summary className="cursor-pointer px-3 py-2 text-xs text-(--session-overview-text)">
				{subagent.subagentId}
				{subagent.model ? ` · ${subagent.model}` : ""}
			</summary>
			<div className="border-t border-(--session-overview-border) p-3">
				{!subagent.hasTranscript ? (
					<PaneMessage message="No subagent transcript recorded" />
				) : null}
				{query.isPending ? <TurnBodySkeleton /> : null}
				{query.error ? (
					<PaneMessage
						actionLabel="Retry subagent"
						message="This subagent transcript could not be loaded."
						onAction={() => {
							void query.refetch();
						}}
					/>
				) : null}
				{query.data && trace.length === 0 ? (
					<pre className="overflow-x-auto whitespace-pre-wrap text-xs text-(--session-overview-text)">
						{query.data.content}
					</pre>
				) : null}
				{trace.length > 0 ? (
					<ConversationTrace
						agentLabel={subagent.model ?? "Subagent"}
						agentModel={subagent.model ?? undefined}
						agentSectionMode="expanded"
						items={trace}
					/>
				) : null}
			</div>
		</details>
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
