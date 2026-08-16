import type {
	SessionDetailOverview,
	SessionDetailTurn,
} from "@rudel/api-routes";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type RefObject, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/app/ui/button";
import { Skeleton } from "@/app/ui/skeleton";
import {
	ConversationTrace,
	ConversationTraceTreeConnectorStyleProvider,
} from "@/components/conversation/ConversationTrace";
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
import { SessionMemberRow } from "./session-member-row";
import { SessionTurnResponseTrace } from "./session-turn-response-trace";
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
}: {
	bottomPaddingClassName: string;
	fullTranscript: FullTranscriptState;
	onCancelFullTranscript: () => void;
	onContinuousTurnFocus: (index: number) => void;
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
}) {
	const [searchParams, setSearchParams] = useSearchParams();
	const detailLevel = resolveSessionDetailLevel(searchParams.get("level"));
	const selectedOption = options[selection.index];
	const fullOptions = useMemo(
		() =>
			fullTranscript.status === "complete"
				? options.map((option) => {
						const body = fullTranscript.bodies.get(option.turnId);
						return body
							? attachSessionDetailTurnBody(option, body)
							: {
									...option,
									turn: { responseItems: [], userItems: [] },
								};
					})
				: undefined,
		[fullTranscript, options],
	);

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
				{fullOptions ? (
					<SessionContinuousTurnThread
						onActiveIndexChange={onContinuousTurnFocus}
						onViewportChange={() => undefined}
						options={fullOptions}
						scrollContainerRef={responseScrollRef}
						selection={selection}
						traceCallDisplayMode={detailLevel}
						userImageUrl={userImageUrl}
						viewModel={viewModel}
					/>
				) : (
					<SelectedSessionTurn
						detailLevel={detailLevel}
						onStaleRevision={onStaleRevision}
						option={selectedOption}
						revision={revision}
						selection={selection}
						sessionId={sessionId}
						subagents={subagents}
						userImageUrl={userImageUrl}
						viewModel={viewModel}
					/>
				)}
			</section>
		</div>
	);
}

function SelectedSessionTurn({
	detailLevel,
	onStaleRevision,
	option,
	revision,
	selection,
	sessionId,
	subagents,
	userImageUrl,
	viewModel,
}: {
	detailLevel: SessionDetailLevel;
	onStaleRevision: (error: unknown) => void;
	option: SessionDetailOverviewTurnOption | undefined;
	revision: string;
	selection: SessionTurnSelection;
	sessionId: string;
	subagents: readonly SubagentSummary[];
	userImageUrl: string | undefined;
	viewModel: SessionDetailOverviewViewModel;
}) {
	const turnId = option?.turnId ?? "";
	const turnInput = { revision, sessionId, turnId };
	const turnQuery = useQuery({
		enabled: Boolean(option?.hasBody && turnId),
		gcTime: SESSION_DETAIL_BODY_CACHE_TIME_MS,
		queryFn: async ({ signal }) => {
			try {
				return await fetchSessionDetailTurn(turnInput, signal);
			} catch (error) {
				if (isSessionDetailStaleRevisionError(error)) {
					onStaleRevision(error);
				}
				throw error;
			}
		},
		queryKey: sessionDetailTurnQueryKey(turnInput),
		retry: shouldRetrySessionDetailFastQuery,
		staleTime: SESSION_DETAIL_IMMUTABLE_STALE_TIME_MS,
	});

	if (!option) {
		return <PaneMessage message="No conversation data available" />;
	}
	if (!option.hasBody) {
		return <PaneMessage message="No response recorded" />;
	}
	if (turnQuery.isPending) {
		return <TurnBodySkeleton />;
	}
	if (turnQuery.error) {
		return (
			<PaneMessage
				actionLabel="Retry turn"
				message="This turn could not be loaded. The session overview is still available."
				onAction={() => {
					void turnQuery.refetch();
				}}
			/>
		);
	}
	if (!turnQuery.data) {
		return <PaneMessage message="No response recorded" />;
	}

	const loadedOption = attachSessionDetailTurnBody(option, turnQuery.data);
	const startsTrace = optionsStartWithMember(option);
	return (
		<ConversationTraceTreeConnectorStyleProvider style="interfere-branch-dots-no-horizontal">
			<div className="min-w-0">
				{loadedOption.turn.userItems.length > 0 ? (
					<SessionMemberRow
						active={selection.speaker === "member"}
						headingId={`selected-member-message-${option.turnId}`}
						items={loadedOption.turn.userItems}
						speakerLayout="trace-tree"
						startsTrace={startsTrace}
						userImageUrl={userImageUrl}
						userLabel={viewModel.safeUserDisplayName}
					/>
				) : null}
				<section
					aria-label={option.turnNumber === undefined ? "Preamble" : "Response"}
					data-session-turn-speaker="model"
				>
					<SessionTurnResponseTrace
						agentSectionMode="expanded"
						option={loadedOption}
						speakerLayout="trace-tree"
						traceCallDisplayMode={detailLevel}
						userImageUrl={userImageUrl}
						viewModel={viewModel}
					/>
				</section>
				<SessionDetailSubagents
					onStaleRevision={onStaleRevision}
					revision={revision}
					sessionId={sessionId}
					subagents={subagents}
				/>
			</div>
		</ConversationTraceTreeConnectorStyleProvider>
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

function optionsStartWithMember(option: SessionDetailOverviewTurnOption) {
	return option.turnNumber === 1;
}
