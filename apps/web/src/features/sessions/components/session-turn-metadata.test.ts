import assert from "node:assert";
import { describe, expect, test } from "vitest";
import type { TraceItem } from "@/components/conversation/conversation-trace";
import { extractSessionTurnMetrics } from "./session-turn-metadata";
import type { SessionTurn } from "./session-turns";

function userItem(id: string, timestamp: string): TraceItem {
	return { content: id, id, kind: "user", timestamp };
}

function turn(id: string, timestamp: string): SessionTurn {
	return { responseItems: [], userItems: [userItem(id, timestamp)] };
}

function line(value: unknown) {
	return JSON.stringify(value);
}

describe("extractSessionTurnMetrics", () => {
	test("attributes Claude usage, errors, and skills to each turn", () => {
		const turns = [
			turn("user-1", "2026-08-10T10:00:00.000Z"),
			turn("user-2", "2026-08-10T10:01:00.000Z"),
		];
		const content = [
			line({
				message: { content: "First prompt", role: "user" },
				timestamp: "2026-08-10T10:00:00.000Z",
				type: "user",
			}),
			line({
				message: {
					content: [
						{
							input: { skill: "testing-bun" },
							name: "Skill",
							type: "tool_use",
						},
						{
							id: "edit-1",
							input: { file_path: "src/a.ts" },
							name: "Edit",
							type: "tool_use",
						},
						{
							id: "write-1",
							input: { file_path: "src/a.ts" },
							name: "Write",
							type: "tool_use",
						},
						{
							id: "edit-failed",
							input: { file_path: "src/failed.ts" },
							name: "Edit",
							type: "tool_use",
						},
					],
					id: "assistant-1",
					model: "claude-sonnet-4-5",
					usage: {
						cache_creation_input_tokens: 5,
						cache_read_input_tokens: 10,
						input_tokens: 100,
						output_tokens: 20,
					},
				},
				timestamp: "2026-08-10T10:00:10.000Z",
				type: "assistant",
			}),
			line({
				message: {
					content: [
						{
							is_error: false,
							tool_use_id: "edit-1",
							type: "tool_result",
						},
						{
							is_error: false,
							tool_use_id: "write-1",
							type: "tool_result",
						},
						{
							is_error: true,
							tool_use_id: "edit-failed",
							type: "tool_result",
						},
					],
					role: "user",
				},
				timestamp: "2026-08-10T10:00:20.000Z",
				type: "user",
			}),
			line({
				message: { content: "Second prompt", role: "user" },
				timestamp: "2026-08-10T10:01:00.000Z",
				type: "user",
			}),
			line({
				message: {
					content: [],
					id: "assistant-2",
					model: "claude-sonnet-4-5",
					usage: { input_tokens: 200, output_tokens: 40 },
				},
				timestamp: "2026-08-10T10:01:10.000Z",
				type: "assistant",
			}),
		].join("\n");

		const metrics = extractSessionTurnMetrics(content, {
			fallbackModel: undefined,
			turns,
		});
		const first = metrics[0];
		const second = metrics[1];
		assert(first);
		assert(second);

		expect(first.inputTokens).toBe(115);
		expect(first.outputTokens).toBe(20);
		expect(first.errorCount).toBe(1);
		expect(first.errorEvents).toEqual([{ at: "2026-08-10T10:00:20.000Z" }]);
		expect(first.editedFiles).toEqual(["src/a.ts"]);
		expect(first.skills).toEqual(["testing-bun"]);
		expect(first.skillEvents).toEqual([
			{
				at: "2026-08-10T10:00:10.000Z",
				skill: "testing-bun",
			},
		]);
		expect(first.estimatedCost).toBeGreaterThan(0);
		expect(second.inputTokens).toBe(200);
		expect(second.outputTokens).toBe(40);
		expect(second.errorCount).toBe(0);
		expect(second.editedFiles).toEqual([]);
		expect(second.skills).toEqual([]);
	});

	test("uses Codex last-turn usage and tool metadata per turn", () => {
		const turns = [
			turn("user-1", "2026-08-10T10:00:00.000Z"),
			turn("user-2", "2026-08-10T10:01:00.000Z"),
		];
		const content = [
			line({
				payload: { id: "session-1", model_provider: "openai" },
				timestamp: "2026-08-10T09:59:00.000Z",
				type: "session_meta",
			}),
			line({
				payload: { model: "gpt-5.3-codex" },
				timestamp: "2026-08-10T10:00:01.000Z",
				type: "turn_context",
			}),
			line({
				payload: {
					arguments: line({
						cmd: "sed -n '1,40p' /tmp/skills/testing-bun/SKILL.md",
					}),
					name: "exec_command",
					type: "function_call",
				},
				timestamp: "2026-08-10T10:00:10.000Z",
				type: "response_item",
			}),
			line({
				payload: {
					arguments: line({
						patch: [
							"*** Begin Patch",
							"*** Update File: src/a.ts",
							"@@",
							"*** Add File: src/b.ts",
							"*** End Patch",
						].join("\n"),
					}),
					call_id: "patch-1",
					name: "apply_patch",
					type: "function_call",
				},
				timestamp: "2026-08-10T10:00:12.000Z",
				type: "response_item",
			}),
			line({
				payload: {
					call_id: "patch-1",
					output: "Done!",
					type: "function_call_output",
				},
				timestamp: "2026-08-10T10:00:13.000Z",
				type: "response_item",
			}),
			line({
				payload: {
					output: line({
						metadata: { exit_code: 1 },
						output: "type check failed",
					}),
					type: "function_call_output",
				},
				timestamp: "2026-08-10T10:00:20.000Z",
				type: "response_item",
			}),
			line({
				payload: {
					info: {
						last_token_usage: {
							cached_input_tokens: 400,
							input_tokens: 1_000,
							output_tokens: 100,
						},
						total_token_usage: {
							cached_input_tokens: 400,
							input_tokens: 1_000,
							output_tokens: 100,
						},
						model_context_window: 258_400,
					},
					type: "token_count",
				},
				timestamp: "2026-08-10T10:00:30.000Z",
				type: "event_msg",
			}),
			line({
				payload: { model: "gpt-5.3-codex" },
				timestamp: "2026-08-10T10:01:01.000Z",
				type: "turn_context",
			}),
			line({
				payload: {
					info: {
						last_token_usage: {
							cached_input_tokens: 600,
							input_tokens: 2_000,
							output_tokens: 200,
						},
						total_token_usage: {
							cached_input_tokens: 1_000,
							input_tokens: 3_000,
							output_tokens: 300,
						},
					},
					type: "token_count",
				},
				timestamp: "2026-08-10T10:01:30.000Z",
				type: "event_msg",
			}),
		].join("\n");

		const metrics = extractSessionTurnMetrics(content, {
			fallbackModel: undefined,
			turns,
		});
		const first = metrics[0];
		const second = metrics[1];
		assert(first);
		assert(second);

		expect(first.inputTokens).toBe(1_000);
		expect(first.outputTokens).toBe(100);
		expect(first.usageEvents[0]?.modelContextWindow).toBe(258_400);
		expect(first.errorCount).toBe(1);
		expect(first.errorEvents).toEqual([{ at: "2026-08-10T10:00:20.000Z" }]);
		expect(first.editedFiles).toEqual(["src/a.ts", "src/b.ts"]);
		expect(first.skills).toEqual(["testing-bun"]);
		expect(first.skillEvents).toEqual([
			{
				at: "2026-08-10T10:00:10.000Z",
				skill: "testing-bun",
			},
		]);
		expect(second.inputTokens).toBe(2_000);
		expect(second.outputTokens).toBe(200);
		expect(second.errorCount).toBe(0);
		expect(second.editedFiles).toEqual([]);
	});

	test("excludes failed Codex patches and counts a later success once", () => {
		const turns = [turn("user-1", "2026-08-10T10:00:00.000Z")];
		const patch = [
			"*** Begin Patch",
			"*** Update File: src/retried.ts",
			"@@",
			"*** End Patch",
		].join("\n");
		const content = [
			line({
				payload: { id: "session-1", model_provider: "openai" },
				timestamp: "2026-08-10T09:59:00.000Z",
				type: "session_meta",
			}),
			line({
				payload: {
					call_id: "patch-failed-only",
					input: patch.replace("src/retried.ts", "src/failed-only.ts"),
					name: "apply_patch",
					type: "custom_tool_call",
				},
				timestamp: "2026-08-10T10:00:10.000Z",
				type: "response_item",
			}),
			line({
				payload: {
					call_id: "patch-failed-only",
					output: "apply_patch verification failed: invalid hunk at line 4",
					type: "custom_tool_call_output",
				},
				timestamp: "2026-08-10T10:00:11.000Z",
				type: "response_item",
			}),
			line({
				payload: {
					call_id: "patch-retried-1",
					input: patch,
					name: "apply_patch",
					type: "custom_tool_call",
				},
				timestamp: "2026-08-10T10:00:12.000Z",
				type: "response_item",
			}),
			line({
				payload: {
					call_id: "patch-retried-1",
					output:
						"apply_patch verification failed: Failed to find expected lines",
					type: "custom_tool_call_output",
				},
				timestamp: "2026-08-10T10:00:13.000Z",
				type: "response_item",
			}),
			line({
				payload: {
					call_id: "patch-retried-2",
					input: patch,
					name: "apply_patch",
					type: "custom_tool_call",
				},
				timestamp: "2026-08-10T10:00:14.000Z",
				type: "response_item",
			}),
			line({
				payload: {
					call_id: "patch-retried-2",
					output: "Done!",
					type: "custom_tool_call_output",
				},
				timestamp: "2026-08-10T10:00:15.000Z",
				type: "response_item",
			}),
		].join("\n");

		const metrics = extractSessionTurnMetrics(content, {
			fallbackModel: undefined,
			turns,
		});
		const first = metrics[0];
		assert(first);

		expect(first.errorCount).toBe(2);
		expect(first.editedFiles).toEqual(["src/retried.ts"]);
	});

	test("attributes subagent edits and usage without adding its errors or skills", () => {
		const turns = [
			turn("user-1", "2026-08-10T10:00:00.000Z"),
			turn("user-2", "2026-08-10T10:01:00.000Z"),
		];
		const content = [
			line({
				message: { content: "First prompt", role: "user" },
				timestamp: "2026-08-10T10:00:00.000Z",
				type: "user",
			}),
			line({
				message: {
					content: [],
					id: "assistant-1",
					model: "claude-sonnet-4-5",
					usage: { input_tokens: 100, output_tokens: 20 },
				},
				timestamp: "2026-08-10T10:00:10.000Z",
				type: "assistant",
			}),
			line({
				isApiErrorMessage: true,
				message: { content: [], role: "user" },
				timestamp: "2026-08-10T10:00:20.000Z",
				type: "user",
			}),
			line({
				message: { content: "Second prompt", role: "user" },
				timestamp: "2026-08-10T10:01:00.000Z",
				type: "user",
			}),
		].join("\n");
		const subagentContent = [
			line({
				isApiErrorMessage: true,
				message: {
					content: [
						{
							id: "subagent-write-1",
							input: { file_path: "src/subagent-one.ts" },
							name: "Write",
							type: "tool_use",
						},
						{
							input: { skill: "subagent-skill" },
							name: "Skill",
							type: "tool_use",
						},
					],
					id: "subagent-assistant-1",
					model: "claude-sonnet-4-5",
					usage: { input_tokens: 900, output_tokens: 90 },
				},
				timestamp: "2026-08-10T10:00:30.000Z",
				type: "assistant",
			}),
			line({
				message: {
					content: [
						{
							is_error: false,
							tool_use_id: "subagent-write-1",
							type: "tool_result",
						},
					],
				},
				timestamp: "2026-08-10T10:00:40.000Z",
				type: "user",
			}),
			line({
				message: {
					content: [
						{
							id: "subagent-write-2",
							input: { file_path: "src/subagent-two.ts" },
							name: "Write",
							type: "tool_use",
						},
					],
				},
				timestamp: "2026-08-10T10:01:10.000Z",
				type: "assistant",
			}),
			line({
				message: {
					content: [
						{
							is_error: false,
							tool_use_id: "subagent-write-2",
							type: "tool_result",
						},
					],
				},
				timestamp: "2026-08-10T10:01:20.000Z",
				type: "user",
			}),
		].join("\n");
		const baseline = extractSessionTurnMetrics(content, {
			fallbackModel: undefined,
			turns,
		});
		const metrics = extractSessionTurnMetrics(content, {
			fallbackModel: undefined,
			subagents: { "agent-1": subagentContent },
			turns,
		});
		const baselineFirst = baseline[0];
		const first = metrics[0];
		const second = metrics[1];
		assert(baselineFirst);
		assert(first);
		assert(second);

		expect(first.editedFiles).toEqual(["src/subagent-one.ts"]);
		expect(second.editedFiles).toEqual(["src/subagent-two.ts"]);
		expect(first.inputTokens).toBe((baselineFirst.inputTokens ?? 0) + 900);
		expect(first.outputTokens).toBe((baselineFirst.outputTokens ?? 0) + 90);
		expect(first.estimatedCost).toBeGreaterThan(
			baselineFirst.estimatedCost ?? 0,
		);
		expect(first.errorCount).toBe(baselineFirst.errorCount);
		expect(first.skills).toEqual(baselineFirst.skills);
	});

	test("leaves unavailable token and cost values explicit", () => {
		const turns = [turn("user-1", "2026-08-10T10:00:00.000Z")];
		const metrics = extractSessionTurnMetrics(
			line({
				message: { content: "Prompt", role: "user" },
				timestamp: "2026-08-10T10:00:00.000Z",
				type: "user",
			}),
			{ fallbackModel: undefined, turns },
		);
		const first = metrics[0];
		assert(first);

		expect(first.inputTokens).toBeUndefined();
		expect(first.outputTokens).toBeUndefined();
		expect(first.estimatedCost).toBeUndefined();
		expect(first.errorCount).toBe(0);
		expect(first.editedFiles).toEqual([]);
		expect(first.skills).toEqual([]);
	});
});
