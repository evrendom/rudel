import { describe, expect, test } from "bun:test";
import {
	DEFAULT_SESSION_TURN_TABLE_COLUMNS,
	isSessionTurnTableColumnVisible,
	type SessionTurnTableColumnKey,
} from "./session-turn-table-column-options";

describe("session turn table columns", () => {
	test("uses the complete fixed column set", () => {
		expect(DEFAULT_SESSION_TURN_TABLE_COLUMNS).toEqual([
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
		]);
	});

	test("maps scalar and indexed command columns to their fixed groups", () => {
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
});
