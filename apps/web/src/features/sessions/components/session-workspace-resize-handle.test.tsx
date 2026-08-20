import { createEvent, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	SESSION_WORKSPACE_RESIZE_END_EVENT,
	SESSION_WORKSPACE_RESIZE_START_EVENT,
} from "./session-workspace-resize-behavior";
import { SessionWorkspaceResizeHandle } from "./session-workspace-resize-handle";

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

function ResizeHarness() {
	return (
		<div className="dashboard-01-window" data-testid="shell-window">
			<div data-slot="session-workspace" data-testid="workspace">
				<div data-slot="sessions-list-pane" />
				<SessionWorkspaceResizeHandle />
			</div>
		</div>
	);
}

describe("SessionWorkspaceResizeHandle", () => {
	afterEach(() => vi.restoreAllMocks());

	beforeEach(() => {
		sessionStorage.clear();
		vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
			function getBoundingClientRect(this: HTMLElement) {
				if (this.dataset.testid === "workspace") return rect(1_600);
				if (this.dataset.slot === "sessions-list-pane") return rect(400);
				return rect(0);
			},
		);
	});

	it("resizes by keyboard, keeps the detail minimum, and remembers the width", () => {
		render(<ResizeHarness />);

		const separator = screen.getByRole("separator", {
			name: "Resize sessions overview and detail panes",
		});
		const shellWindow = screen.getByTestId("shell-window");

		expect(separator).toHaveAttribute("aria-valuenow", "400");
		fireEvent.keyDown(separator, { key: "ArrowRight" });
		expect(shellWindow).toHaveStyle("--session-list-pane-width: 424px");
		expect(sessionStorage.getItem("rudel:session-list-pane-width")).toBe("424");

		fireEvent.keyDown(separator, { key: "End" });
		expect(shellWindow).toHaveStyle("--session-list-pane-width: 702px");
		expect(separator).toHaveAttribute("aria-valuemax", "702");
	});

	it("makes the interactive separator itself own the pane-boundary hit area", () => {
		render(<ResizeHarness />);

		const separator = screen.getByRole("separator", {
			name: "Resize sessions overview and detail panes",
		});
		expect(separator).toHaveClass("relative", "h-full", "w-3", "-mx-1.5");
		expect(separator).not.toHaveClass("absolute");
	});

	it("announces the outer drag so the transcript can keep its width", () => {
		render(<ResizeHarness />);

		const separator = screen.getByRole("separator", {
			name: "Resize sessions overview and detail panes",
		});
		const workspace = screen.getByTestId("workspace");
		const resizeEvents: string[] = [];
		let capturedPointerId: number | undefined;
		separator.setPointerCapture = (pointerId) => {
			capturedPointerId = pointerId;
		};
		separator.hasPointerCapture = (pointerId) =>
			capturedPointerId === pointerId;
		separator.releasePointerCapture = () => {
			capturedPointerId = undefined;
		};
		workspace.addEventListener(SESSION_WORKSPACE_RESIZE_START_EVENT, () => {
			resizeEvents.push("start");
		});
		workspace.addEventListener(SESSION_WORKSPACE_RESIZE_END_EVENT, () => {
			resizeEvents.push("end");
		});

		const pointerDown = createEvent.pointerDown(separator);
		Object.defineProperties(pointerDown, {
			button: { value: 0 },
			isPrimary: { value: true },
			pointerId: { value: 7 },
		});
		fireEvent(separator, pointerDown);
		const pointerUp = createEvent.pointerUp(separator);
		Object.defineProperty(pointerUp, "pointerId", { value: 7 });
		fireEvent(separator, pointerUp);

		expect(resizeEvents).toEqual(["start", "end"]);
	});
});
