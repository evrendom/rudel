import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WrappedSupportChatwootButton } from "./support-chatwoot-button";

const CHATWOOT_OPENED_EVENT = "chatwoot:opened";
const CHATWOOT_CLOSED_EVENT = "chatwoot:closed";

const { mockCloseChatwoot, mockOpenChatwoot } = vi.hoisted(() => ({
	mockCloseChatwoot: vi.fn(),
	mockOpenChatwoot: vi.fn(),
}));

vi.mock("@/lib/chatwoot", () => ({
	CHATWOOT_CLOSED_EVENT: "chatwoot:closed",
	CHATWOOT_OPENED_EVENT: "chatwoot:opened",
	closeChatwoot: mockCloseChatwoot,
	openChatwoot: mockOpenChatwoot,
}));

beforeEach(() => {
	mockOpenChatwoot.mockImplementation(async () => {
		window.dispatchEvent(new Event(CHATWOOT_OPENED_EVENT));
	});
	mockCloseChatwoot.mockImplementation(async () => {
		window.dispatchEvent(new Event(CHATWOOT_CLOSED_EVENT));
	});
});

afterEach(() => {
	mockCloseChatwoot.mockReset();
	mockOpenChatwoot.mockReset();
});

describe("WrappedSupportChatwootButton", () => {
	it("renders the close control through the document body while support is open", async () => {
		const user = userEvent.setup();

		render(<WrappedSupportChatwootButton />);

		await user.click(screen.getByRole("button", { name: "Open support" }));

		expect(mockOpenChatwoot).toHaveBeenCalledTimes(1);

		const closeButtons = screen.getAllByRole("button", {
			name: "Close support",
		});
		expect(closeButtons).toHaveLength(1);
		expect(closeButtons[0].parentElement).toBe(document.body);
		expect(closeButtons[0]).toHaveStyle({
			position: "fixed",
			zIndex: "2147483647",
		});
	});

	it("waits for an open signal before replacing the launcher with close", async () => {
		const user = userEvent.setup();
		mockOpenChatwoot.mockResolvedValueOnce(undefined);

		render(<WrappedSupportChatwootButton />);

		await user.click(screen.getByRole("button", { name: "Open support" }));

		expect(mockOpenChatwoot).toHaveBeenCalledTimes(1);
		expect(
			screen.queryByRole("button", { name: "Close support" }),
		).not.toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "Open support" }),
		).toBeInTheDocument();
	});

	it("keeps an externally opened chat closable from the persistent control", async () => {
		const user = userEvent.setup();

		render(<WrappedSupportChatwootButton />);

		act(() => {
			window.dispatchEvent(new Event(CHATWOOT_OPENED_EVENT));
		});

		const closeButton = screen.getByRole("button", { name: "Close support" });
		expect(closeButton.parentElement).toBe(document.body);

		await user.click(closeButton);

		expect(mockCloseChatwoot).toHaveBeenCalledTimes(1);
		expect(
			screen.getByRole("button", { name: "Open support" }),
		).toBeInTheDocument();
	});

	it("returns to the launcher when Chatwoot reports that it closed", () => {
		render(<WrappedSupportChatwootButton />);

		act(() => {
			window.dispatchEvent(new Event(CHATWOOT_OPENED_EVENT));
		});

		expect(
			screen.getByRole("button", { name: "Close support" }),
		).toBeInTheDocument();

		act(() => {
			window.dispatchEvent(new Event(CHATWOOT_CLOSED_EVENT));
		});

		expect(
			screen.getByRole("button", { name: "Open support" }),
		).toBeInTheDocument();
	});
});
