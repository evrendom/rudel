import { describe, expect, test } from "bun:test";
import type { Conversation } from "@/lib/conversation-schema";
import { buildConversationTrace, type TraceEvent } from "./conversation-trace";
import { buildAgentTraceTreeBranches } from "./conversation-trace-tree-branches";

function userEntry(
	id: string,
	content: Extract<Conversation, { type: "user" }>["message"]["content"],
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

function assistantEntry(
	id: string,
	content: Extract<Conversation, { type: "assistant" }>["message"]["content"],
): Extract<Conversation, { type: "assistant" }> {
	return {
		executionMode: "default",
		message: { content, role: "assistant" },
		sessionId: "session",
		timestamp: `2026-08-11T10:00:${id.padStart(2, "0")}.000Z`,
		type: "assistant",
		uuid: id,
	};
}

function systemEntry(
	id: string,
	content: string,
): Extract<Conversation, { type: "system" }> {
	return {
		message: { content },
		sessionId: "session",
		timestamp: `2026-08-11T10:00:${id.padStart(2, "0")}.000Z`,
		type: "system",
		uuid: id,
	};
}

describe("Claude skill payloads", () => {
	test("attaches Claude's user text-block payload to its Skill call", () => {
		const trace = buildConversationTrace([
			assistantEntry("1", [
				{
					id: "skill-1",
					input: {
						args: "model pricing rate card verification",
						skill: "claude-api",
					},
					name: "Skill",
					type: "tool_use",
				},
			]),
			userEntry("2", [
				{
					content: "Launching skill: claude-api",
					tool_use_id: "skill-1",
					type: "tool_result",
				},
			]),
			userEntry("3", [
				{
					text: [
						"Base directory for this skill: /private/tmp/bundled-skills/claude-api",
						"",
						"# Building with the Claude API",
						"",
						"Use the official SDK.",
					].join("\n"),
					type: "text",
				},
			]),
		]);

		expect(trace.map((item) => item.kind)).toEqual(["agent"]);
		const agent = trace[0];
		if (agent?.kind !== "agent") {
			throw new Error("expected agent section");
		}
		const event = agent.events[0];
		if (event?.kind !== "tool") {
			throw new Error("expected skill tool event");
		}

		expect(event.skillContent).toEqual({
			baseDirectory: "/private/tmp/bundled-skills/claude-api",
			content: "# Building with the Claude API\n\nUse the official SDK.",
		});
	});

	test("still attaches the system-string skill payload shape", () => {
		const trace = buildConversationTrace([
			assistantEntry("1", [
				{
					id: "skill-1",
					input: { skill: "claude-api" },
					name: "Skill",
					type: "tool_use",
				},
			]),
			systemEntry(
				"2",
				[
					"Base directory for this skill: /private/tmp/bundled-skills/claude-api",
					"",
					"# Building with the Claude API",
					"",
					"Use the official SDK.",
				].join("\n"),
			),
		]);

		expect(trace.map((item) => item.kind)).toEqual(["agent"]);
		const agent = trace[0];
		if (agent?.kind !== "agent") {
			throw new Error("expected agent section");
		}
		const event = agent.events[0];
		if (event?.kind !== "tool") {
			throw new Error("expected skill tool event");
		}

		expect(event.skillContent).toEqual({
			baseDirectory: "/private/tmp/bundled-skills/claude-api",
			content: "# Building with the Claude API\n\nUse the official SDK.",
		});
	});

	test("keeps an ordinary user text-block message after a Skill call", () => {
		const trace = buildConversationTrace([
			assistantEntry("1", [
				{
					id: "skill-1",
					input: { skill: "claude-api" },
					name: "Skill",
					type: "tool_use",
				},
			]),
			userEntry("2", [
				{
					content: "Launching skill: claude-api",
					tool_use_id: "skill-1",
					type: "tool_result",
				},
			]),
			userEntry("3", [
				{ text: "Please use a different skill instead.", type: "text" },
			]),
		]);

		expect(trace.map((item) => item.kind)).toEqual(["agent", "user"]);
	});

	test("keeps an ordinary system message separate from a Skill call", () => {
		const trace = buildConversationTrace([
			assistantEntry("1", [
				{
					id: "skill-1",
					input: { skill: "claude-api" },
					name: "Skill",
					type: "tool_use",
				},
			]),
			systemEntry("2", "Authentication is required."),
		]);

		expect(trace.map((item) => item.kind)).toEqual(["agent", "system"]);
	});
});

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

describe("conversation trace execution mode", () => {
	test("preserves plan mode on the model row", () => {
		const trace = buildConversationTrace([
			{
				executionMode: "plan",
				message: {
					content: [{ text: "A plan", type: "text" }],
					role: "assistant",
				},
				sessionId: "session",
				timestamp: "2026-08-11T10:00:01.000Z",
				type: "assistant",
				uuid: "assistant-1",
			},
		]);

		expect(trace).toMatchObject([
			{ executionMode: "plan", id: "assistant-1", kind: "agent" },
		]);
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
