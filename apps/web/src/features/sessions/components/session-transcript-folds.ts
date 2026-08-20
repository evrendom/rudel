import type { TraceEvent } from "@/components/conversation/conversation-trace";
import { measureTranscriptSuspect } from "./transcript-forensics";

export type TranscriptSectionFoldMetadata = {
	events: number;
	filesEdited: number;
	filesRead: number;
	filesWritten: number;
	groupId: string;
	hasError: boolean;
	hasSubagentSpawn: boolean;
	isTerminalBoundary: boolean;
	messages: number;
	reasoning: number;
	skills: number;
	subagents: number;
	toolCalls: number;
};

export type TranscriptFoldSummary = {
	events: number;
	filesEdited: number;
	filesRead: number;
	filesWritten: number;
	messages: number;
	reasoning: number;
	skills: number;
	subagents: number;
};

function normalizeToolName(toolName: string) {
	return (
		toolName.split(/\.|__/u).at(-1)?.toLowerCase() ?? toolName.toLowerCase()
	);
}

export function deriveTranscriptSectionFoldMetadata(
	events: readonly TraceEvent[],
	groupId: string,
	isTerminalBoundary: boolean,
): TranscriptSectionFoldMetadata {
	return measureTranscriptSuspect(
		"fold-metadata",
		{ events: events.length, groupId },
		() =>
			deriveTranscriptSectionFoldMetadataUnmeasured(
				events,
				groupId,
				isTerminalBoundary,
			),
	);
}

function deriveTranscriptSectionFoldMetadataUnmeasured(
	events: readonly TraceEvent[],
	groupId: string,
	isTerminalBoundary: boolean,
): TranscriptSectionFoldMetadata {
	const toolEvents = events.filter((event) => event.kind === "tool");
	const normalizedToolNames = toolEvents.map((event) =>
		normalizeToolName(event.toolName),
	);
	return {
		events: events.length,
		filesEdited: normalizedToolNames.filter(
			(toolName) =>
				toolName === "edit" ||
				toolName === "notebookedit" ||
				toolName === "apply_patch",
		).length,
		filesRead: normalizedToolNames.filter(
			(toolName) => toolName === "read" || toolName === "read_file",
		).length,
		filesWritten: normalizedToolNames.filter(
			(toolName) => toolName === "write" || toolName === "write_file",
		).length,
		groupId,
		hasError: events.some(
			(event) =>
				(event.kind === "tool" && event.result?.isError === true) ||
				(event.kind === "orphan-result" && event.result.isError),
		),
		hasSubagentSpawn: events.some(
			(event) =>
				event.kind === "tool" &&
				["agent", "spawn_agent", "task"].includes(
					normalizeToolName(event.toolName),
				),
		),
		isTerminalBoundary,
		messages: events.filter((event) => event.kind === "message").length,
		reasoning: events.filter((event) => event.kind === "reasoning").length,
		skills: normalizedToolNames.filter((toolName) => toolName === "skill")
			.length,
		subagents: normalizedToolNames.filter((toolName) =>
			["agent", "spawn_agent", "task"].includes(toolName),
		).length,
		toolCalls: toolEvents.length,
	};
}

export function deriveTranscriptFoldPlan(
	sections: readonly {
		fold: TranscriptSectionFoldMetadata;
		id: string;
	}[],
	protectedTurn: boolean,
) {
	return measureTranscriptSuspect(
		"fold-derivation",
		{ protectedTurn, sections: sections.length },
		() => deriveTranscriptFoldPlanUnmeasured(sections, protectedTurn),
	);
}

function deriveTranscriptFoldPlanUnmeasured(
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
	const terminalGroupIndex = groups.findIndex(
		(group) => group.fold.isTerminalBoundary,
	);
	if (terminalGroupIndex <= 0) {
		return undefined;
	}
	const hiddenGroups = groups.slice(0, terminalGroupIndex);
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
				filesEdited: summary.filesEdited + group.fold.filesEdited,
				filesRead: summary.filesRead + group.fold.filesRead,
				filesWritten: summary.filesWritten + group.fold.filesWritten,
				messages: summary.messages + group.fold.messages,
				reasoning: summary.reasoning + group.fold.reasoning,
				skills: summary.skills + group.fold.skills,
				subagents: summary.subagents + group.fold.subagents,
			}),
			{
				events: 0,
				filesEdited: 0,
				filesRead: 0,
				filesWritten: 0,
				messages: 0,
				reasoning: 0,
				skills: 0,
				subagents: 0,
			},
		),
	};
}
