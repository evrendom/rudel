import { describe, expect, test } from "bun:test";
import type { Conversation } from "@/lib/conversation-schema";
import { buildConversationTrace, type TraceEvent } from "./conversation-trace";
import { buildAgentTraceTreeBranches } from "./conversation-trace-tree";

function userEntry(
	id: string,
	content: string,
	isMeta?: boolean,
): Extract<Conversation, { type: "user" }> {
	return {
		isMeta,
		message: { content, role: "user" },
		sessionId: "session",
		timestamp: `2026-08-11T10:00:${id.padStart(2, "0")}.000Z`,
		type: "user",
		uuid: id,
	};
}

describe("conversation trace member boundaries", () => {
	test("keeps actual member messages as user rows", () => {
		const trace = buildConversationTrace([
			userEntry("1", "Please update the page"),
		]);

		expect(trace.map((item) => item.kind)).toEqual(["user"]);
	});

	test("classifies injected context without creating a member row", () => {
		const trace = buildConversationTrace([
			userEntry("1", "Skill instructions", true),
			userEntry(
				"2",
				"<task-notification>Background task finished</task-notification>",
			),
		]);

		expect(
			trace.map((item) =>
				item.kind === "system" ? item.systemType : item.kind,
			),
		).toEqual(["context", "notification"]);
	});

	test("preserves an explicit interruption as model-side context", () => {
		const trace = buildConversationTrace([
			userEntry("1", "[Request interrupted by user]"),
		]);

		expect(
			trace.map((item) =>
				item.kind === "system" ? item.systemType : item.kind,
			),
		).toEqual(["interruption"]);
	});
});

describe("conversation trace tree hierarchy", () => {
	test("nests tool activity under the reasoning or message that precedes it", () => {
		const events: TraceEvent[] = [
			{
				id: "reasoning",
				kind: "reasoning",
				text: "Plan the change",
				timestamp: "2026-08-11T10:00:01.000Z",
			},
			{
				id: "tool",
				input: { path: "src/app.ts" },
				kind: "tool",
				result: undefined,
				timestamp: "2026-08-11T10:00:02.000Z",
				toolName: "Read",
			},
			{
				content: "Done",
				id: "message",
				kind: "message",
				text: "Done",
				timestamp: "2026-08-11T10:00:03.000Z",
			},
		];

		const branches = buildAgentTraceTreeBranches(events);

		expect(branches.map((branch) => branch.root?.kind)).toEqual([
			"reasoning",
			"message",
		]);
		expect(branches[0]?.children.map((event) => event.kind)).toEqual(["tool"]);
		expect(branches[1]?.children).toEqual([]);
	});
});
