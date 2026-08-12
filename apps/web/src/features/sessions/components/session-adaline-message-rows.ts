import {
	compactPreview,
	formatClockTime,
	type TraceItem,
} from "@/components/conversation/conversation-trace";
import type { SessionTurnTablePaneMatch } from "./session-turn-table-pane";

export type SessionAdalineMessageRow = {
	key: string;
	match: SessionTurnTablePaneMatch;
	ownsTurnMetrics: boolean;
	preview: string;
	spanIds: readonly string[];
	speaker: "member" | "model";
	time: string;
};

export type SessionAdalineMessageSpeaker = SessionAdalineMessageRow["speaker"];

function getAgentPreview(item: Extract<TraceItem, { kind: "agent" }>) {
	for (let index = item.events.length - 1; index >= 0; index--) {
		const event = item.events[index];
		if (event?.kind === "message") {
			return compactPreview(event.text, 240) || "Empty assistant message";
		}
	}

	for (let index = item.events.length - 1; index >= 0; index--) {
		const event = item.events[index];
		if (event?.kind === "reasoning") {
			return compactPreview(event.text, 240) || "Reasoning";
		}
	}

	const toolNames = item.events.flatMap((event) =>
		event.kind === "tool" ? [event.toolName] : [],
	);
	if (toolNames.length > 0) {
		return toolNames.length === 1
			? `Tool call · ${toolNames[0]}`
			: `${toolNames.length.toLocaleString()} tool calls · ${toolNames.join(", ")}`;
	}

	return "Model activity";
}

function getModelPreview(
	responseItems: readonly TraceItem[],
	fallback: string,
) {
	for (let index = responseItems.length - 1; index >= 0; index--) {
		const item = responseItems[index];
		if (item?.kind === "agent") {
			return getAgentPreview(item);
		}
	}

	return fallback;
}

function getResponseSpanIds(responseItems: readonly TraceItem[]) {
	return responseItems.flatMap((item) => {
		if (item.kind === "agent") {
			return item.events.map((event) => event.id);
		}

		return [item.id];
	});
}

function getResponseStartTime(
	responseItems: readonly TraceItem[],
	fallback: string,
) {
	for (const item of responseItems) {
		if (item.timestamp) {
			return formatClockTime(item.timestamp);
		}
	}

	return fallback;
}

function buildRowsForMatch(
	match: SessionTurnTablePaneMatch,
): SessionAdalineMessageRow[] {
	const turn = match.option.turn;
	if (!turn) {
		return [
			{
				key: `${match.option.key}:model`,
				match,
				ownsTurnMetrics: true,
				preview: match.option.preview,
				spanIds: [],
				speaker: "model",
				time: match.option.timing.endTime || match.option.timing.startTime,
			},
		];
	}

	const rows: SessionAdalineMessageRow[] = [];
	if (turn.userItems.length > 0) {
		rows.push({
			key: `${match.option.key}:member`,
			match,
			ownsTurnMetrics: false,
			preview: match.option.memberPreview,
			spanIds: turn.userItems.map((item) => item.id),
			speaker: "member",
			time:
				formatClockTime(turn.userItems[0]?.timestamp) ||
				match.option.timing.startTime,
		});
	}

	if (turn.responseItems.length > 0) {
		rows.push({
			key: `${match.option.key}:model`,
			match,
			ownsTurnMetrics: true,
			preview: getModelPreview(turn.responseItems, match.option.preview),
			spanIds: getResponseSpanIds(turn.responseItems),
			speaker: "model",
			time: getResponseStartTime(
				turn.responseItems,
				match.option.timing.endTime || match.option.timing.startTime,
			),
		});
	}

	return rows;
}

export function buildSessionAdalineMessageRows(
	matches: readonly SessionTurnTablePaneMatch[],
): SessionAdalineMessageRow[] {
	return matches.flatMap(buildRowsForMatch);
}
