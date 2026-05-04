import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AppRouter } from "./AppRouter";

vi.mock("@/features/invitations/AcceptInvitationPage", () => ({
	AcceptInvitationPage: () => <div>Invitation Page</div>,
}));

vi.mock("@/features/shell/AppShellLayout", () => ({
	AppShellLayout: () => <div>App shell</div>,
}));

describe("AppRouter", () => {
	it("preserves explicit authenticated root redirects", async () => {
		render(
			<MemoryRouter initialEntries={["/"]}>
				<AppRouter rootRedirectTarget="/invitation/123" session={null} />
			</MemoryRouter>,
		);

		await waitFor(() => {
			expect(screen.getByText("Invitation Page")).toBeInTheDocument();
		});
	});

	it("redirects YC review sessions away from settings", async () => {
		render(
			<MemoryRouter initialEntries={["/settings/account"]}>
				<AppRouter
					rootRedirectTarget={null}
					session={{ session: { ycReview: true } }}
				/>
				<LocationProbe />
			</MemoryRouter>,
		);

		await waitFor(() => {
			expect(screen.getByText("Current path: /wrapped")).toBeInTheDocument();
		});
	});

	it("redirects YC review sessions away from session details", async () => {
		render(
			<MemoryRouter initialEntries={["/dashboard/sessions/session-123"]}>
				<AppRouter
					rootRedirectTarget={null}
					session={{ session: { ycReview: true } }}
				/>
				<LocationProbe />
			</MemoryRouter>,
		);

		await waitFor(() => {
			expect(
				screen.getByText("Current path: /dashboard/sessions"),
			).toBeInTheDocument();
		});
	});
});

function LocationProbe() {
	const location = useLocation();

	return <div>Current path: {location.pathname}</div>;
}
