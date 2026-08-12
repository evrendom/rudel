import {
	compactPreview,
	type TraceEvent,
	type TraceItem,
	toolResultText,
	userContentText,
} from "@/components/conversation/conversation-trace";
import type { SessionAdalineMessageRow } from "./session-adaline-message-rows";
import type { SessionTurnTablePaneOption } from "./session-turn-table-pane";
import type { SessionTurn } from "./session-turns";

export interface SessionAdalineOption extends SessionTurnTablePaneOption {
	turn: SessionTurn;
}

export type SessionAdalineSpanStatus = "error" | "pending" | "success";

export type SessionAdalineSpan = {
	depth: number;
	durationMs: number | undefined;
	id: string;
	kind: "member" | "message" | "reasoning" | "result" | "system" | "tool";
	label: string;
	preview: string;
	raw: unknown;
	status: SessionAdalineSpanStatus;
	timestamp: string | undefined;
};

type SessionAdalineSpanDraft = Omit<SessionAdalineSpan, "durationMs">;

function parseTimestamp(value: string | undefined) {
	if (!value) {
		return undefined;
	}

	const timestamp = Date.parse(value);
	return Number.isNaN(timestamp) ? undefined : timestamp;
}

function getTraceEventDraft(
	event: TraceEvent,
	depth: number,
): SessionAdalineSpanDraft {
	switch (event.kind) {
		case "reasoning":
			return {
				depth,
				id: event.id,
				kind: "reasoning",
				label: "Reasoning",
				preview: compactPreview(event.text, 120) || "Reasoning block",
				raw: event,
				status: "success",
				timestamp: event.timestamp,
			};
		case "message":
			return {
				depth,
				id: event.id,
				kind: "message",
				label: "Assistant message",
				preview: compactPreview(event.text, 120) || "Empty assistant message",
				raw: event,
				status: "success",
				timestamp: event.timestamp,
			};
		case "tool": {
			const status = event.result
				? event.result.isError
					? "error"
					: "success"
				: "pending";
			const resultPreview = event.result
				? compactPreview(toolResultText(event.result.content), 120)
				: "Awaiting result";
			return {
				depth,
				id: event.id,
				kind: "tool",
				label: event.toolName,
				preview: resultPreview || "Tool completed",
				raw: event,
				status,
				timestamp: event.timestamp,
			};
		}
		case "orphan-result":
			return {
				depth,
				id: event.id,
				kind: "result",
				label: "Tool result",
				preview:
					compactPreview(toolResultText(event.result.content), 120) ||
					"Empty tool result",
				raw: event,
				status: event.result.isError ? "error" : "success",
				timestamp: event.timestamp,
			};
	}
}

function getTraceItemDrafts(item: TraceItem): SessionAdalineSpanDraft[] {
	switch (item.kind) {
		case "user":
			return [
				{
					depth: 0,
					id: item.id,
					kind: "member",
					label: "Member message",
					preview:
						compactPreview(userContentText(item.content), 120) ||
						"Empty member message",
					raw: item,
					status: "success",
					timestamp: item.timestamp,
				},
			];
		case "agent":
			return item.events.map((event) => getTraceEventDraft(event, 1));
		case "system":
			return [
				{
					depth: 0,
					id: item.id,
					kind: "system",
					label:
						item.systemType === "interruption"
							? "Run interrupted"
							: item.systemType === "notification"
								? "Task notification"
								: item.systemType === "context"
									? "Injected context"
									: "System message",
					preview: compactPreview(item.text, 120) || "Empty system message",
					raw: item,
					status: "success",
					timestamp: item.timestamp,
				},
			];
		case "summary":
			return [
				{
					depth: 0,
					id: item.id,
					kind: "system",
					label: "Compaction summary",
					preview: compactPreview(item.text, 120) || "Empty summary",
					raw: item,
					status: "success",
					timestamp: undefined,
				},
			];
	}
}

export function buildSessionAdalineSpans(
	option: SessionAdalineOption,
): SessionAdalineSpan[] {
	const drafts = [
		...option.turn.userItems,
		...option.turn.responseItems,
	].flatMap(getTraceItemDrafts);
	const turnEnd = parseTimestamp(option.timing.endTimestamp);

	return drafts.map((draft, index) => {
		const start = parseTimestamp(draft.timestamp);
		const nextStart = parseTimestamp(drafts[index + 1]?.timestamp) ?? turnEnd;
		const durationMs =
			start !== undefined && nextStart !== undefined && nextStart >= start
				? nextStart - start
				: undefined;

		return { ...draft, durationMs };
	});
}

export function getSessionAdalineMessageSpans(
	option: SessionAdalineOption,
	row: SessionAdalineMessageRow,
): SessionAdalineSpan[] {
	const spanIds = new Set(row.spanIds);
	const spans = buildSessionAdalineSpans(option).filter((span) =>
		spanIds.has(span.id),
	);

	if (row.speaker !== "member") {
		return spans;
	}

	const memberSpans = spans;
	const firstMemberSpan = memberSpans[0];
	if (!firstMemberSpan || memberSpans.length === 1) {
		return memberSpans;
	}

	return [
		{
			...firstMemberSpan,
			id: `${option.key}:member`,
			preview: option.memberPreview,
			raw: option.turn.userItems,
		},
	];
}

export function getSessionAdalineTurnStatus(
	option: SessionAdalineOption,
): SessionAdalineSpanStatus {
	if (option.metrics.errorCount > 0) {
		return "error";
	}

	return buildSessionAdalineSpans(option).some(
		(span) => span.status === "pending",
	)
		? "pending"
		: "success";
}

export function getSessionAdalineAggregateCounts(
	options: readonly SessionAdalineOption[],
) {
	const editedFiles = new Set<string>();
	const skills = new Set<string>();
	let errorCount = 0;
	let toolCallCount = 0;

	for (const option of options) {
		errorCount += option.metrics.errorCount;
		toolCallCount += option.toolCallCount;
		for (const file of option.metrics.editedFiles) {
			editedFiles.add(file);
		}
		for (const skill of option.metrics.skills) {
			skills.add(skill);
		}
	}

	return {
		editedFileCount: editedFiles.size,
		errorCount,
		skillCount: skills.size,
		toolCallCount,
		turnCount: options.filter((option) => option.turnNumber !== undefined)
			.length,
	};
}

export function buildSessionAdalineRawRecord(
	option: SessionAdalineOption,
	span: SessionAdalineSpan | undefined,
) {
	return span
		? {
				span: span.raw,
				turn: {
					key: option.key,
					timing: option.timing,
					turnNumber: option.turnNumber,
				},
			}
		: {
				key: option.key,
				memberPreview: option.memberPreview,
				metrics: option.metrics,
				preview: option.preview,
				slashCommands: option.slashCommands,
				timing: option.timing,
				toolCallCount: option.toolCallCount,
				turn: option.turn,
				turnNumber: option.turnNumber,
			};
}

export function formatSessionAdalineDuration(milliseconds: number | undefined) {
	if (milliseconds === undefined) {
		return "—";
	}

	if (milliseconds < 1_000) {
		return `${Math.round(milliseconds)}ms`;
	}

	if (milliseconds < 60_000) {
		return `${(milliseconds / 1_000).toFixed(milliseconds < 10_000 ? 1 : 0)}s`;
	}

	const minutes = Math.floor(milliseconds / 60_000);
	const seconds = Math.round((milliseconds % 60_000) / 1_000);
	return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`;
}
