import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LoginForm } from "./LoginForm";
import {
	getSignupCallbackURL,
	redirectAfterSignup,
	SignupForm,
} from "./SignupForm";

const {
	mockRefreshAuthClientState,
	mockSignInEmail,
	mockSignInSocial,
	mockSignUpEmail,
	mockTrackAuthenticationAction,
} = vi.hoisted(() => ({
	mockRefreshAuthClientState: vi.fn(),
	mockSignInEmail: vi.fn(),
	mockSignInSocial: vi.fn(),
	mockSignUpEmail: vi.fn(),
	mockTrackAuthenticationAction: vi.fn(),
}));

vi.mock("@/lib/auth-client", () => ({
	authClient: {
		signIn: {
			email: mockSignInEmail,
			social: mockSignInSocial,
		},
		signUp: {
			email: mockSignUpEmail,
		},
	},
	refreshAuthClientState: mockRefreshAuthClientState,
}));

vi.mock("@/features/analytics/tracking/useAnalyticsTracking", () => ({
	useAnalyticsTracking: () => ({
		trackAuthenticationAction: mockTrackAuthenticationAction,
	}),
}));

vi.mock("@/lib/product-analytics", () => ({
	captureSignUpFailed: vi.fn(),
	normalizeWebErrorCode: vi.fn(() => "unknown_error"),
}));

describe("auth state refresh", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	beforeEach(() => {
		window.history.replaceState({}, "", "/");
		mockRefreshAuthClientState.mockReset();
		mockSignInEmail.mockReset();
		mockSignInSocial.mockReset();
		mockSignUpEmail.mockReset();
		mockTrackAuthenticationAction.mockReset();
	});

	it("routes fresh signups to the get-started page by default", () => {
		expect(getSignupCallbackURL("/", "")).toBe(
			"/?redirect=%2Fdashboard%2Fget-started",
		);
	});

	it("preserves an explicit redirect when building the signup callback URL", () => {
		expect(getSignupCallbackURL("/", "?redirect=%2Fdashboard%2Fsessions")).toBe(
			"/?redirect=%2Fdashboard%2Fsessions",
		);
	});

	it("redirects signups to the get-started page", () => {
		const assignMock = vi.fn();

		redirectAfterSignup({ assign: assignMock });

		expect(assignMock).toHaveBeenCalledWith(
			"/?redirect=%2Fdashboard%2Fget-started",
		);
	});

	it("refreshes the auth store after a successful email sign up", async () => {
		mockSignUpEmail.mockResolvedValue({ error: null });
		vi.spyOn(console, "error").mockImplementation(() => {});

		const user = userEvent.setup();
		render(<SignupForm onSwitchToLogin={vi.fn()} />);

		await user.type(screen.getByLabelText("Name"), "Ada Lovelace");
		await user.type(screen.getByLabelText("Email"), "ada@example.com");
		await user.type(screen.getByLabelText("Password"), "supersecure");
		await user.click(screen.getByRole("button", { name: "Sign up" }));

		await waitFor(() => {
			expect(mockSignUpEmail).toHaveBeenCalledWith({
				name: "Ada Lovelace",
				email: "ada@example.com",
				password: "supersecure",
			});
		});

		await waitFor(() => {
			expect(mockRefreshAuthClientState).toHaveBeenCalledTimes(1);
		});
	});

	it("refreshes the auth store after a successful email sign in", async () => {
		mockSignInEmail.mockResolvedValue({ error: null });

		const user = userEvent.setup();
		render(<LoginForm onSwitchToSignup={vi.fn()} />);

		await user.type(screen.getByLabelText("Email"), "ada@example.com");
		await user.type(screen.getByLabelText("Password"), "supersecure");
		await user.click(screen.getByRole("button", { name: "Sign in" }));

		await waitFor(() => {
			expect(mockSignInEmail).toHaveBeenCalledWith({
				email: "ada@example.com",
				password: "supersecure",
			});
		});

		await waitFor(() => {
			expect(mockRefreshAuthClientState).toHaveBeenCalledTimes(1);
		});
	});
});
