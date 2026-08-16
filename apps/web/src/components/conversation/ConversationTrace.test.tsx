import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ConversationTrace } from "./ConversationTrace";
import type { TraceEvent, TraceItem } from "./conversation-trace";

const buriedAgentTurn: TraceItem = {
	executionMode: "unknown",
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
	executionMode: "unknown",
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

const structuralReasoningText = [
	"First reasoning line.",
	"Second reasoning line.",
	"Third reasoning line.",
	"Fourth reasoning line.",
].join("\n");
const structuralAgentTurn: TraceItem = {
	executionMode: "unknown",
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

const structuralMessageTurn: TraceItem = {
	executionMode: "unknown",
	kind: "agent",
	id: "structural-message-agent",
	timestamp: "2026-07-27T10:00:00Z",
	events: [
		{
			kind: "message",
			id: "message-1",
			timestamp: "2026-07-27T10:00:05Z",
			content: ["First message line.", "Second.", "Third.", "Fourth."].join(
				"\n",
			),
			text: ["First message line.", "Second.", "Third.", "Fourth."].join("\n"),
		},
		{
			kind: "tool",
			id: "message-tool-1",
			timestamp: "2026-07-27T10:00:06Z",
			toolName: "Read",
			input: { file_path: "/tmp/message-child.ts" },
			result: { content: "message child contents", isError: false },
		},
	],
};

const orderedAgentTurn: TraceItem = {
	executionMode: "unknown",
	kind: "agent",
	id: "ordered-agent",
	timestamp: "2026-07-27T10:00:00Z",
	events: [
		{
			kind: "reasoning",
			id: "ordered-reasoning",
			timestamp: "2026-07-27T10:00:01Z",
			text: "Plan the work",
		},
		{
			kind: "reasoning",
			id: "ordered-reasoning-follow-up",
			timestamp: "2026-07-27T10:00:01.500Z",
			text: "Refine the plan",
		},
		{
			kind: "tool",
			id: "ordered-read-1",
			timestamp: "2026-07-27T10:00:02Z",
			toolName: "Read",
			input: { file_path: "/tmp/first.ts" },
			result: { content: "first", isError: false },
		},
		{
			kind: "tool",
			id: "ordered-read-2",
			timestamp: "2026-07-27T10:00:03Z",
			toolName: "Read",
			input: { file_path: "/tmp/second.ts" },
			result: { content: "second", isError: false },
		},
		{
			kind: "tool",
			id: "ordered-bash-1",
			timestamp: "2026-07-27T10:00:03.250Z",
			toolName: "Bash",
			input: { command: "pwd" },
			result: { content: "/tmp", isError: false },
		},
		{
			kind: "tool",
			id: "ordered-bash-2",
			timestamp: "2026-07-27T10:00:03.500Z",
			toolName: "Bash",
			input: { command: "ls" },
			result: { content: "example.ts", isError: false },
		},
		{
			kind: "message",
			id: "ordered-message",
			timestamp: "2026-07-27T10:00:04Z",
			content: "Finished",
			text: "Finished",
		},
	],
};

const longAgentTurn: TraceItem = {
	executionMode: "unknown",
	kind: "agent",
	id: "long-agent",
	timestamp: "2026-07-27T10:00:00Z",
	events: Array.from(
		{ length: 27 },
		(_, index): Extract<TraceEvent, { kind: "tool" }> => ({
			kind: "tool",
			id: `long-tool-${index}`,
			timestamp: `2026-07-27T10:00:${String(index).padStart(2, "0")}Z`,
			toolName: index % 2 === 0 ? "Read" : "Write",
			input: { file_path: `/tmp/file-${index}.ts` },
			result: { content: `file ${index}`, isError: false },
		}),
	),
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
		expect(
			container.querySelectorAll("[data-trace-content-disclosure]")[0],
		).toHaveAttribute("aria-expanded", "false");
	});
});

