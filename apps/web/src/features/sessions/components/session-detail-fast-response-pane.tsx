import type {
	SessionDetailOverview,
	SessionDetailTurn,
} from "@rudel/api-routes";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type RefObject, useCallback, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMountEffect } from "@/app/hooks/useMountEffect";
import { Button } from "@/app/ui/button";
import { Skeleton } from "@/app/ui/skeleton";
import { ConversationTrace } from "@/components/conversation/ConversationTrace";
import { buildConversationTrace } from "@/components/conversation/conversation-trace";
import { parseConversations } from "@/lib/conversation-schema";
import { SessionContinuousTurnThread } from "./session-continuous-turn-thread";
import {
	fetchSessionDetailSubagent,
	fetchSessionDetailTurn,
	isSessionDetailStaleRevisionError,
	SESSION_DETAIL_BODY_CACHE_TIME_MS,
	SESSION_DETAIL_IMMUTABLE_STALE_TIME_MS,
	sessionDetailSubagentQueryKey,
	sessionDetailTurnQueryKey,
	shouldRetrySessionDetailFastQuery,
} from "./session-detail-fast-query";
import {
	resolveSessionDetailLevel,
	type SessionDetailLevel,
} from "./session-detail-level";
import { SessionDetailLevelToggle } from "./session-detail-level-toggle";
import type { buildSessionDetailOverviewViewModel } from "./session-detail-overview-model";
import {
	attachSessionDetailTurnBody,
	type SessionDetailOverviewTurnOption,
} from "./session-detail-overview-model";
import type { SessionContinuousTurnVirtualizerHandle } from "./session-detail-virtualization";
import type { SessionTurnSelection } from "./session-turn-table-selection";

type SessionDetailOverviewViewModel = ReturnType<
	typeof buildSessionDetailOverviewViewModel
>;
type SubagentSummary = SessionDetailOverview["subagents"][number];

export type FullTranscriptState =
	| { status: "idle" }
	| {
			completed: number;
			phase: "pages" | "turns";
			status: "loading";
			total: number;
	  }
	| {
			bodies: ReadonlyMap<string, SessionDetailTurn>;
			failedTurnIds: readonly string[];
			status: "failed";
	  }
	| {
			bodies: ReadonlyMap<string, SessionDetailTurn>;
			status: "complete";
	  }
	| { completed: number; status: "cancelled"; total: number };

