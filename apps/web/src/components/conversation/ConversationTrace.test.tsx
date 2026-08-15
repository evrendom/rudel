import { fireEvent, render, screen } from "@testing-library/react";
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

const toolAgentTurn: TraceItem = {
	kind: "agent",
	id: "tool-agent",
	timestamp: "2026-07-27T10:00:00Z",
	events: [
		{
			kind: "tool",
			id: "tool-1",
			timestamp: "2026-07-27T10:00:05Z",
			toolName: "Read",
			input: { file_path: "/tmp/example.ts" },
			result: { content: "contents", isError: false },
		},
	],
};

const structuralReasoningText = "A long reasoning body. ".repeat(12);
const structuralAgentTurn: TraceItem = {
	kind: "agent",
	id: "structural-agent",
	timestamp: "2026-07-27T10:00:00Z",
	events: [
		{
			kind: "reasoning",
			id: "reasoning-1",
			timestamp: "2026-07-27T10:00:05Z",
			text: structuralReasoningText,
		},
		{
			kind: "tool",
			id: "tool-2",
			timestamp: "2026-07-27T10:00:06Z",
			toolName: "Read",
			input: { file_path: "/tmp/child.ts" },
			result: { content: "child contents", isError: false },
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
	it("bookends the trace without relative gaps and keeps user rows collapsible", () => {
		const { container } = render(
			<ConversationTrace
				items={[
					userItem("u1", "2026-07-27T10:00:00Z"),
					userItem("u2", "2026-07-27T10:00:05Z"),
					userItem("u3", "2026-07-27T10:00:20Z"),
				]}
			/>,
		);

		expect(screen.queryByText("+5s")).not.toBeInTheDocument();
		expect(screen.queryByText("+15s")).not.toBeInTheDocument();
		expect(container.querySelectorAll("[data-trace-timestamp]")).toHaveLength(
			2,
		);
		expect(screen.getByText("text of u1").closest("button")).toHaveAttribute(
			"aria-expanded",
			"false",
		);
	});
});

describe("ConversationTrace sticky surfaces", () => {
	it("uses native sticky rows with opaque surfaces over scrolling rails", () => {
		const { container } = render(
			<ConversationTrace
				expandedSpeakerLayout="trace-tree"
				items={[buriedAgentTurn]}
			/>,
		);

		const stickyRows = Array.from(
			container.querySelectorAll<HTMLElement>("[data-trace-tree-sticky-top]"),
		);
		expect(stickyRows.length).toBeGreaterThan(0);
		for (const row of stickyRows) {
			expect(row).toHaveAttribute("data-trace-tree-sticky-surface", "true");
			expect(row.className).toContain("bg-(--session-overview-surface)");
			expect(row.className).not.toContain("transform:translateY");
			expect(
				row.style.getPropertyValue("--conversation-trace-stack-offset"),
			).toBe("");
		}
	});

	it("mounts an expanded leaf body below its fixed-height tree row", () => {
		render(
			<ConversationTrace
				expandedSpeakerLayout="trace-tree"
				items={[toolAgentTurn]}
			/>,
		);

		const trigger = screen.getByRole("button", { name: /Read/ });
		fireEvent.click(trigger);

		const treeRow = trigger.closest<HTMLElement>("[data-trace-tree-row-owner]");
		const treeItem = treeRow?.parentElement;
		const bodySlot = treeItem?.querySelector<HTMLElement>(
			":scope > [data-trace-tree-row-body]",
		);
		expect(trigger).toHaveAttribute("aria-expanded", "true");
		expect(trigger).not.toHaveAttribute("data-trace-tree-sticky-surface");
		expect(trigger.className).not.toContain(
			"top-(--conversation-trace-sticky-offset)",
		);
		expect(treeRow).toHaveAttribute("data-trace-tree-sticky-surface", "true");
		expect(treeRow).toHaveAttribute("data-trace-tree-sticky-top");
		expect(treeRow?.style.height).toBe("40px");
		expect(bodySlot).not.toBeNull();
		expect(treeRow?.nextElementSibling).toBe(bodySlot);
		expect(treeRow?.contains(bodySlot ?? null)).toBe(false);
	});

	it("keeps a structural reasoning node fixed while its body precedes its children", () => {
		render(
			<ConversationTrace
				expandedSpeakerLayout="trace-tree"
				items={[structuralAgentTurn]}
			/>,
		);

		const trigger = screen.getByRole("button", { name: /Reasoning/ });
		const treeRow = trigger.closest<HTMLElement>("[data-trace-tree-row-owner]");
		const stickyTopBefore = treeRow?.dataset.traceTreeStickyTop;
		fireEvent.click(trigger);

		const treeItem = treeRow?.parentElement;
		const bodySlot = treeItem?.querySelector<HTMLElement>(
			":scope > [data-trace-tree-row-body]",
		);
		const subtree = treeItem?.querySelector<HTMLOListElement>(":scope > ol");
		expect(trigger).toHaveAttribute("aria-expanded", "true");
		expect(treeRow?.dataset.traceTreeStickyTop).toBe(stickyTopBefore);
		expect(treeRow?.style.height).toBe("40px");
		expect(bodySlot?.textContent).toContain(structuralReasoningText);
		expect(bodySlot?.nextElementSibling).toBe(subtree);
		expect(treeRow?.contains(bodySlot ?? null)).toBe(false);
	});
});
