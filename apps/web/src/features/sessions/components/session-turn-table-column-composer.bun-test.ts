import { describe, expect, test } from "bun:test";
import {
	DEFAULT_SESSION_TURN_TABLE_COLUMNS,
	isSessionTurnTableColumnVisible,
	SESSION_TURN_TABLE_COLUMN_OPTIONS,
	type SessionTurnTableColumnKey,
	toggleSessionTurnTableColumn,
} from "./session-turn-table-column-options";

describe("session turn table column composer", () => {
	test("exposes every turn table column in display order", () => {
		expect(
			SESSION_TURN_TABLE_COLUMN_OPTIONS.map((option) => option.label),
		).toEqual([
			"Time",
			"Duration",
			"Input",
			"Output",
			"Cost",
			"Tools",
			"Errors",
			"Files",
			"Skills",
			"Commands",
		]);
		expect(DEFAULT_SESSION_TURN_TABLE_COLUMNS).toEqual(
			SESSION_TURN_TABLE_COLUMN_OPTIONS.map((option) => option.key),
		);
	});

	test("maps scalar and indexed command columns to their composer controls", () => {
		const visibleColumns: ReadonlySet<SessionTurnTableColumnKey> = new Set([
			"time",
			"commands",
		]);

		expect(isSessionTurnTableColumnVisible("time", visibleColumns)).toBe(true);
		expect(isSessionTurnTableColumnVisible("cost", visibleColumns)).toBe(false);
		expect(isSessionTurnTableColumnVisible("command-0", visibleColumns)).toBe(
			true,
		);
		expect(isSessionTurnTableColumnVisible("command-4", visibleColumns)).toBe(
			true,
		);
	});

	test("toggles columns without mutating the current selection", () => {
		const currentColumns = new Set(DEFAULT_SESSION_TURN_TABLE_COLUMNS);
		const nextColumns = toggleSessionTurnTableColumn({
			availableColumns: DEFAULT_SESSION_TURN_TABLE_COLUMNS,
			columnKey: "cost",
			visibleColumns: currentColumns,
		});

		expect(nextColumns.has("cost")).toBe(false);
		expect(currentColumns.has("cost")).toBe(true);
		expect(
			toggleSessionTurnTableColumn({
				availableColumns: DEFAULT_SESSION_TURN_TABLE_COLUMNS,
				columnKey: "cost",
				visibleColumns: nextColumns,
			}).has("cost"),
		).toBe(true);
	});

	test("keeps one available column visible for rows and compaction spans", () => {
		const currentColumns: ReadonlySet<SessionTurnTableColumnKey> = new Set([
			"time",
			"commands",
		]);
		const nextColumns = toggleSessionTurnTableColumn({
			availableColumns: ["time"],
			columnKey: "time",
			visibleColumns: currentColumns,
		});

		expect(nextColumns).toBe(currentColumns);
		expect(nextColumns.has("time")).toBe(true);
	});
});
