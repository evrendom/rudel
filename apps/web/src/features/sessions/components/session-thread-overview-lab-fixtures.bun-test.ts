import { describe, expect, test } from "bun:test";
import {
	buildSessionOverviewLabFixture,
	parseSessionOverviewLabScenario,
	SESSION_OVERVIEW_LAB_SCENARIOS,
} from "./session-thread-overview-lab-fixtures";

describe("buildSessionOverviewLabFixture", () => {
	test("every scenario is deterministic across repeated builds", () => {
		for (const scenario of SESSION_OVERVIEW_LAB_SCENARIOS) {
			const first = buildSessionOverviewLabFixture(scenario.value);
			const second = buildSessionOverviewLabFixture(scenario.value);
			expect(JSON.stringify(second)).toBe(JSON.stringify(first));
		}
	});

	test("marathon spans multiple days with idle gaps beyond the break threshold", () => {
		const fixture = buildSessionOverviewLabFixture("marathon");
		expect(fixture.options).toHaveLength(78);

		const timestamps = fixture.options.map((option) =>
			Date.parse(option.timing.startTimestamp ?? ""),
		);
		const firstTimestamp = timestamps[0];
		const lastTimestamp = timestamps.at(-1);
		expect(firstTimestamp).toBeDefined();
		expect(lastTimestamp).toBeDefined();
		if (firstTimestamp === undefined || lastTimestamp === undefined) {
			throw new Error("marathon fixture is missing boundary timestamps");
		}
		expect(lastTimestamp - firstTimestamp).toBeGreaterThan(
			20 * 60 * 60 * 1_000,
		);

		const maximumGapMs = timestamps.reduce((maximum, timestamp, index) => {
			const previous = timestamps[index - 1];
			return previous === undefined
				? maximum
				: Math.max(maximum, timestamp - previous);
		}, 0);
		expect(maximumGapMs).toBeGreaterThan(60 * 60 * 1_000);
		expect(Object.keys(fixture.subagents)).toHaveLength(2);
	});

	test("missing-data scenario mixes undefined costs, tokens, and timestamps", () => {
		const fixture = buildSessionOverviewLabFixture("missing-data");
		expect(
			fixture.options.some(
				(option) => option.metrics.estimatedCost === undefined,
			),
		).toBe(true);
		expect(
			fixture.options.some(
				(option) => option.metrics.inputTokens === undefined,
			),
		).toBe(true);
		expect(
			fixture.options.some(
				(option) => option.timing.startTimestamp === undefined,
			),
		).toBe(true);
	});

	test("skill-heavy includes the glyph overflow case", () => {
		const fixture = buildSessionOverviewLabFixture("skill-heavy");
		expect(
			fixture.options.some((option) => option.metrics.skills.length > 3),
		).toBe(true);
	});

	test("density stress produces 420 turns and empty produces none", () => {
		expect(
			buildSessionOverviewLabFixture("density-stress").options,
		).toHaveLength(420);
		expect(buildSessionOverviewLabFixture("empty").options).toHaveLength(0);
	});

	test("reasoning counts survive the trace shape the strip counts from", () => {
		const fixture = buildSessionOverviewLabFixture("sprint");
		const withReasoning = fixture.options.find((option) =>
			option.turn.responseItems.some(
				(item) => item.kind === "agent" && item.events.length > 0,
			),
		);
		expect(withReasoning).toBeDefined();
	});
});

describe("parseSessionOverviewLabScenario", () => {
	test("returns the matching scenario and falls back to marathon", () => {
		expect(parseSessionOverviewLabScenario("sprint")).toBe("sprint");
		expect(parseSessionOverviewLabScenario("unknown")).toBe("marathon");
	});
});
