import { describe, expect, it } from "vitest";
import type { Conversation } from "@/lib/conversation-schema";
import {
	buildConversationTrace,
	formatTimeDelta,
	type TraceEvent,
} from "./conversation-trace";

function userEntry(
	uuid: string,
	timestamp: string,
	content: Extract<Conversation, { type: "user" }>["message"]["content"],
): Conversation {
	return {
		type: "user",
		uuid,
		timestamp,
		sessionId: "s",
		message: { role: "user", content },
	};
}

function assistantEntry(
	uuid: string,
	timestamp: string,
	content: Extract<Conversation, { type: "assistant" }>["message"]["content"],
): Conversation {
	return {
		executionMode: "unknown",
		type: "assistant",
		uuid,
		timestamp,
		sessionId: "s",
		message: { role: "assistant", content },
	};
}

function toolUse(id: string, name: string, input: Record<string, unknown>) {
	return { type: "tool_use" as const, id, name, input };
}

function toolResult(toolUseId: string, content: string, isError = false) {
	return {
		type: "tool_result" as const,
		tool_use_id: toolUseId,
		content,
		...(isError ? { is_error: true } : {}),
	};
}

function eventKinds(events: TraceEvent[]): string[] {
	return events.map((event) => event.kind);
}

describe("buildConversationTrace", () => {
	it("groups consecutive assistant entries into one agent section", () => {
		const trace = buildConversationTrace([
			userEntry("u1", "2026-07-27T10:00:00Z", "do the thing"),
			assistantEntry("a1", "2026-07-27T10:00:05Z", [
				{ type: "thinking", thinking: "considering" },
			]),
			assistantEntry("a2", "2026-07-27T10:00:07Z", [
				{ type: "text", text: "done" },
			]),
			userEntry("u2", "2026-07-27T10:01:00Z", "thanks"),
		]);

		expect(trace.map((item) => item.kind)).toEqual(["user", "agent", "user"]);
		const agent = trace[1];
		if (agent?.kind !== "agent") throw new Error("expected agent section");
		expect(eventKinds(agent.events)).toEqual(["reasoning", "message"]);
	});

	it("pairs a tool result onto its call instead of showing a user turn", () => {
		const trace = buildConversationTrace([
			assistantEntry("a1", "2026-07-27T10:00:00Z", [
				toolUse("call-1", "Read", { file_path: "/repo/app.ts" }),
			]),
			userEntry("u1", "2026-07-27T10:00:02Z", [
				toolResult("call-1", "file contents"),
			]),
		]);

		// The tool-result carrier must not become a user row.
		expect(trace.map((item) => item.kind)).toEqual(["agent"]);
		const agent = trace[0];
		if (agent?.kind !== "agent") throw new Error("expected agent section");
		expect(agent.events).toHaveLength(1);

		const event = agent.events[0];
		if (event?.kind !== "tool") throw new Error("expected tool event");
		expect(event.toolName).toBe("Read");
		expect(event.result?.isError).toBe(false);
		expect(event.result?.content).toBe("file contents");
	});

	it("marks error results so the row can be tinted", () => {
		const trace = buildConversationTrace([
			assistantEntry("a1", "2026-07-27T10:00:00Z", [
				toolUse("call-1", "Bash", { command: "exit 1" }),
			]),
			userEntry("u1", "2026-07-27T10:00:02Z", [
				toolResult("call-1", "boom", true),
			]),
		]);

		const agent = trace[0];
		if (agent?.kind !== "agent") throw new Error("expected agent section");
		const event = agent.events[0];
		if (event?.kind !== "tool") throw new Error("expected tool event");
		expect(event.result?.isError).toBe(true);
	});

	it("pairs by tool_use_id rather than arrival order", () => {
		const trace = buildConversationTrace([
			assistantEntry("a1", "2026-07-27T10:00:00Z", [
				toolUse("call-1", "Read", { file_path: "/a.ts" }),
				toolUse("call-2", "Read", { file_path: "/b.ts" }),
			]),
			userEntry("u1", "2026-07-27T10:00:02Z", [
				toolResult("call-2", "b contents"),
				toolResult("call-1", "a contents"),
			]),
		]);

		const agent = trace[0];
		if (agent?.kind !== "agent") throw new Error("expected agent section");
		const [first, second] = agent.events;
		if (first?.kind !== "tool" || second?.kind !== "tool") {
			throw new Error("expected two tool events");
		}
		expect(first.result?.content).toBe("a contents");
		expect(second.result?.content).toBe("b contents");
	});

	it("surfaces a result with no matching call rather than dropping it", () => {
		const trace = buildConversationTrace([
			assistantEntry("a1", "2026-07-27T10:00:00Z", [
				{ type: "text", text: "hi" },
			]),
			userEntry("u1", "2026-07-27T10:00:02Z", [
				toolResult("missing-call", "orphaned output"),
			]),
		]);

		const agent = trace[0];
		if (agent?.kind !== "agent") throw new Error("expected agent section");
		expect(eventKinds(agent.events)).toEqual(["message", "orphan-result"]);
	});

	it("keeps a user message that also carries text as a user turn", () => {
		const trace = buildConversationTrace([
			assistantEntry("a1", "2026-07-27T10:00:00Z", [
				toolUse("call-1", "Read", { file_path: "/a.ts" }),
			]),
			userEntry("u1", "2026-07-27T10:00:02Z", [
				toolResult("call-1", "contents"),
				{ type: "text", text: "and also, stop" },
			]),
		]);

		// Mixed content means a human typed something, so it is a real turn.
		expect(trace.map((item) => item.kind)).toEqual(["agent", "user"]);
	});

	it("splits agent sections around each real user turn", () => {
		const trace = buildConversationTrace([
			assistantEntry("a1", "2026-07-27T10:00:00Z", [
				{ type: "text", text: "one" },
			]),
			userEntry("u1", "2026-07-27T10:00:10Z", "next"),
			assistantEntry("a2", "2026-07-27T10:00:20Z", [
				{ type: "text", text: "two" },
			]),
		]);

		expect(trace.map((item) => item.kind)).toEqual(["agent", "user", "agent"]);
	});

	it("breaks an agent section on summary and system entries", () => {
		const trace = buildConversationTrace([
			assistantEntry("a1", "2026-07-27T10:00:00Z", [
				{ type: "text", text: "one" },
			]),
			{ type: "summary", summary: "recap" },
			assistantEntry("a2", "2026-07-27T10:00:20Z", [
				{ type: "text", text: "two" },
			]),
			{
				type: "system",
				uuid: "sys1",
				timestamp: "2026-07-27T10:00:30Z",
				sessionId: "s",
				message: { content: "notice" },
			},
		]);

		expect(trace.map((item) => item.kind)).toEqual([
			"agent",
			"summary",
			"agent",
			"system",
		]);
	});

	it("returns nothing for an empty transcript", () => {
		expect(buildConversationTrace([])).toEqual([]);
	});
});

