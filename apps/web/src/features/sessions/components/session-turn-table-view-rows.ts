import { scanLanguageSignals } from "@rudel/language-signals";
import { getToolPresentation } from "@/components/conversation/conversation-tools";
import type {
	SessionTurnTableRow,
	SessionTurnTableSpeaker,
	SessionTurnTableToolCallGroup,
} from "./session-turn-table";
import type { SessionTurnTablePaneMatch } from "./session-turn-table-pane";
import {
	getSessionTurnMemberCharacterCount,
	getSessionTurnMemberText,
} from "./session-turns";

function getMemberCharacterCount(match: SessionTurnTablePaneMatch) {
	const turn = match.option.turn;
	if (!turn) {
		if (match.option.memberCharacterCount !== undefined) {
			return match.option.memberCharacterCount;
		}
		return match.option.turnNumber === undefined
			? undefined
			: match.option.memberPreview.length;
	}

	return getSessionTurnMemberCharacterCount(turn);
}

function hasMemberMessage(match: SessionTurnTablePaneMatch) {
	const turn = match.option.turn;
	if (turn) {
		return turn.userItems.some((item) => item.kind === "user");
	}

	return (
		match.option.turnNumber !== undefined &&
		match.option.memberPreview !== "No member message"
	);
}

function getMemberSentimentWords(match: SessionTurnTablePaneMatch) {
	const memberText = match.option.turn
		? getSessionTurnMemberText(match.option.turn)
		: match.option.memberPreview;
	return scanLanguageSignals(memberText).map((signal) => signal.matchedText);
}

function buildMemberRow(match: SessionTurnTablePaneMatch): SessionTurnTableRow {
	return {
		characterCount: getMemberCharacterCount(match),
		key: `${match.option.key}:member`,
		match,
		sentimentWords: getMemberSentimentWords(match),
		speaker: "member",
		toolCallGroups: [],
	};
}

function getToolCallGroups(match: SessionTurnTablePaneMatch) {
	const toolCalls: readonly {
		icon: SessionTurnTableToolCallGroup["icon"];
		name: string;
		tone: SessionTurnTableToolCallGroup["tone"];
	}[] =
		match.option.turn?.responseItems.flatMap((item) =>
			item.kind === "agent"
				? item.events.flatMap((event) =>
						event.kind === "tool"
							? [
									{
										icon: getToolPresentation(event.toolName).icon,
										name: event.toolName,
										tone: event.result?.isError ? "tomato" : "amber",
									},
								]
							: [],
					)
				: [],
		) ?? [];

	const groupsByIcon = new Map<
		SessionTurnTableToolCallGroup["icon"],
		SessionTurnTableToolCallGroup
	>();
	for (const toolCall of toolCalls) {
		const group = groupsByIcon.get(toolCall.icon);
		groupsByIcon.set(
			toolCall.icon,
			group
				? {
						...group,
						count: group.count + 1,
						names: [...group.names, toolCall.name],
						tone:
							group.tone === "tomato" || toolCall.tone === "tomato"
								? "tomato"
								: "amber",
					}
				: {
						count: 1,
						icon: toolCall.icon,
						names: [toolCall.name],
						tone: toolCall.tone,
					},
		);
	}

	return Array.from(groupsByIcon.values());
}

function buildModelRow(match: SessionTurnTablePaneMatch): SessionTurnTableRow {
	return {
		characterCount: undefined,
		key: `${match.option.key}:model`,
		match,
		sentimentWords: [],
		speaker: "model",
		toolCallGroups: getToolCallGroups(match),
	};
}

export function buildSessionTurnTableViewRows(
	matches: readonly SessionTurnTablePaneMatch[],
	visibleSpeakers: ReadonlySet<SessionTurnTableSpeaker>,
	_primarySpeaker: SessionTurnTableSpeaker,
): SessionTurnTableRow[] {
	return matches.flatMap((match) => {
		const rows: SessionTurnTableRow[] = [];
		if (visibleSpeakers.has("member") && hasMemberMessage(match)) {
			rows.push(buildMemberRow(match));
		}
		if (visibleSpeakers.has("model")) {
			rows.push(buildModelRow(match));
		}

		return rows.sort((left, right) => {
			const leftTimestamp = getSpeakerTimestamp(match, left.speaker);
			const rightTimestamp = getSpeakerTimestamp(match, right.speaker);
			if (leftTimestamp !== undefined && rightTimestamp !== undefined) {
				return leftTimestamp - rightTimestamp;
			}
			return left.speaker === "member" ? -1 : 1;
		});
	});
}

function getSpeakerTimestamp(
	match: SessionTurnTablePaneMatch,
	speaker: SessionTurnTableSpeaker,
) {
	const turn = match.option.turn;
	if (!turn) {
		return undefined;
	}

	const timestamps =
		speaker === "member"
			? turn.userItems.map((item) => item.timestamp)
			: turn.responseItems.map((item) => item.timestamp);
	const milliseconds = timestamps
		.filter((timestamp): timestamp is string => typeof timestamp === "string")
		.map((timestamp) => Date.parse(timestamp))
		.filter((timestamp) => !Number.isNaN(timestamp));
	if (milliseconds.length === 0) {
		return undefined;
	}

	return Math.min(...milliseconds);
}
