import { describe, expect, test } from "bun:test";
import {
	calculateSessionRequestCost,
	summarizeSessionRequestUsage,
} from "../index.js";

const PRICED_TURN = [
	{
		at: "2026-08-10T10:00:00.000Z",
		cacheCreation1hInputTokens: 200_000,
		cacheCreation5mInputTokens: 100_000,
		cacheCreationInputTokens: 300_000,
		cacheReadInputTokens: 200_000,
		inputTokens: 100_000,
		model: "claude-opus-5",
		outputTokens: 400_000,
	},
];

const PRICED_SUBAGENT = [
	{
		at: "2026-08-10T10:00:30.000Z",
		cacheCreationInputTokens: 0,
		cacheReadInputTokens: 1_000_000,
		inputTokens: 0,
		model: "claude-fable-5",
		outputTokens: 0,
	},
];

const UNPRICED_REQUEST = [
	{
		at: "2026-08-10T10:00:30.000Z",
		cacheCreationInputTokens: 0,
		cacheReadInputTokens: 1_000_000,
		inputTokens: 0,
		model: "unknown-model",
		outputTokens: 0,
	},
];

describe("session request pricing", () => {
	test("prices one turn from its request-level token classes", () => {
		expect(summarizeSessionRequestUsage(PRICED_TURN)).toEqual({
			estimatedCost: 13.225,
			inputTokens: 600_000,
			outputTokens: 400_000,
		});
	});

	test("prices a long-context request at the long-band rate", () => {
		expect(
			summarizeSessionRequestUsage([
				{
					at: "2026-08-10T10:00:00.000Z",
					cacheCreationInputTokens: 0,
					cacheReadInputTokens: 0,
					inputTokens: 1_000_000,
					model: "gpt-5.6-sol",
					outputTokens: 0,
				},
			]).estimatedCost,
		).toBe(10);
	});

	test("sums turn and subagent request groups without inventing missing prices", () => {
		expect(
			calculateSessionRequestCost([PRICED_TURN, [], PRICED_SUBAGENT]),
		).toBe(14.225);
		expect(
			calculateSessionRequestCost([PRICED_TURN, UNPRICED_REQUEST]),
		).toBeNull();
		expect(calculateSessionRequestCost([[]])).toBeNull();
	});
});
