import { getToolPresentation } from "@/components/conversation/conversation-tools";
import { userContentText } from "@/components/conversation/conversation-trace";
import type {
	SessionTurnTableRow,
	SessionTurnTableSpeaker,
	SessionTurnTableToolCallGroup,
} from "./session-turn-table";
import type { SessionTurnTablePaneMatch } from "./session-turn-table-pane";

function getMemberCharacterCount(match: SessionTurnTablePaneMatch) {
	const turn = match.option.turn;
	if (!turn) {
		return match.option.turnNumber === undefined
			? undefined
			: match.option.memberPreview.length;
	}

	return turn.userItems.reduce(
		(characterCount, item) =>
			item.kind === "user"
				? characterCount + userContentText(item.content).length
				: characterCount,
		0,
	);
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

function buildMemberRow(match: SessionTurnTablePaneMatch): SessionTurnTableRow {
	return {
		characterCount: getMemberCharacterCount(match),
		key: `${match.option.key}:member`,
		match,
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
		speaker: "model",
		toolCallGroups: getToolCallGroups(match),
	};
}

export function buildSessionTurnTableViewRows(
	matches: readonly SessionTurnTablePaneMatch[],
	visibleSpeakers: ReadonlySet<SessionTurnTableSpeaker>,
	primarySpeaker: SessionTurnTableSpeaker,
): SessionTurnTableRow[] {
	const orderedSpeakers: readonly SessionTurnTableSpeaker[] =
		primarySpeaker === "model" ? ["model", "member"] : ["member", "model"];

	return matches.flatMap((match) =>
		orderedSpeakers.flatMap((speaker) => {
			if (!visibleSpeakers.has(speaker)) {
				return [];
			}
			if (speaker === "member") {
				return hasMemberMessage(match) ? [buildMemberRow(match)] : [];
			}
			return [buildModelRow(match)];
		}),
	);
}
