import { describe, expect, test } from "bun:test";
import {
	buildSessionThreadOverviewClockTicks,
	buildSessionThreadOverviewTimelineScale,
} from "./session-thread-overview-timeline";

const MINUTE_MS = 60 * 1_000;

describe("buildSessionThreadOverviewClockTicks", () => {
	test("uses round real-time timestamps and omits the removed idle span", () => {
		const scale = buildSessionThreadOverviewTimelineScale([
			{
				endTimestamp: Date.parse("2026-08-11T10:10:00.000Z"),
				key: "first",
				startTimestamp: Date.parse("2026-08-11T10:00:00.000Z"),
			},
			{
				endTimestamp: Date.parse("2026-08-11T12:20:00.000Z"),
				key: "second",
				startTimestamp: Date.parse("2026-08-11T12:10:00.000Z"),
			},
		]);
		const cutoff = scale.breaks[0];
		expect(cutoff).toBeDefined();
		if (!cutoff) {
			throw new Error("expected the fixture to contain an idle cutoff");
		}

		const ticks = buildSessionThreadOverviewClockTicks(scale, {
			includeBounds: false,
			targetTickCount: 10,
			xEndRatio: 1,
			xStartRatio: 0,
		});

		expect(ticks.length).toBeGreaterThan(2);
		expect(ticks.every((tick) => tick.timestamp % (5 * MINUTE_MS) === 0)).toBe(
			true,
		);
		expect(
			ticks.some(
				(tick) =>
					tick.timestamp >= cutoff.startTimestamp &&
					tick.timestamp <= cutoff.endTimestamp,
			),
		).toBe(false);
		expect(
			ticks.map((tick) => new Date(tick.timestamp).toISOString()),
		).toContain("2026-08-11T12:00:00.000Z");
	});

	test("keeps exact viewport bounds for the major time labels", () => {
		const scale = buildSessionThreadOverviewTimelineScale([
			{
				endTimestamp: Date.parse("2026-08-11T10:47:00.000Z"),
				key: "session",
				startTimestamp: Date.parse("2026-08-11T10:03:00.000Z"),
			},
		]);
		const ticks = buildSessionThreadOverviewClockTicks(scale, {
			includeBounds: true,
			minimumSpacingRatio: 0.12,
			targetTickCount: 6,
			xEndRatio: 1,
			xStartRatio: 0,
		});

		expect(ticks[0]?.timestamp).toBe(Date.parse("2026-08-11T10:03:00.000Z"));
		expect(ticks.at(-1)?.timestamp).toBe(
			Date.parse("2026-08-11T10:47:00.000Z"),
		);
		expect(
			ticks.slice(1, -1).every((tick) => {
				const date = new Date(tick.timestamp);
				return date.getSeconds() === 0 && date.getMinutes() % 5 === 0;
			}),
		).toBe(true);
	});
});
