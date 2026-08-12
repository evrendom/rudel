import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ConversationTrace } from "./ConversationTrace";
import type { TraceItem } from "./conversation-trace";
import type { AgentTraceRequestUsage } from "./conversation-trace-requests";

const buriedAgentTurn: TraceItem = {
	kind: "agent",
	id: "a1",
	timestamp: "2026-07-27T10:00:00Z",
	events: [
		{
			kind: "message",
			id: "a1-0",
			timestamp: "2026-07-27T10:00:05Z",
			content: "the buried reply",
			text: "the buried reply",
		},
	],
};

const requestUsage: AgentTraceRequestUsage[] = [
	{
		at: "2026-07-27T10:00:00Z",
		cacheCreationInputTokens: 0,
		cacheReadInputTokens: 0,
		inputTokens: 24_000,
		model: "claude-sonnet-4-5",
		outputTokens: 120,
	},
];

function userItem(id: string, timestamp: string): TraceItem {
	return { kind: "user", id, timestamp, content: `text of ${id}` };
}

describe("ConversationTrace jump-to-row", () => {
	it("opens the collapsed agent turn hiding the targeted row", () => {
		const { rerender } = render(
			<ConversationTrace items={[buriedAgentTurn]} />,
		);

		expect(screen.queryByText("the buried reply")).not.toBeInTheDocument();

		rerender(
			<ConversationTrace
				items={[buriedAgentTurn]}
				focus={{ anchorId: "message-0", requestId: 1 }}
			/>,
		);

		expect(screen.getByText("the buried reply")).toBeInTheDocument();
	});

	it("leaves rows the jump does not target alone", () => {
		render(
			<ConversationTrace
				items={[buriedAgentTurn]}
				focus={{ anchorId: "message-7", requestId: 1 }}
			/>,
		);

		expect(screen.queryByText("the buried reply")).not.toBeInTheDocument();
	});
});

describe("ConversationTrace timestamps", () => {
	it("bookends the trace with wall-clock times and shows gaps between", () => {
		render(
			<ConversationTrace
				items={[
					userItem("u1", "2026-07-27T10:00:00Z"),
					userItem("u2", "2026-07-27T10:00:05Z"),
					userItem("u3", "2026-07-27T10:00:20Z"),
				]}
			/>,
		);

		// Only the interior row reads as a delta; the first and last show a clock
		// time, whose exact rendering is locale-dependent.
		expect(screen.getByText("+5s")).toBeInTheDocument();
		expect(screen.queryByText("+15s")).not.toBeInTheDocument();
	});
});

describe("ConversationTrace flat request grouping", () => {
	it("switches V7's shared fill to V8's thicker colored connector", () => {
		const { container, rerender } = render(
			<ConversationTrace
				expandedSpeakerLayout="trace-tree"
				items={[buriedAgentTurn]}
				requestUsage={requestUsage}
				requestUsagePlacement="start"
				traceCallVariant="v7"
			/>,
		);

		const fillGroup = container.querySelector<HTMLElement>(
			'[data-trace-call-treatment="fill"]',
		);
		expect(fillGroup).not.toBeNull();
		expect(
			fillGroup?.style.getPropertyValue("--conversation-trace-row-surface"),
		).toContain("color-mix");
		expect(screen.getByText("ctx 24k")).toBeInTheDocument();

		rerender(
			<ConversationTrace
				expandedSpeakerLayout="trace-tree"
				items={[buriedAgentTurn]}
				requestUsage={requestUsage}
				requestUsagePlacement="start"
				traceCallVariant="v8"
			/>,
		);

		const connectorGroup = container.querySelector<HTMLElement>(
			'[data-trace-call-treatment="connector"]',
		);
		expect(connectorGroup).not.toBeNull();
		expect(
			connectorGroup?.style.getPropertyValue(
				"--conversation-trace-connector-width",
			),
		).toBe("2.25");
		expect(
			connectorGroup?.style.getPropertyValue(
				"--conversation-trace-connector-color",
			),
		).toBe("oklch(61% 0.19 255)");
		expect(
			connectorGroup?.querySelector(
				'svg[data-trace-tree-connector="through"][height="24"]',
			),
		).not.toBeNull();
	});
});
