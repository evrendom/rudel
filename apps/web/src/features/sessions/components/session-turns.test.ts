import { describe, expect, test } from "vitest";
import type { TraceItem } from "@/components/conversation/conversation-trace";
import { getSessionTurnPreview, groupTraceIntoTurns } from "./session-turns";

function userItem(id: string): TraceItem {
	return {
		content: id,
		id,
		kind: "user",
		timestamp: `2026-08-10T10:00:0${id.length}Z`,
	};
}

function agentItem(id: string, messages: string[] = []): TraceItem {
	return {
		events: messages.map((text, index) => ({
			content: text,
			id: `${id}-message-${index}`,
			kind: "message",
			text,
			timestamp: `2026-08-10T10:01:0${id.length}Z`,
		})),
		id,
		kind: "agent",
		timestamp: `2026-08-10T10:01:0${id.length}Z`,
	};
}

function systemItem(id: string): TraceItem {
	return {
		id,
		kind: "system",
		systemType: "system",
		text: id,
		timestamp: `2026-08-10T09:59:0${id.length}Z`,
	};
}

function summaryItem(id: string): TraceItem {
	return {
		id,
		kind: "summary",
		text: id,
		timestamp: undefined,
	};
}

describe("groupTraceIntoTurns", () => {
	test("groups normal user and response alternation", () => {
		const turns = groupTraceIntoTurns([
			userItem("user-1"),
			agentItem("agent-1"),
			userItem("user-2"),
			agentItem("agent-2"),
		]);

		expect(turns.map((turn) => turn.userItems.map((item) => item.id))).toEqual([
			["user-1"],
			["user-2"],
		]);
		expect(
			turns.map((turn) => turn.responseItems.map((item) => item.id)),
		).toEqual([["agent-1"], ["agent-2"]]);
	});

	test("merges consecutive user items into one turn", () => {
		const turns = groupTraceIntoTurns([
			userItem("user-1"),
			userItem("user-2"),
			agentItem("agent-1"),
		]);

		expect(turns).toHaveLength(1);
		expect(turns[0]?.userItems.map((item) => item.id)).toEqual([
			"user-1",
			"user-2",
		]);
		expect(turns[0]?.responseItems.map((item) => item.id)).toEqual(["agent-1"]);
	});

	test("creates a synthetic leading turn for preamble items", () => {
		const turns = groupTraceIntoTurns([
			systemItem("system-1"),
			summaryItem("summary-1"),
			userItem("user-1"),
			agentItem("agent-1"),
		]);

		expect(turns).toHaveLength(2);
		expect(turns[0]?.userItems).toEqual([]);
		expect(turns[0]?.responseItems.map((item) => item.id)).toEqual([
			"system-1",
			"summary-1",
		]);
		expect(turns[1]?.userItems.map((item) => item.id)).toEqual(["user-1"]);
	});

	test("keeps a trailing unanswered user turn", () => {
		const turns = groupTraceIntoTurns([
			userItem("user-1"),
			agentItem("agent-1"),
			userItem("user-2"),
		]);

		expect(turns).toHaveLength(2);
		expect(turns[1]?.userItems.map((item) => item.id)).toEqual(["user-2"]);
		expect(turns[1]?.responseItems).toEqual([]);
	});

	test("returns no turns for an empty trace", () => {
		expect(groupTraceIntoTurns([])).toEqual([]);
	});
});

describe("getSessionTurnPreview", () => {
	test("uses the final assistant message in the turn", () => {
		const [turn] = groupTraceIntoTurns([
			userItem("user-1"),
			agentItem("agent-1", ["First assistant message", "Final answer"]),
		]);

		expect(turn && getSessionTurnPreview(turn)).toBe("Final answer");
	});

	test("falls back when the turn has no assistant message", () => {
		const [turn] = groupTraceIntoTurns([userItem("user-1")]);

		expect(turn && getSessionTurnPreview(turn)).toBe("No assistant message");
	});
});
