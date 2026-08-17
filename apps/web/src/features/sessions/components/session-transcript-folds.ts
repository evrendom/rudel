import type { TraceEvent } from "@/components/conversation/conversation-trace";

export type TranscriptSectionFoldMetadata = {
	events: number;
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
	terminalMessageId: string | undefined,
): TranscriptSectionFoldMetadata {
	return {
		events: events.length,
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
	const lastToolSectionId = sections
		.filter((section) => section.fold.toolCalls > 0)
		.at(-1)?.id;
	const hiddenSections = sections.filter(
		(section) =>
			section.fold.toolCalls > 0 &&
			section.id !== lastToolSectionId &&
			!section.fold.hasError &&
			!section.fold.hasSubagentSpawn &&
			!section.fold.hasTerminalMessage,
	);
	if (hiddenSections.length === 0) {
		return undefined;
	}
	return {
		hiddenSectionIds: new Set(hiddenSections.map((section) => section.id)),
		summary: hiddenSections.reduce<TranscriptFoldSummary>(
			(summary, section) => ({
				events: summary.events + section.fold.events,
				toolCalls: summary.toolCalls + section.fold.toolCalls,
			}),
			{ events: 0, toolCalls: 0 },
		),
	};
}
