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
	// biome-ignore lint/style/noRestrictedImports: external-store and URL-anchor synchronization require dependency-aware effects.
	useEffect,
	useMemo,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { useMountEffect } from "@/app/hooks/useMountEffect";
import { isSessionDetailV2Path } from "@/app/routes";
import { Button } from "@/app/ui/button";
import { Skeleton } from "@/app/ui/skeleton";
import { ConversationTrace } from "@/components/conversation/ConversationTrace";
import { buildConversationTrace } from "@/components/conversation/conversation-trace";
import { parseConversations } from "@/lib/conversation-schema";
import type { SessionContinuousTurnViewportStore } from "./session-continuous-turn-viewport-store";
import { SessionDetailActivityStrip } from "./session-detail-activity-strip";
import {
	fetchSessionDetailSubagent,
	fetchSessionDetailTurn,
	fetchSessionDetailWindow,
	isSessionDetailStaleRevisionError,
	SESSION_DETAIL_BODY_CACHE_TIME_MS,
	SESSION_DETAIL_IMMUTABLE_STALE_TIME_MS,
	SESSION_DETAIL_WINDOW_CACHE_TIME_MS,
	sessionDetailSubagentQueryKey,
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
	attachSessionDetailTurnBody,
	buildSessionDetailOverviewTurnOptions,
} from "./session-detail-overview-model";
import {
	applySessionDetailSkeletonDebugMode,
	getSessionDetailSkeletonDebugKey,
	resolveSessionDetailSkeletonDebugMode,
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
import {
	createTranscriptTraceInstanceId,
	ensureTranscriptTrace,
	recordTranscriptComponentLifecycle,
} from "./transcript-forensics";

type SessionDetailOverviewViewModel = ReturnType<
	typeof buildSessionDetailOverviewViewModel
>;
type SubagentSummary = SessionDetailOverview["subagents"][number];
type SessionDetailWindowLoader = (
	request: SessionDetailWindowRequest,
	signal: AbortSignal,
) => Promise<SessionDetailWindow>;
export function SessionDetailFastResponsePane({
	anchorEventId,
	anchorEventRequestId,
	anchorTurnId,
	bottomPaddingClassName,
	onApproachEnd,
	onSelectTurn,
	onStaleRevision,
	options,
	responseScrollRef,
	revision,
	selection,
	sessionId,
	subagents,
	userImageUrl,
	viewModel,
	viewportStore,
}: {
	anchorEventId: string | undefined;
	anchorEventRequestId: number;
	anchorTurnId: string | undefined;
	bottomPaddingClassName: string;
	onApproachEnd: () => void;
	onSelectTurn: (target: {
		eventId: string | undefined;
		turnIndex: number;
	}) => void;
	onStaleRevision: (error: unknown) => void;
	options: readonly SessionDetailOverviewTurnOption[];
	responseScrollRef: RefObject<HTMLDivElement | null>;
	revision: string;
	selection: SessionTurnSelection;
	sessionId: string;
	subagents: readonly SubagentSummary[];
	userImageUrl: string | undefined;
	viewModel: SessionDetailOverviewViewModel;
	viewportStore: SessionContinuousTurnViewportStore;
}) {
	const queryClient = useQueryClient();
	const location = useLocation();
	const [searchParams] = useSearchParams();
	const usesConstellationV2 =
		isSessionDetailV2Path(location.pathname) ||
		searchParams.get("constellation") === "v2";
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

	useMountEffect(() => {
		responseScrollRef.current
			?.querySelector<HTMLElement>(
				`[data-continuous-turn-index="${selection.index}"]`,
			)
			?.scrollIntoView({ block: "nearest" });
	});

	return (
		<div className="flex h-full min-h-0 min-w-0 flex-col">
			<SessionDetailActivityStrip onJump={onSelectTurn} options={options} />
			<section
				ref={responseScrollRef}
				aria-label="Conversation thread"
				className={`session-constellation-tree ${usesConstellationV2 ? "session-constellation-tree-v2" : ""} session-transcript-mask h-full min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain bg-(--session-overview-surface) [overflow-anchor:none] [scrollbar-gutter:stable] ${bottomPaddingClassName}`}
				data-conversation-trace-scroll-container
				data-session-constellation-version={usesConstellationV2 ? "v2" : "v1"}
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
						anchorTurnId={anchorTurnId}
						debugEnabled={transcriptDebugEnabled}
						initialWindow={initialWindowQuery.data}
						level={detailLevel}
						loadWindow={loadWindow}
						onApproachEnd={onApproachEnd}
						onStaleRevision={onStaleRevision}
						queryClient={queryClient}
						responseScrollRef={responseScrollRef}
						selectedTurnId={anchorTurnId ?? options[selection.index]?.turnId}
						sessionId={sessionId}
						windowModeKey={skeletonDebugKey}
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
	anchorEventId,
	anchorEventRequestId,
	anchorTurnId,
	debugEnabled,
	initialWindow,
	level,
	loadWindow,
	onApproachEnd,
	onStaleRevision,
	queryClient,
	responseScrollRef,
	selectedTurnId,
	sessionId,
	windowModeKey,
	userImageUrl,
	viewModel,
	viewportStore,
}: {
	anchorEventId: string | undefined;
	anchorEventRequestId: number;
	anchorTurnId: string | undefined;
	debugEnabled: boolean;
	initialWindow: SessionDetailWindow;
	level: SessionDetailLevel;
	loadWindow: SessionDetailWindowLoader;
	onApproachEnd: () => void;
	onStaleRevision: (error: unknown) => void;
	queryClient: QueryClient;
	responseScrollRef: RefObject<HTMLDivElement | null>;
	selectedTurnId: string | undefined;
	sessionId: string;
	windowModeKey: string;
	userImageUrl: string | undefined;
	viewModel: SessionDetailOverviewViewModel;
	viewportStore: SessionContinuousTurnViewportStore;
}) {
	const listRef = useRef<SessionTranscriptListHandle>(null);
	const [sectionCache] = useState(createTranscriptSectionCache);
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
	const fetchWindow = useCallback(
		(request: SessionDetailWindowRequest) =>
			queryClient.fetchQuery({
				gcTime: SESSION_DETAIL_WINDOW_CACHE_TIME_MS,
				queryFn: ({ signal }) => loadWindow(request, signal),
				queryKey: sessionDetailWindowQueryKey(request, windowModeKey),
				retry: shouldRetrySessionDetailFastQuery,
				staleTime: SESSION_DETAIL_IMMUTABLE_STALE_TIME_MS,
			}),
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
		for (const turn of snapshot.turns) {
			if (!turn.body) {
				sectionCache.deleteTurn(turn.turnId);
			}
		}
	}, [sectionCache, snapshot.turns]);

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
			turns: snapshot.turns.flatMap((turn) => {
				const option = optionById.get(turn.turnId);
				if (!option) {
					return [];
				}
				const body = fallbackBodies.get(turn.turnId) ?? turn.body ?? undefined;
				const normalizedBody = body
					? attachSessionDetailTurnBody(option, {
							revision: snapshot.revision,
							responseItems: body.responseItems,
							turnId: turn.turnId,
							userItems: body.userItems,
						}).turn
					: undefined;
				const fallbackState = fallbackStates.get(turn.turnId);
				return [
					{
						body: normalizedBody,
						bodyState:
							fallbackState ??
							(turn.bodyOmitted === "oversized" && !normalizedBody
								? ("error" as const)
								: ("loading" as const)),
						option,
						requestUsagePlacement: "start" as const,
					},
				];
			}),
		});
	}, [
		expandedTurnIds,
		fallbackBodies,
		fallbackStates,
		level,
		sectionCache,
		selectedTurnId,
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
			try {
				return await windowStore.loadAnchor(turnId);
			} catch (error) {
				if (isSessionDetailStaleRevisionError(error)) {
					onStaleRevision(error);
				}
				return false;
			}
		},
		[onStaleRevision, windowStore],
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
		if (!anchorTurnId) {
			return;
		}
		let cancelled = false;
		void listRef.current
			?.scrollToTurn(anchorTurnId, { expandFolds: true })
			.then((found) => {
				if (!(found && anchorEventId) || cancelled) {
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
						eventElement.scrollIntoView({
							behavior: "smooth",
							block: "center",
						});
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
	}, [anchorEventId, anchorEventRequestId, anchorTurnId]);

	return (
		<>
			{debugEnabled ? (
				<output
					className="pointer-events-none fixed top-16 right-4 z-[100] max-w-[min(72rem,calc(100vw-2rem))] whitespace-pre-wrap rounded border border-(--session-overview-border) bg-(--session-overview-surface) px-2 py-1 text-[0.6875rem] text-(--session-overview-muted) shadow-sm"
					data-transcript-debug-hud
				/>
			) : null}
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
