import type { SessionTurnTableRow } from "./session-turn-table";
import type { SessionTurnTablePaneOption } from "./session-turn-table-pane";
import type { SessionTurnSelection } from "./session-turn-table-selection";

export const SESSION_DETAIL_VIRTUAL_OVERSCAN = 4;

const LEDGER_ROW_HEIGHT_PX = 36;
const LEDGER_AUXILIARY_ROW_HEIGHT_PX = 34;
const THREAD_BASE_HEIGHT_PX = 144;
const THREAD_LINE_HEIGHT_PX = 22;
const THREAD_PREVIEW_CHARACTERS_PER_LINE = 86;
const THREAD_MAX_ESTIMATED_PREVIEW_LINES = 3;
const THREAD_MESSAGE_ROW_HEIGHT_PX = 112;
const THREAD_COMPACT_ROW_HEIGHT_PX = 24;
const THREAD_CHIP_ROW_HEIGHT_PX = 32;

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

export function estimateSessionContinuousTurnSize(
	option: SessionTurnTablePaneOption,
) {
	const previewCharacters = option.memberPreview.length + option.preview.length;
	const previewLines = Math.min(
		THREAD_MAX_ESTIMATED_PREVIEW_LINES,
		Math.max(
			1,
			Math.ceil(previewCharacters / THREAD_PREVIEW_CHARACTERS_PER_LINE),
		),
	);
	const messageRows = option.metrics.usageEvents.length;
	return (
		THREAD_BASE_HEIGHT_PX +
		previewLines * THREAD_LINE_HEIGHT_PX +
		messageRows * THREAD_MESSAGE_ROW_HEIGHT_PX +
		(option.toolCallCount + option.metrics.errorCount) *
			THREAD_COMPACT_ROW_HEIGHT_PX +
		(option.metrics.skills.length > 0 ? THREAD_CHIP_ROW_HEIGHT_PX : 0) +
		(option.metrics.editedFiles.length > 0 ? THREAD_CHIP_ROW_HEIGHT_PX : 0)
	);
}
