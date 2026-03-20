import { describe, expect, test } from "bun:test";
import { claudeCodeAdapter, codexAdapter } from "@rudel/agent-adapters";

describe("timestamp extraction helpers", () => {
	test("Claude extracts the min/max timestamp from user and assistant lines only", () => {
		const content = [
			"not-json",
			JSON.stringify({
				type: "summary",
				timestamp: "2026-03-13T08:59:00.000Z",
			}),
			JSON.stringify({
				type: "user",
				timestamp: "2026-03-13T09:00:00.000Z",
				message: { content: "hello" },
			}),
			JSON.stringify({
				type: "assistant",
				timestamp: "2026-03-13T09:05:00.000Z",
				message: { model: "claude-3-7-sonnet" },
			}),
		].join("\n");

		expect(claudeCodeAdapter.extractTimestamps(content)).toEqual({
			sessionDate: "2026-03-13T09:00:00.000Z",
			lastInteractionDate: "2026-03-13T09:05:00.000Z",
		});
	});

	test("Claude returns null when user/assistant lines are missing timestamps", () => {
		const content = [
			JSON.stringify({ type: "user", message: { content: "hello" } }),
			JSON.stringify({
				type: "assistant",
				message: { model: "claude-3-7-sonnet" },
			}),
		].join("\n");

		expect(claudeCodeAdapter.extractTimestamps(content)).toBeNull();
	});

	test("Codex returns null when no JSONL line has a timestamp", () => {
		const content = [
			JSON.stringify({
				type: "session_meta",
				payload: { id: "sess-1", cwd: "/tmp/project" },
			}),
			JSON.stringify({ type: "response_item", payload: { id: "resp-1" } }),
		].join("\n");

		expect(codexAdapter.extractTimestamps(content)).toBeNull();
	});

	test("Codex extracts the min/max timestamp across timestamped lines", () => {
		const content = [
			JSON.stringify({
				type: "session_meta",
				timestamp: "2026-03-13T09:00:00.000Z",
				payload: { id: "sess-1", cwd: "/tmp/project" },
			}),
			JSON.stringify({
				type: "response_item",
				timestamp: "2026-03-13T09:02:00.000Z",
				payload: { id: "resp-1" },
			}),
			JSON.stringify({
				type: "event_msg",
				timestamp: "2026-03-13T09:04:00.000Z",
				payload: { text: "done" },
			}),
		].join("\n");

		expect(codexAdapter.extractTimestamps(content)).toEqual({
			sessionDate: "2026-03-13T09:00:00.000Z",
			lastInteractionDate: "2026-03-13T09:04:00.000Z",
		});
	});
});