describe("ConversationTrace sticky surfaces", () => {
	it("shows the collapsed model activity as an ordered icon flow", () => {
		const { container } = render(
			<ConversationTrace
				defaultTraceTreeOpen={false}
				expandedSpeakerLayout="trace-tree"
				items={[orderedAgentTurn]}
			/>,
		);

		const flow = container.querySelector("[data-trace-collapsed-flow]");
		const steps = Array.from(
			container.querySelectorAll<HTMLElement>(
				"[data-trace-collapsed-flow-step]",
			),
		);
		expect(flow).not.toBeNull();
		expect(steps.map((step) => step.title)).toEqual([
			"Reasoned",
			"Read",
			"Read",
			"Ran",
			"Responded",
		]);
		const connectors = container.querySelectorAll<HTMLElement>(
			"[data-trace-collapsed-flow-connector]",
		);
		expect(connectors).toHaveLength(3);
		expect(connectors[0]?.className).toContain("w-1.5");
		expect(
			container.querySelectorAll("[data-trace-collapsed-flow-cluster]"),
		).toHaveLength(4);
		expect(steps[1]?.className).not.toContain("-ml-2");
		expect(steps[2]?.className).toContain("-ml-2");
		expect(steps.filter((step) => step.title === "Ran")).toHaveLength(1);
		expect(
			container.querySelector("[data-trace-collapsed-flow-count]"),
		).toBeNull();
	});

	it("uses the 25th preview slot for the remaining activity count", () => {
		const { container } = render(
			<ConversationTrace
				defaultTraceTreeOpen={false}
				expandedSpeakerLayout="trace-tree"
				items={[longAgentTurn]}
			/>,
		);

		expect(
			container.querySelectorAll("[data-trace-collapsed-flow-step]"),
		).toHaveLength(24);
		expect(
			container.querySelector("[data-trace-collapsed-flow]"),
		).toHaveAttribute("data-trace-collapsed-flow-truncated", "true");
		const remainingCount = container.querySelector<HTMLElement>(
			"[data-trace-collapsed-flow-count]",
		);
		expect(remainingCount).toHaveTextContent("+3");
		expect(remainingCount).toHaveAttribute("data-trace-icon");
		expect(remainingCount).toHaveClass(
			"text-[8px]",
			"tracking-[-0.08em]",
			"[text-indent:-1.5px]",
		);
		expect(remainingCount?.style.width).toBe("16px");
		expect(remainingCount?.style.height).toBe("16px");
		expect(remainingCount?.style.color).toBe(
			"var(--constellation-tree-tertiary, var(--session-overview-subtle, var(--session-overview-muted)))",
		);
		expect(remainingCount?.style.background).toBe(
			"color-mix(in srgb, var(--conversation-trace-connector-color, var(--session-overview-border)) 75%, transparent)",
		);
		expect(remainingCount?.style.getPropertyValue("--trace-icon-bg")).toBe(
			"color-mix(in srgb, var(--conversation-trace-connector-color, var(--session-overview-border)) 75%, transparent)",
		);
		expect(remainingCount?.style.mask).toContain("opaline-trace-fill.svg");
	});

	it("can start every expandable trace-tree layer collapsed", () => {
		render(
			<ConversationTrace
				defaultTraceTreeOpen={false}
				expandedSpeakerLayout="trace-tree"
				items={[toolAgentTurn]}
				requestUsage={[
					{
						at: "2026-07-27T10:00:00Z",
						cacheCreationInputTokens: 0,
						cacheReadInputTokens: 0,
						inputTokens: 100,
						model: undefined,
						outputTokens: 20,
					},
				]}
			/>,
		);

		const modelTrigger = screen.getByRole("button", { name: /Agent/ });
		expect(modelTrigger).toHaveAttribute("aria-expanded", "false");
		expect(screen.queryByRole("button", { name: /Request 1/ })).toBeNull();
		expect(screen.queryByRole("button", { name: /Read/ })).toBeNull();

		fireEvent.click(modelTrigger);
		const requestTrigger = screen.getByRole("button", { name: /Request 1/ });
		expect(requestTrigger).toHaveAttribute("aria-expanded", "false");
		expect(screen.queryByRole("button", { name: /Read/ })).toBeNull();

		fireEvent.click(requestTrigger);
		expect(screen.getByRole("button", { name: /Read/ })).toHaveAttribute(
			"aria-expanded",
			"false",
		);
	});

	it("only pins the model and user speaker rows", () => {
		const { container } = render(
			<ConversationTrace
				expandedSpeakerLayout="trace-tree"
				items={[
					buriedAgentTurn,
					userItem("sticky-user", "2026-07-27T10:00:10Z"),
				]}
			/>,
		);

		const modelRow = screen
			.getByRole("button", { name: /Agent/ })
			.closest<HTMLElement>("[data-trace-tree-row-owner]");
		const userRow = screen
			.getByRole("button", { name: /User/ })
			.closest<HTMLElement>("[data-trace-tree-row-owner]");
		const stickyRows = Array.from(
			container.querySelectorAll<HTMLElement>("[data-trace-tree-sticky-top]"),
		);
		expect(stickyRows).toHaveLength(2);
		expect(stickyRows).toContain(modelRow);
		expect(stickyRows).toContain(userRow);
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
		expect(treeRow).not.toHaveAttribute("data-trace-tree-sticky-surface");
		expect(treeRow).not.toHaveAttribute("data-trace-tree-sticky-top");
		expect(treeRow?.className).not.toContain("sticky");
		expect(treeRow?.style.height).toBe("32px");
		expect(bodySlot).not.toBeNull();
		expect(treeRow?.nextElementSibling).toBe(bodySlot);
		expect(treeRow?.contains(bodySlot ?? null)).toBe(false);
	});

	it("keeps a structural reasoning node unpinned while its body precedes its children", () => {
		render(
			<ConversationTrace
				expandedSpeakerLayout="trace-tree"
				items={[structuralAgentTurn]}
			/>,
		);

		const trigger = screen.getByRole("button", { name: /Reasoning/ });
		const treeRow = trigger.closest<HTMLElement>("[data-trace-tree-row-owner]");
		const treeItem = treeRow?.parentElement;
		const collapsedPreview = treeItem?.querySelector<HTMLElement>(
			"[data-trace-collapsed-preview]",
		);
		expect(treeRow).not.toHaveAttribute("data-trace-tree-sticky-surface");
		expect(treeRow).not.toHaveAttribute("data-trace-tree-sticky-top");
		expect(collapsedPreview).toHaveClass("px-3", "py-1");
		expect(collapsedPreview).not.toHaveClass("min-h-10");
		fireEvent.click(trigger);

		const bodySlot = treeItem?.querySelector<HTMLElement>(
			":scope > [data-trace-tree-row-body]",
		);
		const expandedContent = bodySlot?.querySelector<HTMLElement>(
			"[data-trace-expanded-content]",
		);
		const subtree = treeItem?.querySelector<HTMLOListElement>(":scope > ol");
		expect(trigger).toHaveAttribute("aria-expanded", "true");
		expect(expandedContent).toHaveClass("px-3", "py-1");
		expect(treeRow).not.toHaveAttribute("data-trace-tree-sticky-surface");
		expect(treeRow).not.toHaveAttribute("data-trace-tree-sticky-top");
		expect(treeRow?.className).not.toContain("sticky");
		expect(treeRow?.style.height).toBe("32px");
		expect(bodySlot?.textContent).toContain(structuralReasoningText);
		expect(bodySlot?.nextElementSibling).toBe(subtree);
		expect(treeRow?.contains(bodySlot ?? null)).toBe(false);
	});

	it("keeps a structural message node unpinned when collapsed or expanded", () => {
		render(
			<ConversationTrace
				expandedSpeakerLayout="trace-tree"
				items={[structuralMessageTurn]}
			/>,
		);

		const trigger = screen.getByRole("button", { name: /Message/ });
		const treeRow = trigger.closest<HTMLElement>("[data-trace-tree-row-owner]");
		expect(treeRow).not.toHaveAttribute("data-trace-tree-sticky-surface");
		expect(treeRow).not.toHaveAttribute("data-trace-tree-sticky-top");

		fireEvent.click(trigger);

		expect(trigger).toHaveAttribute("aria-expanded", "true");
		expect(treeRow).not.toHaveAttribute("data-trace-tree-sticky-surface");
		expect(treeRow).not.toHaveAttribute("data-trace-tree-sticky-top");
		expect(treeRow?.className).not.toContain("sticky");
	});
});
