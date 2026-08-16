import { describe, expect, test } from "bun:test";
import type { SessionTurnMetrics } from "./components/session-turn-metadata";
import { getSessionEstimatedCost } from "./session-cost";

function turnMetrics(
	estimatedCost: number | undefined,
	usageEventCount: number,
): SessionTurnMetrics {
	return {
		editedFiles: [],
		errorCount: 0,
		errorEvents: [],
		estimatedCost,
		inputTokens: undefined,
		outputTokens: undefined,
		skills: [],
		skillEvents: [],
		usageEvents: Array.from({ length: usageEventCount }, () => ({
			at: "2026-08-10T10:00:00.000Z",
			cacheCreationInputTokens: 0,
			cacheReadInputTokens: 0,
			inputTokens: 1,
			model: "claude-opus-4-1",
			outputTokens: 0,
		})),
	};
}

describe("getSessionEstimatedCost", () => {
	test("sums priced request events across turns", () => {
		expect(
			getSessionEstimatedCost([turnMetrics(3.25, 1), turnMetrics(7.5, 2)]),
		).toBe(10.75);
	});

	test("ignores turns without usage and rejects partially unpriced usage", () => {
		expect(
			getSessionEstimatedCost([turnMetrics(undefined, 0), turnMetrics(4.5, 1)]),
		).toBe(4.5);
		expect(
			getSessionEstimatedCost([turnMetrics(4.5, 1), turnMetrics(undefined, 1)]),
		).toBeUndefined();
	});
});
