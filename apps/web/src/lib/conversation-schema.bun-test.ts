import { describe, expect, test } from "bun:test";
import { parseConversations } from "./conversation-schema";

let transcriptEntryIndex = 0;

function transcriptEntry(value: Record<string, unknown>): string {
	transcriptEntryIndex += 1;
	return JSON.stringify({
		sessionId: "session",
		timestamp: "2026-08-11T10:00:00.000Z",
		uuid: `entry-${transcriptEntryIndex}`,
		...value,
	});
}

function assistantMessage(content: unknown[]) {
	return transcriptEntry({
		message: { content, role: "assistant" },
		type: "assistant",
	});
}

describe("Claude execution modes", () => {
	test("keeps a plan turn active despite standalone normal-mode snapshots", () => {
		const content = [
			transcriptEntry({
				message: { content: "Make a plan", role: "user" },
				permissionMode: "plan",
				type: "user",
			}),
			assistantMessage([{ text: "Planning", type: "text" }]),
			JSON.stringify({ mode: "normal", type: "mode" }),
			assistantMessage([{ thinking: "Still planning", type: "thinking" }]),
		].join("\n");

		expect(
			parseConversations(content)
				.filter((entry) => entry.type === "assistant")
				.map((entry) => entry.executionMode),
		).toEqual(["plan", "plan"]);
	});

	test("ends plan mode only after a successful ExitPlanMode result", () => {
		const exitToolId = "exit-plan";
		const content = [
			transcriptEntry({
				message: { content: "Make a plan", role: "user" },
				permissionMode: "plan",
				type: "user",
			}),
			assistantMessage([
				{ id: exitToolId, input: {}, name: "ExitPlanMode", type: "tool_use" },
			]),
			transcriptEntry({
				message: {
					content: [
						{
							content: "Plan approved",
							tool_use_id: exitToolId,
							type: "tool_result",
						},
					],
					role: "user",
				},
				type: "user",
			}),
			assistantMessage([{ text: "Implementing", type: "text" }]),
		].join("\n");

		expect(
			parseConversations(content)
				.filter((entry) => entry.type === "assistant")
				.map((entry) => entry.executionMode),
		).toEqual(["plan", "default"]);
	});
});
