import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ConversationTraceEventRow } from "./conversation-trace-event-row";

describe("delegation model icons", () => {
	it("uses the Claude model glyph for Fable delegations", () => {
		const markup = renderToStaticMarkup(
			<ConversationTraceEventRow
				event={{
					id: "agent-fable",
					input: {
						description: "Investigate the trace",
						model: "fable",
						subagent_type: "general-purpose",
					},
					kind: "tool",
					result: undefined,
					timestamp: "2026-08-14T12:00:00.000Z",
					toolName: "Agent",
				}}
			/>,
		);

		expect(markup).toContain('data-trace-icon-tone="claude"');
		expect(markup).toContain('data-trace-tag-context="delegated-model"');
		expect(markup.match(/viewBox="0 0 1200 1200"/g)).toHaveLength(2);
	});

	it("uses the Claude model glyph for Mythos delegations", () => {
		const markup = renderToStaticMarkup(
			<ConversationTraceEventRow
				event={{
					id: "agent-mythos",
					input: { description: "Review the parser", model: "mythos" },
					kind: "tool",
					result: undefined,
					timestamp: "2026-08-14T12:00:00.000Z",
					toolName: "Agent",
				}}
			/>,
		);

		expect(markup).toContain('data-trace-icon-tone="claude"');
		expect(markup).toContain('data-trace-tag-context="delegated-model"');
	});

	it("inherits the OpenAI glyph for spawn_agent without a model override", () => {
		const markup = renderToStaticMarkup(
			<ConversationTraceEventRow
				agentModel="gpt-5.6-terra"
				event={{
					id: "agent-openai",
					input: { message: "Review the parser", task_name: "reviewer" },
					kind: "tool",
					result: undefined,
					timestamp: "2026-08-14T12:00:00.000Z",
					toolName: "collaboration.spawn_agent",
				}}
			/>,
		);

		expect(markup).toContain('data-trace-icon-tone="openai"');
		expect(markup).toContain("reviewer");
	});
});
