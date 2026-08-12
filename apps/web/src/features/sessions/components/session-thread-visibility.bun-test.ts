import { describe, expect, test } from "bun:test";
import {
	buildSessionThreadSegments,
	summarizeHiddenTurns,
} from "./session-thread-visibility";
import { createSessionTurnV2TestOption } from "./session-turn-v2-test-fixtures";

describe("session thread visibility", () => {
	test("collapses contiguous non-matches and expands a requested segment", () => {
		const matches = new Set([1, 4]);
		const collapsed = buildSessionThreadSegments(6, matches, new Set());
		expect(collapsed.map((segment) => segment.type)).toEqual([
			"hidden",
			"turn",
			"hidden",
			"turn",
			"hidden",
		]);
		const first = collapsed[0];
		expect(first?.type === "hidden" ? first.indices : []).toEqual([0]);
		expect(
			buildSessionThreadSegments(6, matches, new Set(["hidden-2-3"]))
				.filter((segment) => segment.type === "turn")
				.map((segment) => segment.index),
		).toEqual([1, 2, 3, 4]);
	});

	test("summarizes hidden cost and duration without inventing missing pricing", () => {
		const base = createSessionTurnV2TestOption();
		const options = [
			base,
			createSessionTurnV2TestOption({
				metrics: { ...base.metrics, estimatedCost: undefined },
			}),
		];
		expect(summarizeHiddenTurns([0, 1], options)).toBe(
			"2 turns hidden · $0.10 · 2m",
		);
		expect(summarizeHiddenTurns([1], options)).toContain("$—");
	});
});
