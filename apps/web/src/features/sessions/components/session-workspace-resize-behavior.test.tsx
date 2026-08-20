import { act, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { expect, it, vi } from "vitest";
import {
	SESSION_WORKSPACE_RESIZE_END_EVENT,
	SESSION_WORKSPACE_RESIZE_START_EVENT,
	useStableTranscriptWidthDuringWorkspaceResize,
} from "./session-workspace-resize-behavior";

function rect(width: number): DOMRect {
	return {
		bottom: 800,
		height: 800,
		left: 0,
		right: width,
		top: 0,
		width,
		x: 0,
		y: 0,
		toJSON: () => ({}),
	};
}

function StableTranscriptHarness({
	onTurnTableWidthChange,
	turnTablePaneWidth,
}: {
	onTurnTableWidthChange: (width: number) => void;
	turnTablePaneWidth: number;
}) {
	const layoutRef = useRef<HTMLDivElement>(null);
	useStableTranscriptWidthDuringWorkspaceResize({
		layoutRef,
		onTurnTableWidthChange,
		turnTablePaneWidth,
	});

	return (
		<div data-slot="session-workspace" data-testid="workspace">
			<div ref={layoutRef} data-testid="layout">
				<div
					data-slot="session-detail-response-pane"
					data-testid="transcript"
				/>
			</div>
		</div>
	);
}

it("keeps the transcript width stable and assigns outer resize space to the ledger", () => {
	const onTurnTableWidthChange = vi.fn();
	let layoutWidth = 1_000;
	vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
		function getBoundingClientRect(this: HTMLElement) {
			if (this.dataset.testid === "layout") return rect(layoutWidth);
			if (this.dataset.testid === "transcript") return rect(629);
			return rect(0);
		},
	);

	const { rerender } = render(
		<StableTranscriptHarness
			onTurnTableWidthChange={onTurnTableWidthChange}
			turnTablePaneWidth={369}
		/>,
	);
	const workspace = screen.getByTestId("workspace");
	const layout = screen.getByTestId("layout");

	act(() => {
		workspace.dispatchEvent(new Event(SESSION_WORKSPACE_RESIZE_START_EVENT));
	});
	expect(layout).toHaveAttribute("data-workspace-resizing", "true");
	expect(layout).toHaveStyle("--session-transcript-pane-width: 629px");

	layoutWidth = 1_120;
	act(() => {
		workspace.dispatchEvent(new Event(SESSION_WORKSPACE_RESIZE_END_EVENT));
	});
	expect(onTurnTableWidthChange).toHaveBeenCalledWith(489);
	expect(layout).toHaveStyle("--session-turn-table-pane-width: 489px");
	expect(layout).toHaveAttribute("data-workspace-resizing", "true");
	expect(layout).toHaveStyle("--session-transcript-pane-width: 629px");

	rerender(
		<StableTranscriptHarness
			onTurnTableWidthChange={onTurnTableWidthChange}
			turnTablePaneWidth={489}
		/>,
	);
	expect(layout).not.toHaveAttribute("data-workspace-resizing");
	expect(layout.style.getPropertyValue("--session-transcript-pane-width")).toBe(
		"",
	);
});
