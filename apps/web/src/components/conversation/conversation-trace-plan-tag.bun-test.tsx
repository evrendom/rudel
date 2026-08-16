import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ConversationTrace } from "./ConversationTrace";
import type { TraceItem } from "./conversation-trace";

function agentItem(executionMode: "plan" | "default"): TraceItem {
	return {
		events: [
			{
				content: "Response",
				id: "message",
				kind: "message",
				text: "Response",
				timestamp: "2026-08-11T10:00:01.000Z",
			},
		],
		executionMode,
		id: "agent",
		kind: "agent",
		timestamp: "2026-08-11T10:00:01.000Z",
	};
}

describe("ConversationTrace plan tag", () => {
	test("renders Plan only on plan-mode model rows", () => {
		const planMarkup = renderToStaticMarkup(
			<ConversationTrace
				agentLabel="Fable 5"
				expandedSpeakerLayout="trace-tree"
				items={[agentItem("plan")]}
			/>,
		);
		const defaultMarkup = renderToStaticMarkup(
			<ConversationTrace
				agentLabel="Fable 5"
				expandedSpeakerLayout="trace-tree"
				items={[agentItem("default")]}
			/>,
		);

		expect(planMarkup).toContain("data-trace-plan-tag");
		expect(planMarkup).toContain(">Plan</span>");
		expect(defaultMarkup).not.toContain("data-trace-plan-tag");
	});
});