export function SessionDetailFastResponsePane({
	bottomPaddingClassName,
	fullTranscript,
	onCancelFullTranscript,
	onContinuousTurnFocus,
	onContinuousTurnViewportChange,
	onLoadFullTranscript,
	onStaleRevision,
	options,
	responseScrollRef,
	revision,
	selection,
	sessionId,
	subagents,
	userImageUrl,
	viewModel,
	virtualizerRef,
}: {
	bottomPaddingClassName: string;
	fullTranscript: FullTranscriptState;
	onCancelFullTranscript: () => void;
	onContinuousTurnFocus: (index: number) => void;
	onContinuousTurnViewportChange: (
		activeIndex: number,
		visibleRange: readonly [number, number],
	) => void;
	onLoadFullTranscript: () => void;
	onStaleRevision: (error: unknown) => void;
	options: readonly SessionDetailOverviewTurnOption[];
	responseScrollRef: RefObject<HTMLDivElement | null>;
	revision: string;
	selection: SessionTurnSelection;
	sessionId: string;
	subagents: readonly SubagentSummary[];
	userImageUrl: string | undefined;
	viewModel: SessionDetailOverviewViewModel;
	virtualizerRef: RefObject<SessionContinuousTurnVirtualizerHandle | null>;
}) {
	const queryClient = useQueryClient();
	const [searchParams, setSearchParams] = useSearchParams();
	const [turnBodies, setTurnBodies] = useState<
		ReadonlyMap<string, SessionDetailTurn>
	>(() => new Map());
	const [bodyStates, setBodyStates] = useState<
		ReadonlyMap<string, "error" | "loading">
	>(() => new Map());
	const renderedTurnIdsRef = useRef<ReadonlySet<string>>(new Set());
	const detailLevel = resolveSessionDetailLevel(searchParams.get("level"));
	const effectiveTurnBodies = useMemo(() => {
		if (
			fullTranscript.status !== "complete" &&
			fullTranscript.status !== "failed"
		) {
			return turnBodies;
		}
		return mergeSessionDetailTurnBodies(turnBodies, fullTranscript.bodies);
	}, [fullTranscript, turnBodies]);
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
			if (!option?.hasBody) {
				return;
			}
			const input = { revision, sessionId, turnId: option.turnId };
			const queryKey = sessionDetailTurnQueryKey(input);
			const cached = queryClient.getQueryData<SessionDetailTurn>(queryKey);
			if (cached) {
				setTurnBodies((current) =>
					mergeSessionDetailTurnBodies(
						current,
						new Map([[option.turnId, cached]]),
					),
				);
				return;
			}
			setBodyStates((current) =>
				updateSessionDetailBodyState(current, option.turnId, "loading"),
			);
			try {
				const body = await queryClient.fetchQuery({
					gcTime: SESSION_DETAIL_BODY_CACHE_TIME_MS,
					queryFn: ({ signal }) => fetchSessionDetailTurn(input, signal),
					queryKey,
					retry: shouldRetrySessionDetailFastQuery,
					staleTime: SESSION_DETAIL_IMMUTABLE_STALE_TIME_MS,
				});
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
				if (isSessionDetailStaleRevisionError(error)) {
					onStaleRevision(error);
					return;
				}
				if (!renderedTurnIdsRef.current.has(option.turnId)) {
					return;
				}
				setBodyStates((current) =>
					updateSessionDetailBodyState(current, option.turnId, "error"),
				);
			}
		},
		[onStaleRevision, options, queryClient, revision, sessionId],
	);

	const handleRenderedRangeChange = useCallback(
		(renderedIndices: readonly number[]) => {
			const nextTurnIds = new Set(
				renderedIndices
					.map((index) => options[index]?.turnId)
					.filter((turnId): turnId is string => Boolean(turnId)),
			);
			const previousTurnIds = renderedTurnIdsRef.current;
			renderedTurnIdsRef.current = nextTurnIds;
			if (fullTranscript.status !== "loading") {
				for (const turnId of previousTurnIds) {
					if (!nextTurnIds.has(turnId)) {
						void queryClient.cancelQueries({
							exact: true,
							queryKey: sessionDetailTurnQueryKey({
								revision,
								sessionId,
								turnId,
							}),
						});
					}
				}
			}
			for (const index of renderedIndices) {
				void loadTurnBody(index);
			}
		},
		[
			fullTranscript.status,
			loadTurnBody,
			options,
			queryClient,
			revision,
			sessionId,
		],
	);

	useMountEffect(() => {
		virtualizerRef.current?.scrollToIndex(selection.index, { align: "auto" });
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
				<FullTranscriptControl
					onCancel={onCancelFullTranscript}
					onLoad={onLoadFullTranscript}
					state={fullTranscript}
				/>
			</header>
			<section
				ref={responseScrollRef}
				aria-label="Conversation thread"
				className={`session-constellation-tree h-full min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain bg-(--session-overview-surface) ${bottomPaddingClassName}`}
				data-conversation-trace-scroll-container
				data-session-trace-presentation="constellation-tree-branch-dots-no-horizontal"
			>
				<SessionContinuousTurnThread
					bodyStates={bodyStates}
					onActiveIndexChange={onContinuousTurnFocus}
					onRenderedRangeChange={handleRenderedRangeChange}
					onRetryTurnBody={(index) => {
						void loadTurnBody(index);
					}}
					onViewportChange={onContinuousTurnViewportChange}
					options={loadedOptions}
					scrollContainerRef={responseScrollRef}
					selection={selection}
					traceCallDisplayMode={detailLevel}
					userImageUrl={userImageUrl}
					viewModel={viewModel}
					virtualizerRef={virtualizerRef}
				/>
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

function FullTranscriptControl({
	onCancel,
	onLoad,
	state,
}: {
	onCancel: () => void;
	onLoad: () => void;
	state: FullTranscriptState;
}) {
	if (state.status === "complete") {
		return (
			<output className="ml-auto text-xs text-(--session-overview-muted)">
				Full transcript loaded
			</output>
		);
	}
	if (state.status === "loading") {
		const label =
			state.phase === "pages"
				? "Loading turn index…"
				: `Loading transcript ${state.completed.toLocaleString()}/${state.total.toLocaleString()}`;
		return (
			<div className="ml-auto flex items-center gap-2">
				<output className="text-xs text-(--session-overview-muted)">
					{label}
				</output>
				<Button onClick={onCancel} size="sm" type="button" variant="ghost">
					Cancel
				</Button>
			</div>
		);
	}
	const label =
		state.status === "failed"
			? state.failedTurnIds.length > 0
				? `Retry ${state.failedTurnIds.length.toLocaleString()} failed turns`
				: "Retry full transcript"
			: state.status === "cancelled"
				? `Resume transcript (${state.completed.toLocaleString()}/${state.total.toLocaleString()})`
				: "Load full transcript";
	return (
		<Button
			className="ml-auto"
			onClick={onLoad}
			size="sm"
			type="button"
			variant="outline"
		>
			{label}
		</Button>
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
