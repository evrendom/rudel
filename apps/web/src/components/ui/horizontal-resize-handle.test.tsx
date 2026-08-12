import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import {
	clampPaneSize,
	HorizontalResizeHandle,
} from "./horizontal-resize-handle";

vi.stubGlobal("PointerEvent", MouseEvent);

function ResizeHarness() {
	const [value, setValue] = useState(300);

	return (
		<HorizontalResizeHandle
			ariaLabel="Resize facts panel"
			defaultValue={300}
			maximum={500}
			minimum={200}
			onValueChange={setValue}
			value={value}
		/>
	);
}

describe("HorizontalResizeHandle", () => {
	it("clamps values to an ordered range", () => {
		expect(clampPaneSize(100, 200, 500)).toBe(200);
		expect(clampPaneSize(350, 200, 500)).toBe(350);
		expect(clampPaneSize(700, 200, 500)).toBe(500);
		expect(clampPaneSize(350, 400, 300)).toBe(400);
	});

	it("supports precise and accelerated keyboard resizing", () => {
		render(<ResizeHarness />);
		const handle = screen.getByRole("separator", {
			name: "Resize facts panel",
		});

		expect(handle).toHaveClass("h-full", "self-stretch");
		expect(handle).toHaveClass(
			"bg-transparent",
			"hover:bg-(--session-overview-accent)",
		);
		expect(handle).toHaveAttribute("aria-valuenow", "300");
		fireEvent.keyDown(handle, { key: "ArrowRight" });
		expect(handle).toHaveAttribute("aria-valuenow", "301");
		fireEvent.keyDown(handle, { key: "ArrowLeft", shiftKey: true });
		expect(handle).toHaveAttribute("aria-valuenow", "291");
		fireEvent.keyDown(handle, { key: "Home" });
		expect(handle).toHaveAttribute("aria-valuenow", "200");
		fireEvent.keyDown(handle, { key: "End" });
		expect(handle).toHaveAttribute("aria-valuenow", "500");
		fireEvent.doubleClick(handle);
		expect(handle).toHaveAttribute("aria-valuenow", "300");
	});

	it("resizes from the captured pointer delta", () => {
		render(<ResizeHarness />);
		const handle = screen.getByRole("separator", {
			name: "Resize facts panel",
		});

		fireEvent.pointerDown(handle, {
			button: 0,
			clientX: 200,
			pointerId: 1,
		});
		fireEvent.pointerMove(handle, { clientX: 243, pointerId: 1 });
		expect(handle).toHaveAttribute("aria-valuenow", "343");
		fireEvent.pointerUp(handle, { clientX: 243, pointerId: 1 });
		expect(handle).toHaveAttribute("data-resizing", "false");
	});

	it("commits a pointer resize only after the drag finishes", () => {
		const onValueChange = vi.fn();
		const onValuePreview = vi.fn();
		render(
			<HorizontalResizeHandle
				ariaLabel="Resize facts panel"
				defaultValue={300}
				maximum={500}
				minimum={200}
				onValueChange={onValueChange}
				onValuePreview={onValuePreview}
				value={300}
			/>,
		);
		const handle = screen.getByRole("separator", {
			name: "Resize facts panel",
		});

		fireEvent.pointerDown(handle, {
			button: 0,
			clientX: 200,
			pointerId: 1,
		});
		fireEvent.pointerMove(handle, { clientX: 243, pointerId: 1 });
		expect(onValueChange).not.toHaveBeenCalled();
		expect(onValuePreview).toHaveBeenLastCalledWith(343);

		fireEvent.pointerUp(handle, { clientX: 243, pointerId: 1 });
		expect(onValueChange).toHaveBeenCalledOnce();
		expect(onValueChange).toHaveBeenCalledWith(343);
	});
});
