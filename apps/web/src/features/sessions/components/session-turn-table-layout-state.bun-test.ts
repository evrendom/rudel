import { describe, expect, test } from "bun:test";
import { getInitialSessionTurnTableVisibility } from "./session-turn-table-layout-state";

describe("session turn table layout state", () => {
	test("starts the collapsible reader route with the table hidden", () => {
		expect(getInitialSessionTurnTableVisibility(true)).toBe("collapsed");
	});

	test("keeps existing table routes expanded by default", () => {
		expect(getInitialSessionTurnTableVisibility(false)).toBe("expanded");
	});
});
