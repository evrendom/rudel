import { describe, expect, test } from "bun:test";
import { parseCodexConversations } from "./codex-conversation-parser";

function codexLine(type: string, payload: unknown, timestamp: string) {
	return JSON.stringify({ payload, timestamp, type });
}

const sessionMeta = codexLine(
	"session_meta",
	{ id: "session" },
	"2026-08-11T10:00:00.000Z",
);

describe("Codex tool calls", () => {
	test("function_call becomes a tool_use with parsed arguments and its output a tool_result", () => {
		const content = [
			sessionMeta,
			codexLine(
				"response_item",
				{
					arguments: '{"cmd":"cat skills/github/SKILL.md"}',
					call_id: "call-1",
					name: "exec_command",
					type: "function_call",
				},
				"2026-08-11T10:00:01.000Z",
			),
			codexLine(
				"response_item",
				{
					call_id: "call-1",
					output: "Process exited with code 0\nok",
					type: "function_call_output",
				},
				"2026-08-11T10:00:02.000Z",
			),
		].join("\n");

		const entries = parseCodexConversations(content);
		expect(entries).toHaveLength(2);
		expect(entries[0]).toMatchObject({
			type: "assistant",
			message: {
				content: [
					{
						id: "call-1",
						input: { cmd: "cat skills/github/SKILL.md" },
						name: "exec_command",
						type: "tool_use",
					},
				],
			},
		});
		expect(entries[1]).toMatchObject({
			type: "user",
			message: {
				content: [
					{
						content: "Process exited with code 0\nok",
						tool_use_id: "call-1",
						type: "tool_result",
					},
				],
			},
		});
	});

	test("custom_tool_call wraps its script input and joins block-array outputs", () => {
		const content = [
			sessionMeta,
			codexLine(
				"response_item",
				{
					call_id: "call-2",
					input: "tools.exec_command({cmd: 'ls'})",
					name: "exec",
					type: "custom_tool_call",
				},
				"2026-08-11T10:00:01.000Z",
			),
			codexLine(
				"response_item",
				{
					call_id: "call-2",
					output: '[{"type":"input_text","text":"Script completed"}]',
					type: "custom_tool_call_output",
				},
				"2026-08-11T10:00:02.000Z",
			),
		].join("\n");

		const entries = parseCodexConversations(content);
		expect(entries[0]).toMatchObject({
			message: {
				content: [
					{
						input: { input: "tools.exec_command({cmd: 'ls'})" },
						name: "exec",
						type: "tool_use",
					},
				],
			},
		});
		expect(entries[1]).toMatchObject({
			message: {
				content: [{ content: "Script completed", type: "tool_result" }],
			},
		});
	});

	test("failing outputs are marked as errors with the shared failure pattern", () => {
		const content = [
			sessionMeta,
			codexLine(
				"response_item",
				{
					call_id: "call-3",
					output: "Error: command not found",
					type: "function_call_output",
				},
				"2026-08-11T10:00:01.000Z",
			),
		].join("\n");

		const entries = parseCodexConversations(content);
		expect(entries[0]).toMatchObject({
			message: { content: [{ is_error: true, type: "tool_result" }] },
		});
	});

	test("tool_search_call maps to a tool_search tool_use", () => {
		const content = [
			sessionMeta,
			codexLine(
				"response_item",
				{
					arguments: { query: "linear issues" },
					call_id: "call-4",
					type: "tool_search_call",
				},
				"2026-08-11T10:00:01.000Z",
			),
		].join("\n");

		const entries = parseCodexConversations(content);
		expect(entries[0]).toMatchObject({
			message: {
				content: [{ input: { query: "linear issues" }, name: "tool_search" }],
			},
		});
	});
});

describe("Codex conversation interruptions", () => {
	test("keeps turn_aborted as model-side context", () => {
		const content = [
			JSON.stringify({
				payload: { id: "session" },
				timestamp: "2026-08-11T10:00:00.000Z",
				type: "session_meta",
			}),
			JSON.stringify({
				payload: { type: "turn_aborted" },
				timestamp: "2026-08-11T10:00:01.000Z",
				type: "event_msg",
			}),
		].join("\n");

		expect(parseCodexConversations(content)).toEqual([
			{
				message: { content: "Turn aborted" },
				sessionId: "session",
				timestamp: "2026-08-11T10:00:01.000Z",
				type: "system",
				uuid: "codex-0",
			},
		]);
	});
});
