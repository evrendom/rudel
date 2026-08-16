import type { SessionTurnTablePaneOption } from "./session-turn-table-pane";

export function getSessionOverviewAggregateCounts(
	options: readonly SessionTurnTablePaneOption[],
) {
	const editedFiles = new Set<string>();
	const skills = new Set<string>();
	let errorCount = 0;
	let toolCallCount = 0;

	for (const option of options) {
		errorCount += option.metrics.errorCount;
		toolCallCount += option.toolCallCount;
		for (const file of option.metrics.editedFiles) {
			editedFiles.add(file);
		}
		for (const skill of option.metrics.skills) {
			skills.add(skill);
		}
	}

	return {
		editedFileCount: editedFiles.size,
		errorCount,
		skillCount: skills.size,
		toolCallCount,
		turnCount: options.filter((option) => option.turnNumber !== undefined)
			.length,
	};
}
