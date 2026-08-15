export type SessionTurnTableSpeaker = "member" | "model";

export type SessionTurnSelection = {
	readonly index: number;
	readonly speaker: SessionTurnTableSpeaker;
};

type SelectableSessionTurnRow = {
	readonly key: string;
	readonly match: { readonly index: number };
	readonly speaker: SessionTurnTableSpeaker;
};

export function isSessionTurnTableRowInViewport({
	turnIndex,
	viewportRange,
}: {
	turnIndex: number;
	viewportRange: readonly [number, number] | undefined;
}) {
	return (
		viewportRange !== undefined &&
		turnIndex >= viewportRange[0] &&
		turnIndex <= viewportRange[1]
	);
}

export function getSessionTurnTableSelectedRowKey({
	rows,
	selection,
}: {
	rows: readonly SelectableSessionTurnRow[];
	selection: SessionTurnSelection;
}): string | undefined {
	return (
		rows.find(
			(row) =>
				row.match.index === selection.index &&
				row.speaker === selection.speaker,
		)?.key ?? rows.find((row) => row.match.index === selection.index)?.key
	);
}

export function getVisibleSessionTurnSpeaker(
	preferredSpeaker: SessionTurnTableSpeaker,
	visibleSpeakers: ReadonlySet<SessionTurnTableSpeaker>,
): SessionTurnTableSpeaker {
	if (visibleSpeakers.has(preferredSpeaker)) {
		return preferredSpeaker;
	}
	if (visibleSpeakers.has("model")) {
		return "model";
	}
	if (visibleSpeakers.has("member")) {
		return "member";
	}
	return preferredSpeaker;
}
