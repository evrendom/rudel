import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AppRouter } from "./AppRouter";

vi.mock("@/features/invitations/AcceptInvitationPage", () => ({
	AcceptInvitationPage: () => <div>Invitation Page</div>,
}));

describe("AppRouter", () => {
	it("preserves explicit authenticated root redirects", async () => {
		render(
			<MemoryRouter initialEntries={["/"]}>
				<AppRouter rootRedirectTarget="/invitation/123" />
			</MemoryRouter>,
		);

		await waitFor(() => {
			expect(screen.getByText("Invitation Page")).toBeInTheDocument();
		});
	});
});