describe("formatTimeDelta", () => {
	it("formats sub-minute, minute and hour gaps", () => {
		expect(
			formatTimeDelta("2026-07-27T10:00:00Z", "2026-07-27T10:00:03Z"),
		).toBe("+3s");
		expect(
			formatTimeDelta("2026-07-27T10:00:00Z", "2026-07-27T10:05:16Z"),
		).toBe("+5m 16s");
		expect(
			formatTimeDelta("2026-07-27T10:00:00Z", "2026-07-27T10:05:00Z"),
		).toBe("+5m");
		expect(
			formatTimeDelta("2026-07-27T10:00:00Z", "2026-07-27T12:30:00Z"),
		).toBe("+2h 30m");
	});

	it("rounds a partial second up rather than down to nothing", () => {
		expect(
			formatTimeDelta("2026-07-27T10:00:00.000Z", "2026-07-27T10:00:00.400Z"),
		).toBe("+1s");
	});

	it("switches to days once hours stop being readable", () => {
		expect(
			formatTimeDelta("2026-07-27T10:00:00Z", "2026-07-31T13:00:00Z"),
		).toBe("+4d 3h");
		expect(
			formatTimeDelta("2026-07-27T10:00:00Z", "2026-07-31T10:00:00Z"),
		).toBe("+4d");
	});

	it("suppresses a zero gap, which only means one message's blocks", () => {
		expect(
			formatTimeDelta("2026-07-27T10:00:00Z", "2026-07-27T10:00:00Z"),
		).toBe(undefined);
	});

	it("returns undefined rather than a negative or bogus delta", () => {
		expect(
			formatTimeDelta("2026-07-27T10:00:05Z", "2026-07-27T10:00:00Z"),
		).toBe(undefined);
		expect(formatTimeDelta("nonsense", "2026-07-27T10:00:00Z")).toBe(undefined);
		expect(formatTimeDelta(undefined, "2026-07-27T10:00:00Z")).toBe(undefined);
	});
});
