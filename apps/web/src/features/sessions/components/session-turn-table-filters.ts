import type { SessionTurnTableOption } from "./session-turn-table";

const SESSION_TURN_TABLE_SORT_COLUMNS = [
	"time",
	"duration",
	"input",
	"output",
	"cost",
	"errors",
	"files",
	"skills",
	"commands",
] as const;

export type SessionTurnTableSortKey =
	(typeof SESSION_TURN_TABLE_SORT_COLUMNS)[number];
type SessionTurnTableSortDirection = "asc" | "desc";
export type SessionTurnTableSortState = {
	direction: SessionTurnTableSortDirection;
	key: SessionTurnTableSortKey;
};

export type IndexedSessionTurnTableOption<
	TOption extends SessionTurnTableOption,
> = {
	index: number;
	option: TOption;
};

export function sortSessionTurnTableOptions<
	TOption extends SessionTurnTableOption,
>(
	matches: readonly IndexedSessionTurnTableOption<TOption>[],
	sort: SessionTurnTableSortState,
) {
	return [...matches].sort((leftMatch, rightMatch) => {
		const comparison = compareMatches(leftMatch, rightMatch, sort.key);
		const directedComparison =
			sort.direction === "asc" ? comparison : -comparison;
		return directedComparison || leftMatch.index - rightMatch.index;
	});
}

export function getInitialSessionTurnTableSortDirection(
	sortKey: SessionTurnTableSortKey,
): SessionTurnTableSortDirection {
	return sortKey === "time" ? "asc" : "desc";
}

function compareMatches<TOption extends SessionTurnTableOption>(
	leftMatch: IndexedSessionTurnTableOption<TOption>,
	rightMatch: IndexedSessionTurnTableOption<TOption>,
	sortKey: SessionTurnTableSortKey,
) {
	if (sortKey === "time") {
		return leftMatch.index - rightMatch.index;
	}

	if (sortKey === "files") {
		return (
			leftMatch.option.metrics.editedFiles.length -
			rightMatch.option.metrics.editedFiles.length
		);
	}

	if (sortKey === "skills") {
		return (
			leftMatch.option.metrics.skills.length -
			rightMatch.option.metrics.skills.length
		);
	}

	if (sortKey === "commands") {
		return (
			leftMatch.option.slashCommands.length -
			rightMatch.option.slashCommands.length
		);
	}

	return (
		getSessionTurnTableNumericValue(leftMatch.option, sortKey) -
		getSessionTurnTableNumericValue(rightMatch.option, sortKey)
	);
}

function getSessionTurnTableNumericValue(
	option: SessionTurnTableOption,
	sortKey: Exclude<
		SessionTurnTableSortKey,
		"commands" | "files" | "skills" | "time"
	>,
) {
	switch (sortKey) {
		case "input":
			return option.metrics.inputTokens ?? 0;
		case "output":
			return option.metrics.outputTokens ?? 0;
		case "cost":
			return option.metrics.estimatedCost ?? 0;
		case "errors":
			return option.metrics.errorCount;
		case "duration":
			return option.timing.durationSeconds ?? 0;
	}
}
