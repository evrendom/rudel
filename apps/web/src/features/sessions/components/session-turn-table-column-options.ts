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

type SessionTurnTableColumnOption = {
	key: SessionTurnTableColumnKey;
	label: string;
};

export const SESSION_TURN_TABLE_COLUMN_OPTIONS: readonly SessionTurnTableColumnOption[] =
	[
		{ key: "time", label: "Time" },
		{ key: "duration", label: "Duration" },
		{ key: "input", label: "Input" },
		{ key: "output", label: "Output" },
		{ key: "cost", label: "Cost" },
		{ key: "tools", label: "Tools" },
		{ key: "errors", label: "Errors" },
		{ key: "files", label: "Files" },
		{ key: "skills", label: "Skills" },
		{ key: "commands", label: "Commands" },
	];

export const DEFAULT_SESSION_TURN_TABLE_COLUMNS: readonly SessionTurnTableColumnKey[] =
	SESSION_TURN_TABLE_COLUMN_OPTIONS.map((option) => option.key);

export function isSessionTurnTableColumnVisible(
	columnKey: string,
	visibleColumns: ReadonlySet<SessionTurnTableColumnKey>,
) {
	const groupKey = columnKey.startsWith("command-") ? "commands" : columnKey;
	return [...visibleColumns].some((visibleKey) => visibleKey === groupKey);
}

export function toggleSessionTurnTableColumn({
	availableColumns,
	columnKey,
	visibleColumns,
}: {
	availableColumns: readonly SessionTurnTableColumnKey[];
	columnKey: SessionTurnTableColumnKey;
	visibleColumns: ReadonlySet<SessionTurnTableColumnKey>;
}): ReadonlySet<SessionTurnTableColumnKey> {
	const visibleAvailableCount = availableColumns.filter((key) =>
		visibleColumns.has(key),
	).length;
	if (visibleColumns.has(columnKey) && visibleAvailableCount === 1) {
		return visibleColumns;
	}

	const nextColumns = new Set(visibleColumns);
	if (nextColumns.has(columnKey)) {
		nextColumns.delete(columnKey);
	} else {
		nextColumns.add(columnKey);
	}
	return nextColumns;
}
