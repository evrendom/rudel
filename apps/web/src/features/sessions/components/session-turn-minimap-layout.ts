import {
	getSessionTurnMetricValue,
	type SessionTurnMetric,
} from "./session-turn-metric";
import type { SessionTurnTableOption } from "./session-turn-table";

export type SessionTurnMinimapRow = {
	compaction: boolean;
	edits: boolean;
	error: boolean;
	index: number;
	matched: boolean;
	ratio: number;
	skill: boolean;
	slashCommand: boolean;
	value: number | undefined;
};

export function buildSessionTurnMinimapRows(
	options: readonly SessionTurnTableOption[],
	metric: SessionTurnMetric,
	matchedIndices: ReadonlySet<number> | undefined,
) {
	const values = options.map((option) =>
		getSessionTurnMetricValue(option, metric),
	);
	const maximum = Math.max(0, ...values.map((value) => value ?? 0));

	return options.map((option, index): SessionTurnMinimapRow => {
		const value = values[index];
		return {
			compaction: option.compactionsBefore.length > 0,
			edits: option.metrics.editedFiles.length > 0,
			error: option.metrics.errorCount > 0,
			index,
			matched: matchedIndices?.has(index) ?? true,
			ratio:
				maximum > 0 && value !== undefined
					? Math.max(value / maximum, 0.06)
					: 0.06,
			skill: option.metrics.skills.length > 0,
			slashCommand: option.slashCommands.length > 0,
			value,
		};
	});
}

export function getMinimapIndexAtY(
	y: number,
	height: number,
	rowCount: number,
) {
	if (rowCount <= 0 || height <= 0) {
		return 0;
	}

	return Math.min(
		Math.max(Math.floor((y / height) * rowCount), 0),
		rowCount - 1,
	);
}
