import { describe, expect, test } from "bun:test";
import type { TraceEvent, TraceItem } from "./conversation-trace";
import type { AgentTraceRequestUsage } from "./conversation-trace-requests";
import { deriveConversationTraceSections } from "./conversation-trace-sections";

const firstEvents: TraceEvent[] = [
	{
		id: "reasoning-1",
		kind: "reasoning",
		text: "Plan",
		timestamp: "2026-08-16T08:30:01.000Z",
	},
	{
		id: "tool-1",
		input: { command: "bun test" },
		kind: "tool",
		result: { content: "ok", isError: false },
		timestamp: "2026-08-16T08:30:02.000Z",
		toolName: "Bash",
	},
	{
		content: "Done",
		id: "message-1",
		kind: "message",
		text: "Done",
		timestamp: "2026-08-16T08:30:03.000Z",
	},
];

const items: TraceItem[] = [
	{
		events: firstEvents,
		executionMode: "plan",
		id: "agent-1",
		kind: "agent",
		timestamp: "2026-08-16T08:30:01.000Z",
	},
	{
		id: "system-1",
		kind: "system",
		systemType: "system",
		text: "Compacted",
		timestamp: "2026-08-16T08:30:04.000Z",
	},
	{
		events: [
			{
				content: "Continued",
				id: "message-2",
				kind: "message",
				text: "Continued",
				timestamp: "2026-08-16T08:30:06.000Z",
			},
		],
		executionMode: "default",
		id: "agent-2",
		kind: "agent",
		timestamp: "2026-08-16T08:30:06.000Z",
	},
];

const usage: AgentTraceRequestUsage[] = [
	{
		at: "2026-08-16T08:30:00.000Z",
		cacheCreationInputTokens: 0,
		cacheReadInputTokens: 10,
		inputTokens: 20,
		model: "claude-fable-5",
		outputTokens: 5,
	},
	{
		at: "2026-08-16T08:30:05.000Z",
		cacheCreationInputTokens: 0,
		cacheReadInputTokens: 20,
		inputTokens: 30,
		model: "claude-fable-5",
		outputTokens: 7,
	},
];

describe("conversation trace section derivation", () => {
	test("preserves whole-response request grouping across interrupting rows", () => {
		const result = deriveConversationTraceSections({
			items,
			requestUsage: usage,
			requestUsagePlacement: "start",
			traceCallDisplayMode: "request",
		});

		expect(result.planMode).toBe(true);
		expect(result.events.map((event) => event.id)).toEqual([
			"reasoning-1",
			"tool-1",
			"message-1",
			"message-2",
		]);
		expect(result.sections.map((section) => section.kind)).toEqual([
			"agent",
			"item",
			"agent",
		]);
		const [first, system, second] = result.sections;
		expect(first).toMatchObject({
			groupIndex: 1,
			key: "request-1",
			kind: "agent",
			showHeader: true,
		});
		expect(system).toMatchObject({
			itemIndex: 1,
			key: "system-1",
			kind: "item",
		});
		expect(second).toMatchObject({
			groupIndex: 2,
			key: "request-2",
			kind: "agent",
			previousInputTotal: 30,
		});
	});

	test("normal display keeps a single headerless activity section per run", () => {
		const result = deriveConversationTraceSections({
			items,
			requestUsage: usage,
			traceCallDisplayMode: "normal",
		});
		const agentSections = result.sections.filter(
			(section) => section.kind === "agent",
		);

		expect(agentSections).toHaveLength(2);
		expect(
			agentSections.every(
				(section) => section.groupIndex === undefined && !section.showHeader,
			),
		).toBe(true);
	});
});
