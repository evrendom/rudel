import { describe, expect, test } from "bun:test";
import type { SessionThreadOverviewChartRow } from "./session-thread-overview-chart";
import {
	buildSessionOverviewCallSeries,
	formatElapsedSinceStart,
	formatTimelineMomentWithSeconds,
} from "./session-thread-overview-model";
import type { TokenUsageEvent } from "./session-turn-metadata";

function createRow(
	overrides: Partial<SessionThreadOverviewChartRow>,
): SessionThreadOverviewChartRow {
	return {
		cost: undefined,
		editCount: 0,
		errorCount: 0,
		index: 0,
		inputTokens: undefined,
		reasoningCount: 0,
		skillCount: 0,
		subagentCount: 0,
		xEndRatio: 0,
		xRatio: 0,
		xStartRatio: 0,
		...overrides,
	};
}

describe("scrub time formatting", () => {
	test("formatElapsedSinceStart scales from seconds to days", () => {
		expect(formatElapsedSinceStart(45 * 1_000)).toBe("+45s");
		expect(formatElapsedSinceStart(90 * 1_000)).toBe("+1m");
		expect(formatElapsedSinceStart((2 * 60 + 13) * 60 * 1_000)).toBe("+2h 13m");
		expect(formatElapsedSinceStart(26 * 60 * 60 * 1_000)).toBe("+1d 2h");
		expect(formatElapsedSinceStart(0)).toBe("+0s");
	});

	test("formatTimelineMomentWithSeconds includes seconds precision", () => {
		const label = formatTimelineMomentWithSeconds(
			Date.parse("2026-08-02T14:32:07.000Z"),
		);
		expect(label).toMatch(/\d{2}:\d{2}:\d{2}/);
	});
});

function createUsageEvent(
	overrides: Partial<TokenUsageEvent>,
): TokenUsageEvent {
	return {
		at: "2026-08-02T10:00:00.000Z",
		cacheCreationInputTokens: 0,
		cacheReadInputTokens: 0,
		inputTokens: 0,
		model: undefined,
		outputTokens: 0,
		...overrides,
	};
}

describe("buildSessionOverviewCallSeries", () => {
	test("carries a model-call's reported context window into its shared scale", () => {
		const rows = [createRow({ index: 0, xEndRatio: 1, xStartRatio: 0 })];
		const series = buildSessionOverviewCallSeries(rows, () => [
			createUsageEvent({
				inputTokens: 209_608,
				model: "gpt-5.6-sol",
				modelContextWindow: 258_400,
			}),
		]);

		expect(series.turns[0]?.calls[0]?.modelContextWindow).toBe(258_400);
		expect(series.aggregates.modelContextLimits).toEqual([
			{
				model: "gpt-5.6-sol",
				source: "reported",
				tokenLimit: 258_400,
			},
		]);
	});

	test("normalizes call composition and session aggregates once", () => {
		const rows = [
			createRow({ index: 0, xEndRatio: 0.4, xStartRatio: 0 }),
			createRow({ index: 1, xEndRatio: 1, xStartRatio: 0.6 }),
		];
		const usageByTurn: readonly (readonly TokenUsageEvent[])[] = [
			[
				createUsageEvent({
					cacheCreationInputTokens: 20,
					cacheReadInputTokens: 300,
					inputTokens: 100,
					model: "model-b",
				}),
				createUsageEvent({
					at: "2026-08-02T10:01:00.000Z",
					inputTokens: 80,
					model: "model-a",
				}),
			],
			[
				createUsageEvent({
					inputTokens: 500,
					model: "model-b",
				}),
			],
		];
		const series = buildSessionOverviewCallSeries(
			rows,
			(rowIndex) => usageByTurn[rowIndex] ?? [],
		);

		expect(series.turns[0]?.calls[0]).toEqual({
			cacheCreation: 20,
			cacheRead: 300,
			fresh: 100,
			inputTotal: 420,
			model: "model-b",
			xRatio: 0,
		});
		expect(series.turns[0]?.inputTotal).toBe(500);
		expect(series.aggregates).toEqual({
			largestCallInputTotal: 500,
			largestTurnInputTotal: 500,
			modelContextLimits: [
				{ model: "model-a", source: "observed", tokenLimit: 80 },
				{ model: "model-b", source: "observed", tokenLimit: 500 },
			],
		});
	});

	test("keeps timestamped calls ordered and appends unknown timestamps stably", () => {
		const rows = [createRow({ index: 0, xEndRatio: 1, xStartRatio: 0 })];
		const series = buildSessionOverviewCallSeries(rows, () => [
			createUsageEvent({ at: "unknown-a", inputTokens: 3 }),
			createUsageEvent({
				at: "2026-08-02T10:02:00.000Z",
				inputTokens: 2,
			}),
			createUsageEvent({ at: "unknown-b", inputTokens: 4 }),
			createUsageEvent({
				at: "2026-08-02T10:00:00.000Z",
				inputTokens: 1,
			}),
		]);

		expect(series.turns[0]?.calls.map((call) => call.inputTotal)).toEqual([
			1, 2, 3, 4,
		]);
		expect(series.turns[0]?.calls.map((call) => call.xRatio)).toEqual([
			0, 0.25, 0.5, 0.75,
		]);
	});
});
