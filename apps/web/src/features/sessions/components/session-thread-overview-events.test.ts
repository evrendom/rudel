import { describe, expect, test } from "vitest";
import { buildSessionThreadOverviewChart } from "./session-thread-overview-chart";
import { buildSessionThreadOverviewTimelineEvents } from "./session-thread-overview-events";
import { createSessionTurnTestOption } from "./session-turn-test-fixtures";

describe("buildSessionThreadOverviewTimelineEvents", () => {
	test("projects turn activity from its recorded timestamps", () => {
		const option = {
			...createSessionTurnTestOption({
				metrics: {
					editedFiles: [],
					errorCount: 1,
					errorEvents: [{ at: "2026-08-11T10:00:15.000Z" }],
					estimatedCost: 0.1,
					inputTokens: 1_000,
					outputTokens: 200,
					skills: ["ui"],
					skillEvents: [{ at: "2026-08-11T10:00:45.000Z", skill: "ui" }],
					usageEvents: [],
				},
				timing: {
					durationLabel: "1 min",
					durationSeconds: 60,
					endTime: "10:01",
					endTimestamp: "2026-08-11T10:01:00.000Z",
					startTime: "10:00",
					startTimestamp: "2026-08-11T10:00:00.000Z",
				},
			}),
			fileEvents: [
				{
					at: "2026-08-11T10:00:20.000Z",
					count: 2,
					operation: "read" as const,
				},
				{
					at: "2026-08-11T10:00:30.000Z",
					count: 1,
					operation: "created" as const,
				},
				{
					at: "2026-08-11T10:00:35.000Z",
					count: 1,
					operation: "edited" as const,
				},
			],
			subagentEvents: [
				{
					at: "2026-08-11T10:00:40.000Z",
					count: 1,
				},
			],
		};
		const chart = buildSessionThreadOverviewChart([option]);
		const events = buildSessionThreadOverviewTimelineEvents(chart, [option]);

		expect(events).toHaveLength(6);
		expect(events[0]).toMatchObject({ kind: "error", xRatio: 0.25 });
		expect(events[1]).toMatchObject({
			kind: "skill",
			label: "Skill: ui",
			xRatio: 0.75,
		});
		expect(events.slice(2)).toMatchObject([
			{ count: 2, kind: "file-read", xRatio: 1 / 3 },
			{ count: 1, kind: "file-write", xRatio: 0.5 },
			{ count: 1, kind: "file-edit", xRatio: 7 / 12 },
			{ count: 1, kind: "subagent", xRatio: 2 / 3 },
		]);
	});
});
