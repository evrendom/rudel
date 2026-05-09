import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { WorkspaceDangerZoneCard } from "./WorkspaceDangerZoneCard";

const { mockOpenChatwoot } = vi.hoisted(() => ({
	mockOpenChatwoot: vi.fn(),
}));

vi.mock("@/lib/chatwoot", () => ({
	openChatwoot: mockOpenChatwoot,
}));

describe("WorkspaceDangerZoneCard", () => {
	it("renders support guidance instead of a delete action", () => {
		render(<WorkspaceDangerZoneCard />);

		expect(screen.getByText("Delete workspace")).toHaveClass(
			"text-destructive",
		);
		expect(
			screen.getByText(
				"Workspace deletion is handled by support. Contact us if you'd like this workspace and its data removed.",
			),
		).toBeInTheDocument();
		expect(
			screen.queryByRole("button", { name: "Delete workspace" }),
		).not.toBeInTheDocument();

		const supportLink = screen.getByRole("link", { name: "support chat" });
		expect(supportLink).toHaveAttribute("href", "https://app.chatwoot.com");

		const emailLink = screen.getByRole("link", { name: "evren@rudel.ai" });
		expect(emailLink).toHaveAttribute("href", "mailto:evren@rudel.ai");
	});

	it("opens support chat when the support link is clicked", async () => {
		mockOpenChatwoot.mockClear();
		const user = userEvent.setup();

		render(<WorkspaceDangerZoneCard />);

		await user.click(screen.getByRole("link", { name: "support chat" }));

		expect(mockOpenChatwoot).toHaveBeenCalledTimes(1);
	});
});
