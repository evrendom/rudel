import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ConversationTrace } from "./ConversationTrace";
import type { TraceItem } from "./conversation-trace";

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
