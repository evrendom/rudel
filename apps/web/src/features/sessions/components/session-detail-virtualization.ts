import type { SessionTurnTableRow } from "./session-turn-table";
import type { SessionTurnSelection } from "./session-turn-table-selection";

export const SESSION_DETAIL_VIRTUAL_OVERSCAN = 4;

const LEDGER_ROW_HEIGHT_PX = 36;
const LEDGER_AUXILIARY_ROW_HEIGHT_PX = 34;

export type SessionTurnTableVirtualizerHandle = {
	scrollToSelection: (
		selection: SessionTurnSelection,
		options?: { behavior?: ScrollBehavior },
	) => void;
};

export function measureSessionVirtualElement(element: HTMLElement) {
	return element.offsetHeight;
}

export function estimateSessionTurnTableRowSize(input: {
	beginsTurn: boolean;
	hasEpisode: boolean;
	row: SessionTurnTableRow;
}) {
	if (!input.beginsTurn) {
		return LEDGER_ROW_HEIGHT_PX;
	}
	return (
		LEDGER_ROW_HEIGHT_PX +
		(input.hasEpisode ? LEDGER_AUXILIARY_ROW_HEIGHT_PX : 0) +
		input.row.match.option.compactionsBefore.length *
			LEDGER_AUXILIARY_ROW_HEIGHT_PX
	);
}
