export type SessionTurnTableColumnKey =
	| "time"
	| "duration"
	| "input"
	| "output"
	| "cost"
	| "tools"
	| "errors"
	| "files"
	| "skills"
	| "commands";

export const DEFAULT_SESSION_TURN_TABLE_COLUMNS: readonly SessionTurnTableColumnKey[] =
	[
		"time",
		"duration",
		"input",
		"output",
		"cost",
		"tools",
		"errors",
		"files",
		"skills",
		"commands",
	];

export function isSessionTurnTableColumnVisible(
	columnKey: string,
	visibleColumns: ReadonlySet<SessionTurnTableColumnKey>,
) {
	const groupKey = columnKey.startsWith("command-") ? "commands" : columnKey;
	return [...visibleColumns].some((visibleKey) => visibleKey === groupKey);
}
