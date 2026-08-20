import type { SessionDetailOverview } from "@rudel/api-routes";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Button } from "@/app/ui/button";
import {
	ConversationTrace,
	TraceExpansionNamespaceProvider,
} from "@/components/conversation/ConversationTrace";
import {
	buildConversationTrace,
	type TraceEvent,
} from "@/components/conversation/conversation-trace";
import { ConversationTraceDelegationPayloadRow } from "@/components/conversation/conversation-trace-delegation-payload-row";
import { formatModelDisplayLabel } from "@/features/dashboard/components/dashboard-model-brand";
import { parseConversations } from "@/lib/conversation-schema";
import {
	fetchSessionDetailSubagent,
	isSessionDetailStaleRevisionError,
	SESSION_DETAIL_BODY_CACHE_TIME_MS,
	SESSION_DETAIL_IMMUTABLE_STALE_TIME_MS,
	sessionDetailSubagentQueryKey,
	shouldRetrySessionDetailFastQuery,
} from "./session-detail-fast-query";

export type SessionDetailSubagentSummary =
	SessionDetailOverview["subagents"][number];

export function SessionDetailSubagentBranch({
	delegationEvent,
	onStaleRevision,
	revision,
	sessionId,
	subagent,
}: {
	delegationEvent: Extract<TraceEvent, { kind: "tool" }>;
	onStaleRevision: (error: unknown) => void;
	revision: string;
	sessionId: string;
	subagent: SessionDetailSubagentSummary;
}) {
	const input = { revision, sessionId, subagentId: subagent.subagentId };
	const query = useQuery({
		enabled: subagent.hasTranscript,
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
		queryKey: sessionDetailSubagentQueryKey(input),
		retry: shouldRetrySessionDetailFastQuery,
		staleTime: SESSION_DETAIL_IMMUTABLE_STALE_TIME_MS,
	});
	const items = useMemo(() => {
		if (!query.data) {
			return [];
		}
		const trace = buildConversationTrace(
			parseConversations(query.data.content),
		);
		return trace[0]?.kind === "user" ? trace.slice(1) : trace;
	}, [query.data]);
	const modelLabel = subagent.model
		? formatModelDisplayLabel(subagent.model)
		: "Subagent";

	return (
		<div
			className="min-w-0 pl-9"
			data-session-subagent-branch={subagent.subagentId}
		>
			<TraceExpansionNamespaceProvider namespace={subagent.subagentId}>
				<ConversationTrace
					agentIntroRow={
						<ConversationTraceDelegationPayloadRow event={delegationEvent} />
					}
					agentHeaderTrailing={
						<SubagentBranchStatus
							hasTranscript={subagent.hasTranscript}
							isError={query.error !== null}
							isPending={query.isPending}
							onRetry={() => {
								void query.refetch();
							}}
						/>
					}
					agentLabel={modelLabel}
					agentModel={subagent.model ?? undefined}
					expandedSpeakerLayout="trace-tree"
					items={items}
				/>
			</TraceExpansionNamespaceProvider>
		</div>
	);
}

function SubagentBranchStatus({
	hasTranscript,
	isError,
	isPending,
	onRetry,
}: {
	hasTranscript: boolean;
	isError: boolean;
	isPending: boolean;
	onRetry: () => void;
}) {
	if (!hasTranscript) {
		return (
			<p className="text-xs text-(--session-overview-subtle)">No transcript</p>
		);
	}
	if (isError) {
		return (
			<Button onClick={onRetry} size="sm" type="button" variant="ghost">
				Retry
			</Button>
		);
	}
	if (isPending) {
		return (
			<output className="text-xs text-(--session-overview-subtle)">
				Loading…
			</output>
		);
	}
	return null;
}
