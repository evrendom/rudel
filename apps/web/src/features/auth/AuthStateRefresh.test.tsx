import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appRoutes } from "@/app/routes";
import {
	clearPendingSignupRedirect,
	getEmailLoginSuccessDestination,
	getEmailSignupSuccessDestination,
	getEmailSignupVerificationCallbackURL,
	getPendingSignupRedirect,
	getSocialSignupRedirectOptions,
	isGetStartedPath,
	primePendingSignupRedirect,
} from "./auth-route-utils";
import { LoginForm } from "./LoginForm";
import { SignupForm } from "./SignupForm";

const {
	mockNavigateToDestination,
	mockRefreshAuthClientState,
	mockSignInEmail,
	mockSignInSocial,
	mockSignUpEmail,
	mockTrackAuthenticationAction,
} = vi.hoisted(() => ({
	mockNavigateToDestination: vi.fn(),
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

vi.mock("./auth-navigation", () => ({
	navigateToDestination: mockNavigateToDestination,
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
		mockSignInEmail.mockReset();
		mockSignInSocial.mockReset();
		mockSignUpEmail.mockReset();
		mockNavigateToDestination.mockReset();
		mockRefreshAuthClientState.mockReset();
		mockTrackAuthenticationAction.mockReset();
	});

	it("routes homepage email signups to the wrapped entry", () => {
		expect(getEmailSignupSuccessDestination("/", "")).toBe(
			appRoutes.wrappedTeamCard(),
		);
	});

	it("uses the direct redirect destination for homepage email verification callbacks", () => {
		expect(getEmailSignupVerificationCallbackURL("/", "")).toBe(
			appRoutes.wrappedTeamCard(),
		);
	});

	it("matches both canonical and legacy get-started paths", () => {
		expect(isGetStartedPath(appRoutes.getStarted())).toBe(true);
		expect(isGetStartedPath(appRoutes.dashboardGetStartedLegacy())).toBe(true);
		expect(isGetStartedPath(appRoutes.dashboard())).toBe(false);
	});

	it("stores a pending homepage signup redirect in the URL", () => {
		primePendingSignupRedirect(appRoutes.getStarted(), "/", "");

		expect(getPendingSignupRedirect(window.location.search)).toBe(
			appRoutes.getStarted(),
		);
		expect(window.location.search).toBe(
			`?signup_redirect=${encodeURIComponent(appRoutes.getStarted())}`,
		);
	});

	it("does not add a pending signup redirect for explicit redirect flows", () => {
		primePendingSignupRedirect(
			appRoutes.getStarted(),
			"/",
			"?redirect=%2Fdashboard%2Fsessions",
		);

		expect(getPendingSignupRedirect(window.location.search)).toBeNull();
	});

	it("clears a pending signup redirect from the URL", () => {
		window.history.replaceState(
			{},
			"",
			`/?signup_redirect=${encodeURIComponent(appRoutes.getStarted())}`,
		);

		clearPendingSignupRedirect();

		expect(window.location.search).toBe("");
		expect(getPendingSignupRedirect(window.location.search)).toBeNull();
	});

	it("preserves an explicit redirect for email signup success", () => {
		expect(
			getEmailSignupSuccessDestination(
				"/",
				"?redirect=%2Fdashboard%2Fsessions",
			),
		).toBe("/dashboard/sessions");
	});

	it("preserves device flow destinations for email signup", () => {
		expect(getEmailSignupSuccessDestination("/", "?user_code=ABCD")).toBe(
			"/?user_code=ABCD",
		);
	});

	it("preserves direct non-root destinations for email signup", () => {
		expect(getEmailSignupSuccessDestination("/invitation/123", "")).toBe(
			"/invitation/123",
		);
	});

	it("routes homepage email logins back to the app root", () => {
		expect(getEmailLoginSuccessDestination("/", "")).toBe("/");
	});

	it("preserves explicit redirect destinations for email login", () => {
		expect(
			getEmailLoginSuccessDestination("/", "?redirect=%2Fdashboard%2Fsessions"),
		).toBe("/dashboard/sessions");
	});

	it("preserves direct wrapped destinations for email login", () => {
		expect(getEmailLoginSuccessDestination("/wrapped", "")).toBe("/wrapped");
	});

	it("uses a separate new-user social signup destination on the homepage", () => {
		expect(getSocialSignupRedirectOptions("/", "")).toEqual({
			callbackURL: "/",
			newUserCallbackURL: appRoutes.wrappedTeamCard(),
		});
	});

	it("preserves redirect destinations for social signup flows", () => {
		expect(
			getSocialSignupRedirectOptions("/", "?redirect=%2Finvitation%2F123"),
		).toEqual({
			callbackURL: "/invitation/123",
			newUserCallbackURL: "/invitation/123",
		});
	});

	it("preserves device destinations for social signup flows", () => {
		expect(getSocialSignupRedirectOptions("/", "?user_code=ABCD")).toEqual({
			callbackURL: "/?user_code=ABCD",
			newUserCallbackURL: "/?user_code=ABCD",
		});
	});

	it("hard-navigates after a successful homepage email sign up", async () => {
		mockSignUpEmail.mockResolvedValue({ error: null });

		const user = userEvent.setup();
		render(<SignupForm onSwitchToLogin={vi.fn()} />);

		await user.click(
			screen.getByRole("button", { name: "Create account with Email" }),
		);
		await user.type(screen.getByLabelText("Name"), "Ada Lovelace");
		await user.type(screen.getByLabelText("Email"), "ada@example.com");
		await user.type(screen.getByLabelText("Password"), "supersecure");
		await user.click(screen.getByRole("button", { name: "Sign up" }));

		await waitFor(() => {
			expect(mockSignUpEmail).toHaveBeenCalledWith(
				expect.objectContaining({
					name: "Ada Lovelace",
					email: "ada@example.com",
					password: "supersecure",
					callbackURL: "/wrapped",
					fetchOptions: expect.objectContaining({
						disableSignal: true,
						onSuccess: expect.any(Function),
					}),
				}),
			);
		});

		await waitFor(() => {
			expect(mockNavigateToDestination).toHaveBeenCalledWith("/wrapped");
		});

		expect(window.location.search).toBe(
			`?signup_redirect=${encodeURIComponent(appRoutes.wrappedTeamCard())}`,
		);
	});

	it("hard-navigates to explicit redirect destinations after email sign up", async () => {
		window.history.replaceState({}, "", "/?redirect=%2Fdashboard%2Fsessions");
		mockSignUpEmail.mockResolvedValue({ error: null });

		const user = userEvent.setup();
		render(<SignupForm onSwitchToLogin={vi.fn()} />);

		await user.click(
			screen.getByRole("button", { name: "Create account with Email" }),
		);
		await user.type(screen.getByLabelText("Name"), "Ada Lovelace");
		await user.type(screen.getByLabelText("Email"), "ada@example.com");
		await user.type(screen.getByLabelText("Password"), "supersecure");
		await user.click(screen.getByRole("button", { name: "Sign up" }));

		await waitFor(() => {
			expect(mockNavigateToDestination).toHaveBeenCalledWith(
				"/dashboard/sessions",
			);
		});
	});

	it("hard-navigates back into device flow after email sign up", async () => {
		window.history.replaceState({}, "", "/?user_code=ABCD");
		mockSignUpEmail.mockResolvedValue({ error: null });

		const user = userEvent.setup();
		render(<SignupForm onSwitchToLogin={vi.fn()} />);

		await user.click(
			screen.getByRole("button", { name: "Create account with Email" }),
		);
		await user.type(screen.getByLabelText("Name"), "Ada Lovelace");
		await user.type(screen.getByLabelText("Email"), "ada@example.com");
		await user.type(screen.getByLabelText("Password"), "supersecure");
		await user.click(screen.getByRole("button", { name: "Sign up" }));

		await waitFor(() => {
			expect(mockNavigateToDestination).toHaveBeenCalledWith(
				"/?user_code=ABCD",
			);
		});
	});

	it("does not navigate when email sign up fails", async () => {
		mockSignUpEmail.mockResolvedValue({
			error: { message: "Sign up failed" },
		});

		const user = userEvent.setup();
		render(<SignupForm onSwitchToLogin={vi.fn()} />);

		await user.click(
			screen.getByRole("button", { name: "Create account with Email" }),
		);
		await user.type(screen.getByLabelText("Name"), "Ada Lovelace");
		await user.type(screen.getByLabelText("Email"), "ada@example.com");
		await user.type(screen.getByLabelText("Password"), "supersecure");
		await user.click(screen.getByRole("button", { name: "Sign up" }));

		await waitFor(() => {
			expect(screen.getByText("Sign up failed")).toBeInTheDocument();
		});

		expect(mockNavigateToDestination).not.toHaveBeenCalled();
	});

	it("uses separate existing-user and new-user destinations for homepage social sign up", async () => {
		mockSignInSocial.mockResolvedValue({ error: null });

		const user = userEvent.setup();
		render(<SignupForm onSwitchToLogin={vi.fn()} />);

		await user.click(
			screen.getByRole("button", { name: "Create account with Google" }),
		);

		await waitFor(() => {
			expect(mockSignInSocial).toHaveBeenCalledWith({
				provider: "google",
				callbackURL: "/",
				newUserCallbackURL: "/wrapped",
			});
		});
	});

	it("uses a local wrapped preview submit for email sign up when requested", async () => {
		const user = userEvent.setup();
		const handlePreviewSubmit = vi.fn();

		render(
			<SignupForm
				onEmailPasswordPreviewSubmit={handlePreviewSubmit}
				onSwitchToLogin={vi.fn()}
				variant="wrapped-story"
			/>,
		);

		await user.click(
			screen.getByRole("button", { name: "Create account with Email" }),
		);
		await user.type(await screen.findByLabelText("Email"), "ada@example.com");
		await user.click(screen.getByRole("button", { name: "Continue" }));
		expect(await screen.findByLabelText("Password")).toBeInTheDocument();
		await user.type(screen.getByLabelText("Password"), "supersecure");
		await user.click(screen.getByRole("button", { name: "Sign up" }));

		expect(handlePreviewSubmit).toHaveBeenCalledWith("ada@example.com");
		expect(mockSignUpEmail).not.toHaveBeenCalled();
		expect(mockNavigateToDestination).not.toHaveBeenCalled();
		expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
	});

	it("hard-navigates after a successful email sign in", async () => {
		window.history.replaceState(
			{},
			"",
			`/?signup_redirect=${encodeURIComponent(appRoutes.getStarted())}`,
		);
		mockSignInEmail.mockResolvedValue({ error: null });

		const user = userEvent.setup();
		render(<LoginForm onSwitchToSignup={vi.fn()} />);

		await user.click(screen.getByRole("button", { name: "Log in with Email" }));
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
			expect(mockNavigateToDestination).toHaveBeenCalledWith("/");
		});

		expect(mockRefreshAuthClientState).toHaveBeenCalledTimes(1);
		expect(window.location.search).toBe("");
	});

	it("hard-navigates wrapped logins back into wrapped", async () => {
		window.history.replaceState({}, "", "/wrapped");
		mockSignInEmail.mockResolvedValue({ error: null });

		const user = userEvent.setup();
		render(<LoginForm onSwitchToSignup={vi.fn()} />);

		await user.click(screen.getByRole("button", { name: "Log in with Email" }));
		await user.type(screen.getByLabelText("Email"), "ada@example.com");
		await user.type(screen.getByLabelText("Password"), "supersecure");
		await user.click(screen.getByRole("button", { name: "Sign in" }));

		await waitFor(() => {
			expect(mockNavigateToDestination).toHaveBeenCalledWith("/wrapped");
		});
		expect(mockRefreshAuthClientState).toHaveBeenCalledTimes(1);
	});

	it("uses a local wrapped preview submit for email sign in when requested", async () => {
		const user = userEvent.setup();
		const handlePreviewSubmit = vi.fn();

		render(
			<LoginForm
				onEmailPasswordPreviewSubmit={handlePreviewSubmit}
				onSwitchToSignup={vi.fn()}
				variant="wrapped-story"
			/>,
		);

		await user.click(screen.getByRole("button", { name: "Log in with Email" }));
		await user.type(await screen.findByLabelText("Email"), "ada@example.com");
		await user.click(screen.getByRole("button", { name: "Continue" }));
		expect(await screen.findByLabelText("Password")).toBeInTheDocument();
		await user.type(screen.getByLabelText("Password"), "supersecure");
		await user.click(screen.getByRole("button", { name: "Sign in" }));

		expect(handlePreviewSubmit).toHaveBeenCalledWith("ada@example.com");
		expect(mockSignInEmail).not.toHaveBeenCalled();
		expect(mockNavigateToDestination).not.toHaveBeenCalled();
		expect(
			screen.queryByRole("button", { name: "Forgot password?" }),
		).not.toBeInTheDocument();
	});
});
