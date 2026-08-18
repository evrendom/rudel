import { describe, expect, test } from "bun:test";
import {
	getSessionOverviewCallActivityCounts,
	resolveSessionOverviewHoverAtRatio,
} from "./session-thread-overview-call-activity";
import { resolveSessionThreadOverviewStripConfig } from "./session-thread-overview-config";
import type { SessionThreadOverviewTimelineEvent } from "./session-thread-overview-events";
import type { SessionOverviewCallSeries } from "./session-thread-overview-model";

const FIRST_CALL_TIMESTAMP = Date.parse("2026-08-18T10:00:00.000Z");
const SECOND_CALL_TIMESTAMP = Date.parse("2026-08-18T10:10:00.000Z");

const SERIES: SessionOverviewCallSeries = {
	aggregates: {
		largestCallInputTotal: 200,
		largestTurnInputTotal: 300,
		modelContextLimits: [],
	},
	turns: [
		{
			calls: [
				{
					cacheCreation: 0,
					cacheRead: 0,
					fresh: 100,
					inputTotal: 100,
					model: "first",
					timestampMs: FIRST_CALL_TIMESTAMP,
					xRatio: 0.1,
				},
				{
					cacheCreation: 0,
					cacheRead: 0,
					fresh: 200,
					inputTotal: 200,
					model: "second",
					timestampMs: SECOND_CALL_TIMESTAMP,
					xRatio: 0.9,
				},
			],
			index: 4,
			inputTotal: 300,
			xEndRatio: 1,
			xStartRatio: 0,
		},
	],
};

function createEvent(
	kind: SessionThreadOverviewTimelineEvent["kind"],
	timestamp: string,
	overrides: Partial<SessionThreadOverviewTimelineEvent> = {},
): SessionThreadOverviewTimelineEvent {
	return {
		count: 1,
		key: `${kind}-${timestamp}`,
		kind,
		label: kind,
		timestamp: Date.parse(timestamp),
		turnIndex: 4,
		xRatio: 0.5,
		...overrides,
	};
}

describe("model-call activity ownership", () => {
	test("prefers the error circle's turn over a nearer turn endpoint", () => {
		const config = resolveSessionThreadOverviewStripConfig({
			chartWidth: 1_000,
			plotPadding: 0,
		});
		const error = createEvent("error", "2026-08-18T10:02:00.000Z", {
			turnIndex: 1,
			xRatio: 0.25,
		});
		const rows = [
			{
				cost: undefined,
				index: 0,
				inputTokens: undefined,
				xEndRatio: 0.1,
				xRatio: 0.1,
				xStartRatio: 0,
			},
			{
				cost: undefined,
				index: 1,
				inputTokens: undefined,
				xEndRatio: 0.8,
				xRatio: 0.8,
				xStartRatio: 0.2,
			},
		];

		expect(
			resolveSessionOverviewHoverAtRatio(rows, [error], SERIES, config, 0.255),
		).toEqual({
			activityXRatio: 0.25,
			index: 1,
			kind: "activity",
			xRatio: 0.255,
		});
	});

	test("model calls win over coincident activity markers", () => {
		const config = resolveSessionThreadOverviewStripConfig({
			chartWidth: 1_000,
			plotPadding: 0,
		});
		const error = createEvent("error", "2026-08-18T10:00:00.000Z", {
			turnIndex: 1,
			xRatio: 0.1,
		});
		const rows = [
			{
				cost: undefined,
				index: 4,
				inputTokens: 300,
				xEndRatio: 1,
				xRatio: 0.1,
				xStartRatio: 0,
			},
			{
				cost: undefined,
				index: 1,
				inputTokens: undefined,
				xEndRatio: 0.2,
				xRatio: 0.1,
				xStartRatio: 0.05,
			},
		];

		const hover = resolveSessionOverviewHoverAtRatio(
			rows,
			[error],
			SERIES,
			config,
			0.1,
		);

		expect(hover?.kind).toBe("call");
		if (hover?.kind === "call") {
			expect(hover.hit.turnIndex).toBe(4);
			expect(hover.hit.callIndex).toBe(0);
			expect(hover.hit.call.inputTotal).toBe(100);
		}

		expect(
			resolveSessionOverviewHoverAtRatio(rows, [error], SERIES, config, 0.109)
				?.kind,
		).toBe("timeline");
	});

	test("keeps actions with the preceding model call until the next call begins", () => {
		const events = [
			createEvent("error", "2026-08-18T09:59:00.000Z"),
			createEvent("file-read", "2026-08-18T10:01:00.000Z"),
			createEvent("file-edit", "2026-08-18T10:09:00.000Z"),
			createEvent("skill", "2026-08-18T10:10:00.000Z"),
			createEvent("file-write", "2026-08-18T10:11:00.000Z"),
			createEvent("subagent", "2026-08-18T10:01:00.000Z", {
				turnIndex: 9,
			}),
		];

		expect(
			getSessionOverviewCallActivityCounts(events, SERIES, {
				callIndex: 0,
				kind: "call",
				turnIndex: 4,
			}),
		).toEqual({
			edits: 1,
			errors: 1,
			reads: 1,
			skills: 0,
			subagents: 0,
			writes: 0,
		});
		expect(
			getSessionOverviewCallActivityCounts(events, SERIES, {
				callIndex: 1,
				kind: "call",
				turnIndex: 4,
			}),
		).toEqual({
			edits: 0,
			errors: 0,
			reads: 0,
			skills: 1,
			subagents: 0,
			writes: 1,
		});
	});

	test("keeps actions visible when the turn has no model call", () => {
		const events = [
			createEvent("error", "2026-08-18T10:20:00.000Z", { turnIndex: 7 }),
			createEvent("file-read", "2026-08-18T10:21:00.000Z", {
				count: 3,
				turnIndex: 7,
			}),
			createEvent("file-write", "2026-08-18T10:22:00.000Z", {
				turnIndex: 8,
			}),
			createEvent("file-edit", "2026-08-18T10:23:00.000Z", {
				turnIndex: 7,
				xRatio: 0.7,
			}),
		];

		expect(
			getSessionOverviewCallActivityCounts(events, SERIES, {
				eventXRatio: 0.5,
				kind: "event",
				turnIndex: 7,
			}),
		).toEqual({
			edits: 0,
			errors: 1,
			reads: 3,
			skills: 0,
			subagents: 0,
			writes: 0,
		});
	});
});
