import { getToolPresentation } from "@/components/conversation/conversation-tools";
import type {
	SessionTurnTableRow,
	SessionTurnTableSpeaker,
	SessionTurnTableToolCallGroup,
} from "./session-turn-table";
import type { SessionTurnTablePaneMatch } from "./session-turn-table-pane";
import { getSessionTurnMemberText } from "./session-turns";

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

function getMemberText(match: SessionTurnTablePaneMatch) {
	return match.option.turn
		? getSessionTurnMemberText(match.option.turn)
		: match.option.memberPreview;
}

function buildMemberRow(
	match: SessionTurnTablePaneMatch,
	signalCount: number,
): SessionTurnTableRow {
	return {
		key: `${match.option.key}:member`,
		match,
		memberText: getMemberText(match),
		signalCount,
		speaker: "member",
		subagentCount: 0,
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

function buildModelRow(
	match: SessionTurnTablePaneMatch,
	signalCount: number,
): SessionTurnTableRow {
	const subagentCount = (match.option.subagentEvents ?? []).reduce(
		(total, event) => total + event.count,
		0,
	);
	return {
		key: `${match.option.key}:model`,
		match,
		memberText: undefined,
		signalCount,
		speaker: "model",
		subagentCount,
		toolCallGroups: getToolCallGroups(match),
	};
}

export function buildSessionTurnTableViewRows(
	matches: readonly SessionTurnTablePaneMatch[],
	visibleSpeakers: ReadonlySet<SessionTurnTableSpeaker>,
	_primarySpeaker: SessionTurnTableSpeaker,
): SessionTurnTableRow[] {
	return matches.flatMap((match) => {
		// Counts come from the server (full-text authority); the client scans text
		// only to place highlights in prose it is actually rendering, never to
		// produce numbers.
		const memberSignalCount = match.option.signalCount ?? 0;
		const modelSignalCount = match.option.modelSignalCount ?? 0;
		const rows: SessionTurnTableRow[] = [];
		if (visibleSpeakers.has("member") && hasMemberMessage(match)) {
			rows.push(buildMemberRow(match, memberSignalCount));
		}
		if (visibleSpeakers.has("model")) {
			rows.push(buildModelRow(match, modelSignalCount));
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
