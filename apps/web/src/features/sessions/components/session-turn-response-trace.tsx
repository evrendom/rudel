import type { ReactNode } from "react";
import {
	ConversationTrace,
	type ConversationTraceSpeakerLayout,
	type TraceCallDisplayMode,
} from "@/components/conversation/ConversationTrace";
import { formatModelDisplayLabel } from "@/features/dashboard/components/dashboard-model-brand";
import { isCodexFormat } from "@/lib/conversation-schema";
import type { buildSessionDetailViewModel } from "./session-detail-view-model";
import type { SessionTurnOption } from "./session-turn-option";

type SessionDetailViewModel = ReturnType<typeof buildSessionDetailViewModel>;

export function SessionTurnResponseTrace({
	agentHeaderTrailing,
	agentSectionMode,
	continuesAfter = false,
	option,
	speakerLayout,
	traceCallDisplayMode = "request",
	userImageUrl,
	viewModel,
}: {
	agentHeaderTrailing?: ReactNode;
	agentSectionMode: "collapsible" | "expanded";
	continuesAfter?: boolean;
	option: SessionTurnOption;
	speakerLayout: ConversationTraceSpeakerLayout;
	traceCallDisplayMode?: TraceCallDisplayMode;
	userImageUrl: string | undefined;
	viewModel: SessionDetailViewModel;
}) {
	if (option.turn.responseItems.length === 0) {
		return (
			<p className="py-10 text-center text-sm text-(--session-overview-muted)">
				No response recorded
			</p>
		);
	}

	return (
		<ConversationTrace
			key={option.key}
			agentLabel={
				viewModel.safeModelUsed
					? formatModelDisplayLabel(viewModel.safeModelUsed)
					: undefined
			}
			agentHeaderTrailing={agentHeaderTrailing}
			agentModel={viewModel.safeModelUsed}
			agentSectionMode={agentSectionMode}
			continuesAfter={continuesAfter}
			defaultTraceTreeOpen
			expandedSpeakerLayout={speakerLayout}
			items={option.turn.responseItems}
			requestUsage={option.metrics.usageEvents}
			requestUsagePlacement={
				viewModel.safeSource === "codex" || isCodexFormat(viewModel.safeContent)
					? "end"
					: "start"
			}
			traceCallDisplayMode={traceCallDisplayMode}
			userImageUrl={userImageUrl}
			userLabel={viewModel.safeUserDisplayName}
		/>
	);
}
