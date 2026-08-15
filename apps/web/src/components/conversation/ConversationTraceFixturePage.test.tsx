import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ConversationTraceFixturePage } from "./ConversationTraceFixturePage";
import { buildConversationTraceFixtureTurns } from "./conversation-trace-fixture";

describe("ConversationTraceFixturePage", () => {
	it("builds a deterministic fixture", () => {
		expect(JSON.stringify(buildConversationTraceFixtureTurns())).toBe(
			JSON.stringify(buildConversationTraceFixtureTurns()),
		);
	});

	it("renders two turns with request stacks inside the scroll-container contract", () => {
		const { container } = render(<ConversationTraceFixturePage />);

		expect(
			container.querySelector("[data-conversation-trace-scroll-container]"),
		).not.toBeNull();
		expect(
			container.querySelectorAll("[data-trace-fixture-turn]"),
		).toHaveLength(2);
		// Each turn renders its two request sections.
		expect(screen.getAllByText(/Request 1/)).toHaveLength(2);
		expect(screen.getAllByText(/Request 2/)).toHaveLength(2);
	});

	it("keeps every sticky row at the fixed 40px stack height", () => {
		const { container } = render(<ConversationTraceFixturePage />);

		const stickyRows = Array.from(
			container.querySelectorAll<HTMLElement>("[data-trace-tree-sticky-top]"),
		);
		expect(stickyRows.length).toBeGreaterThan(0);
		for (const row of stickyRows) {
			expect(row.style.height).toBe("40px");
			expect(row.className).toContain("sticky");
		}
	});
});
