import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { appRoutes } from "@/app/routes";
import { YcPasswordLoginPage } from "./YcPasswordLoginPage";

const YC_PASSWORD_LOGIN_DRAFT_STORAGE_KEY = "rudel:yc-password-login-draft";

const {
	mockNavigateToDestination,
	mockRefreshAuthClientState,
	mockTrackAuthenticationAction,
} = vi.hoisted(() => ({
	mockNavigateToDestination: vi.fn(),
	mockRefreshAuthClientState: vi.fn(),
	mockTrackAuthenticationAction: vi.fn(),
}));

vi.mock("@/lib/auth-client", () => ({
	refreshAuthClientState: mockRefreshAuthClientState,
}));

vi.mock("./auth-navigation", () => ({
	navigateToDestination: mockNavigateToDestination,
}));

vi.mock("@/features/analytics/tracking/useAnalyticsTracking", () => ({
	useAnalyticsTracking: () => ({
		trackAuthenticationAction: mockTrackAuthenticationAction,
	}),
}));

vi.mock("@/features/wrapped/WrappedGuestPreviewCard", () => ({
	WrappedGuestPreviewCard: (props: {
		profile: { displayName: string } | null;
	}) => <div>{props.profile?.displayName ?? "Wrapped preview card"}</div>,
}));

describe("YcPasswordLoginPage", () => {
	beforeEach(() => {
		mockNavigateToDestination.mockReset();
		mockRefreshAuthClientState.mockReset();
		mockTrackAuthenticationAction.mockReset();
		vi.unstubAllGlobals();
		window.sessionStorage.clear();
	});

	it("renders only the email and password auth option", () => {
		render(
			<MemoryRouter initialEntries={["/yc"]}>
				<YcPasswordLoginPage />
			</MemoryRouter>,
		);

		expect(
			screen.getByRole("heading", { name: "YC Log in" }),
		).toBeInTheDocument();
		expect(screen.getByLabelText("Email")).toBeInTheDocument();
		expect(screen.getByLabelText("Password")).toBeInTheDocument();
		expect(screen.getByPlaceholderText("Password")).toBeInTheDocument();
		expect(screen.getByText("Evren")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Log in" })).toBeInTheDocument();
		expect(
			screen.queryByRole("button", { name: /google/i }),
		).not.toBeInTheDocument();
		expect(
			screen.queryByRole("button", { name: /github/i }),
		).not.toBeInTheDocument();
		expect(
			screen.queryByRole("button", { name: /create account/i }),
		).not.toBeInTheDocument();
	});

	it("restores typed credentials after a brief remount", async () => {
		const user = userEvent.setup();
		const view = render(
			<MemoryRouter initialEntries={["/yc"]}>
				<YcPasswordLoginPage />
			</MemoryRouter>,
		);

		await user.type(
			screen.getByLabelText("Email"),
			"applicant@ycombinator.com",
		);
		await user.type(screen.getByLabelText("Password"), "secret-password");

		view.unmount();

		render(
			<MemoryRouter initialEntries={["/yc"]}>
				<YcPasswordLoginPage />
			</MemoryRouter>,
		);

		expect(screen.getByLabelText("Email")).toHaveValue(
			"applicant@ycombinator.com",
		);
		expect(screen.getByLabelText("Password")).toHaveValue("secret-password");
	});

	it("signs in with email and password and lands in the wrapped story", async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(JSON.stringify({ token: "session-token" }), {
				headers: { "Content-Type": "application/json" },
				status: 200,
			}),
		);
		vi.stubGlobal("fetch", fetchMock);

		const user = userEvent.setup();
		render(
			<MemoryRouter initialEntries={["/yc"]}>
				<YcPasswordLoginPage />
			</MemoryRouter>,
		);

		await user.type(
			screen.getByLabelText("Email"),
			" applicant@ycombinator.com ",
		);
		await user.type(screen.getByLabelText("Password"), "secret-password");
		await user.click(screen.getByRole("button", { name: "Log in" }));

		await waitFor(() => {
			expect(fetchMock).toHaveBeenCalledWith(
				"/api/auth/yc/sign-in",
				expect.objectContaining({
					body: JSON.stringify({
						email: "applicant@ycombinator.com",
						password: "secret-password",
					}),
					credentials: "include",
					method: "POST",
				}),
			);
		});
		expect(mockTrackAuthenticationAction).toHaveBeenCalledWith({
			actionName: "sign_in",
			sourceComponent: "yc_password_login_form",
			authMethod: "email_password",
		});
		expect(mockRefreshAuthClientState).toHaveBeenCalledTimes(1);
		expect(mockNavigateToDestination).toHaveBeenCalledWith(
			appRoutes.wrappedStory(),
		);
		expect(
			window.sessionStorage.getItem(YC_PASSWORD_LOGIN_DRAFT_STORAGE_KEY),
		).toBeNull();
	});
});
