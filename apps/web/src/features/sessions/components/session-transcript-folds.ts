import type { TraceEvent } from "@/components/conversation/conversation-trace";

export type TranscriptSectionFoldMetadata = {
	events: number;
	groupId: string;
	hasError: boolean;
	hasSubagentSpawn: boolean;
	hasTerminalMessage: boolean;
	toolCalls: number;
};

export type TranscriptFoldSummary = {
	events: number;
	toolCalls: number;
};

export function deriveTranscriptSectionFoldMetadata(
	events: readonly TraceEvent[],
	groupId: string,
	terminalMessageId: string | undefined,
): TranscriptSectionFoldMetadata {
	return {
		events: events.length,
		groupId,
		hasError: events.some(
			(event) =>
				(event.kind === "tool" && event.result?.isError === true) ||
				(event.kind === "orphan-result" && event.result.isError),
		),
		hasSubagentSpawn: events.some(
			(event) =>
				event.kind === "tool" &&
				(event.toolName === "Agent" || event.toolName === "Task"),
		),
		hasTerminalMessage: events.some(
			(event) => event.kind === "message" && event.id === terminalMessageId,
		),
		toolCalls: events.filter((event) => event.kind === "tool").length,
	};
}

export function deriveTranscriptFoldPlan(
	sections: readonly {
		fold: TranscriptSectionFoldMetadata;
		id: string;
	}[],
	protectedTurn: boolean,
) {
	if (protectedTurn) {
		return undefined;
	}
	const groups = [
		...new Map(sections.map((section) => [section.fold.groupId, section.fold])),
	].map(([groupId, fold]) => ({ fold, groupId }));
	const lastToolGroupId = groups
		.filter((group) => group.fold.toolCalls > 0)
		.at(-1)?.groupId;
	const hiddenGroups = groups.filter(
		(group) =>
			group.fold.toolCalls > 0 &&
			group.groupId !== lastToolGroupId &&
			!group.fold.hasError &&
			!group.fold.hasSubagentSpawn &&
			!group.fold.hasTerminalMessage,
	);
	if (hiddenGroups.length === 0) {
		return undefined;
	}
	const hiddenGroupIds = new Set(hiddenGroups.map((group) => group.groupId));
	return {
		hiddenSectionIds: new Set(
			sections
				.filter((section) => hiddenGroupIds.has(section.fold.groupId))
				.map((section) => section.id),
		),
		summary: hiddenGroups.reduce<TranscriptFoldSummary>(
			(summary, group) => ({
				events: summary.events + group.fold.events,
				toolCalls: summary.toolCalls + group.fold.toolCalls,
			}),
			{ events: 0, toolCalls: 0 },
		),
	};
}
