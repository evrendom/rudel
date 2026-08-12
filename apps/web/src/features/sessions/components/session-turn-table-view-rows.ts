import { userContentText } from "@/components/conversation/conversation-trace";
import type { SessionTurnTableRow } from "./session-turn-table";
import type { SessionTurnTablePaneMatch } from "./session-turn-table-pane";
import type { SessionTurnTableView } from "./session-turn-table-view-tabs";

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
	};
}

function buildModelRow(match: SessionTurnTablePaneMatch): SessionTurnTableRow {
	return {
		characterCount: undefined,
		key: `${match.option.key}:model`,
		match,
		speaker: "model",
	};
}

export function buildSessionTurnTableViewRows(
	matches: readonly SessionTurnTablePaneMatch[],
	view: SessionTurnTableView,
): SessionTurnTableRow[] {
	if (view === "model") {
		return matches.map(buildModelRow);
	}

	if (view === "member") {
		return matches.filter(hasMemberMessage).map(buildMemberRow);
	}

	return matches.flatMap((match) =>
		hasMemberMessage(match)
			? [buildMemberRow(match), buildModelRow(match)]
			: [buildModelRow(match)],
	);
}
