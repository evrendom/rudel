import { describe, expect, test } from "bun:test";
import {
	buildSessionTurnMinimapRows,
	getMinimapIndexAtY,
} from "./session-turn-minimap-layout";
import { createSessionTurnV2TestOption } from "./session-turn-v2-test-fixtures";

describe("session turn minimap layout", () => {
	test("normalizes metric bars and preserves match state", () => {
		const base = createSessionTurnV2TestOption();
		const rows = buildSessionTurnMinimapRows(
			[
				base,
				createSessionTurnV2TestOption({
					metrics: { ...base.metrics, estimatedCost: 0.2 },
				}),
			],
			"cost",
			new Set([1]),
		);
		expect(rows.map((row) => row.ratio)).toEqual([0.5, 1]);
		expect(rows.map((row) => row.matched)).toEqual([false, true]);
	});

	test("maps pointer y positions to bounded document indices", () => {
		expect(getMinimapIndexAtY(50, 100, 10)).toBe(5);
		expect(getMinimapIndexAtY(150, 100, 10)).toBe(9);
		expect(getMinimapIndexAtY(-1, 100, 10)).toBe(0);
	});
});
