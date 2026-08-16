import type { VirtualItem } from "@tanstack/react-virtual";
import type { SessionTurnTableRow } from "./session-turn-table";
import type { SessionTurnTablePaneOption } from "./session-turn-table-pane";
import type { SessionTurnSelection } from "./session-turn-table-selection";

export const SESSION_DETAIL_VIRTUAL_OVERSCAN = 4;

const LEDGER_ROW_HEIGHT_PX = 36;
const LEDGER_AUXILIARY_ROW_HEIGHT_PX = 34;
const THREAD_BASE_HEIGHT_PX = 176;
const THREAD_LINE_HEIGHT_PX = 22;
const THREAD_PREVIEW_CHARACTERS_PER_LINE = 86;
const THREAD_MAX_ESTIMATED_PREVIEW_LINES = 8;

export type SessionTurnTableVirtualizerHandle = {
	scrollToSelection: (
		selection: SessionTurnSelection,
		options?: { behavior?: ScrollBehavior },
	) => void;
};

export type SessionContinuousTurnVirtualizerHandle = {
	measure: () => void;
	scrollToIndex: (
		index: number,
		options?: {
			behavior?: ScrollBehavior;
			align?: "auto" | "center" | "end" | "start";
		},
	) => void;
};

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
	const activityRows = Math.min(
		6,
		option.toolCallCount +
			option.metrics.errorCount +
			option.metrics.skills.length,
	);
	return (
		THREAD_BASE_HEIGHT_PX +
		previewLines * THREAD_LINE_HEIGHT_PX +
		activityRows * 20
	);
}

export function getSessionVirtualViewport(input: {
	count: number;
	items: readonly VirtualItem[];
	scrollOffset: number;
	viewportSize: number;
}) {
	if (input.count === 0) {
		return undefined;
	}
	const viewportEnd = input.scrollOffset + input.viewportSize;
	const visibleItems = input.items.filter(
		(item) => item.end > input.scrollOffset && item.start < viewportEnd,
	);
	const fallback = input.items[0];
	const first = visibleItems[0] ?? fallback;
	const last = visibleItems.at(-1) ?? fallback;
	if (!first || !last) {
		return undefined;
	}

	const focusOffset = Math.min(input.viewportSize * 0.3, 160);
	const focusLine = input.scrollOffset + focusOffset;
	let activeIndex = first.index;
	for (const item of visibleItems) {
		if (item.start > focusLine) {
			break;
		}
		activeIndex = item.index;
	}
	if (input.scrollOffset <= 2) {
		activeIndex = 0;
	}
	const finalItem = input.items.at(-1);
	if (
		finalItem?.index === input.count - 1 &&
		viewportEnd >= finalItem.end - 2
	) {
		activeIndex = input.count - 1;
	}

	return {
		activeIndex,
		visibleRange: [first.index, last.index] as const,
	};
}
