import { describe, expect, test } from "bun:test";
import { buildSessionThreadOverviewChart } from "./session-thread-overview-chart";
import { buildSessionThreadOverviewTimelineEvents } from "./session-thread-overview-events";
import { createSessionTurnTestOption } from "./session-turn-test-fixtures";

describe("buildSessionThreadOverviewTimelineEvents", () => {
	test("projects errors and skill uses from their recorded timestamps", () => {
		const option = createSessionTurnTestOption({
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
		});
		const chart = buildSessionThreadOverviewChart([
			{ ...option, reasoningCount: 0, subagentCount: 0 },
		]);
		const events = buildSessionThreadOverviewTimelineEvents(chart, [option]);

		expect(events).toHaveLength(2);
		expect(events[0]).toMatchObject({ kind: "error", xRatio: 0.25 });
		expect(events[1]).toMatchObject({
			kind: "skill",
			label: "Skill: ui",
			xRatio: 0.75,
		});
	});
});
