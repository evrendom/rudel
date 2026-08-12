import { describe, expect, test } from "bun:test";
import type {
	TraceEvent,
	TraceItem,
} from "@/components/conversation/conversation-trace";
import { getSessionTurnTiming, type SessionTurn } from "./session-turns";

function userItem(timestamp: string): TraceItem {
	return {
		content: "Prompt",
		id: "user",
		kind: "user",
		timestamp,
	};
}

function messageEvent(id: string, timestamp: string): TraceEvent {
	return {
		content: id,
		id,
		kind: "message",
		text: id,
		timestamp,
	};
}

function toolEvent(timestamp: string): TraceEvent {
	return {
		id: "tool",
		input: {},
		kind: "tool",
		result: undefined,
		timestamp,
		toolName: "Read",
	};
}

function turn(
	startTimestamp: string,
	responseEvents: TraceEvent[],
): SessionTurn {
	return {
		responseItems: [
			{
				events: responseEvents,
				id: "agent",
				kind: "agent",
				timestamp: responseEvents[0]?.timestamp ?? startTimestamp,
			},
		],
		userItems: [userItem(startTimestamp)],
	};
}

describe("getSessionTurnTiming", () => {
	test("ends at the final assistant message rather than a later tool event", () => {
		const timing = getSessionTurnTiming(
			turn("2026-08-10T10:00:00.000Z", [
				messageEvent("first", "2026-08-10T10:00:10.000Z"),
				messageEvent("final", "2026-08-10T10:00:20.000Z"),
				toolEvent("2026-08-10T10:00:40.000Z"),
			]),
		);

		expect(timing.startTimestamp).toBe("2026-08-10T10:00:00.000Z");
		expect(timing.endTimestamp).toBe("2026-08-10T10:00:20.000Z");
		expect(timing.durationSeconds).toBe(20);
		expect(timing.durationLabel).toBe("20 sec");
	});

	test("uses minute and hour units as turns get longer", () => {
		expect(
			getSessionTurnTiming(
				turn("2026-08-10T10:00:00.000Z", [
					messageEvent("final", "2026-08-10T10:02:05.000Z"),
				]),
			).durationLabel,
		).toBe("2 min");
		expect(
			getSessionTurnTiming(
				turn("2026-08-10T10:00:00.000Z", [
					messageEvent("final", "2026-08-10T11:30:00.000Z"),
				]),
			).durationLabel,
		).toBe("1.5 hr");
	});

	test("leaves unanswered turns without an end time or duration", () => {
		const timing = getSessionTurnTiming({
			responseItems: [],
			userItems: [userItem("2026-08-10T10:00:00.000Z")],
		});

		expect(timing.startTimestamp).toBe("2026-08-10T10:00:00.000Z");
		expect(timing.endTimestamp).toBeUndefined();
		expect(timing.durationSeconds).toBeUndefined();
		expect(timing.durationLabel).toBeUndefined();
	});
});
