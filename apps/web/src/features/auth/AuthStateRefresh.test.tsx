import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appRoutes } from "@/app/routes";
import {
	clearPendingSignupRedirect,
	getAuthCallbackURL,
	getEmailLoginSuccessDestination,
	getEmailSignupSuccessDestination,
	getEmailSignupVerificationCallbackURL,
	getPendingSignupRedirect,
	getSocialLoginRedirectOptions,
	getSocialSignupRedirectOptions,
	isGetStartedPath,
	primePendingSignupRedirect,
} from "./auth-route-utils";
import { readPendingEmailLoginCodeDraft } from "./email-code-auth";
import { LoginForm } from "./LoginForm";
import { SignupForm } from "./SignupForm";

const {
	mockNavigateToDestination,
	mockRefreshAuthClientState,
	mockSendVerificationOtp,
	mockSignInEmailOtp,
	mockSignInSocial,
	mockTrackAuthenticationAction,
} = vi.hoisted(() => ({
	mockNavigateToDestination: vi.fn(),
	mockRefreshAuthClientState: vi.fn(),
	mockSendVerificationOtp: vi.fn(),
	mockSignInEmailOtp: vi.fn(),
	mockSignInSocial: vi.fn(),
	mockTrackAuthenticationAction: vi.fn(),
}));

vi.mock("@/lib/auth-client", () => ({
	authClient: {
		emailOtp: {
			sendVerificationOtp: mockSendVerificationOtp,
		},
		signIn: {
			emailOtp: mockSignInEmailOtp,
			social: mockSignInSocial,
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
		mockSendVerificationOtp.mockReset();
		mockSignInEmailOtp.mockReset();
		mockSignInSocial.mockReset();
		mockNavigateToDestination.mockReset();
		mockRefreshAuthClientState.mockReset();
		mockTrackAuthenticationAction.mockReset();
		window.sessionStorage.clear();
	});

	it("routes homepage email signups to the wrapped card profile flow", () => {
		expect(getEmailSignupSuccessDestination("/", "")).toBe(
			appRoutes.wrappedCardProfile(),
		);
	});

	it("uses the direct redirect destination for homepage email verification callbacks", () => {
		expect(getEmailSignupVerificationCallbackURL("/", "")).toBe(
			appRoutes.wrappedCardProfile(),
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

	it("routes explicit wrapped redirects for email signup to the card profile flow", () => {
		expect(getEmailSignupSuccessDestination("/", "?redirect=%2Fwrapped")).toBe(
			appRoutes.wrappedCardProfile(),
		);
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

	it("routes direct wrapped email signups to the card profile flow", () => {
		expect(getEmailSignupSuccessDestination("/wrapped", "")).toBe(
			appRoutes.wrappedCardProfile(),
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
		expect(getEmailLoginSuccessDestination("/wrapped", "")).toBe(
			appRoutes.wrappedSessionsLanded(),
		);
	});

	it("returns wrapped auth redirects to uploaded sessions with share attribution", () => {
		expect(
			getEmailLoginSuccessDestination(
				"/wrapped",
				"?share_id=share-123&flow=story",
			),
		).toBe("/wrapped?share_id=share-123&flow=sessions-landed");
	});

	it("builds social login callbacks that return wrapped auth to uploaded sessions", () => {
		expect(getAuthCallbackURL("/wrapped", "?share_id=share-123")).toBe(
			`/?redirect=${encodeURIComponent(
				"/wrapped?share_id=share-123&flow=sessions-landed",
			)}`,
		);
	});

	it("uses card profile as the new-user destination for social logins from wrapped", () => {
		expect(
			getSocialLoginRedirectOptions("/wrapped", "?share_id=share-123"),
		).toEqual({
			callbackURL: `/?redirect=${encodeURIComponent(
				"/wrapped?share_id=share-123&flow=sessions-landed",
			)}`,
			newUserCallbackURL: "/wrapped?share_id=share-123&flow=card-profile",
		});
	});

	it("uses card profile as the new-user destination for social signups from wrapped", () => {
		expect(
			getSocialSignupRedirectOptions("/wrapped", "?share_id=share-123"),
		).toEqual({
			callbackURL: "/wrapped?share_id=share-123&flow=sessions-landed",
			newUserCallbackURL: "/wrapped?share_id=share-123&flow=card-profile",
		});
	});

	it("uses a separate new-user social signup destination on the homepage", () => {
		expect(getSocialSignupRedirectOptions("/", "")).toEqual({
			callbackURL: "/",
			newUserCallbackURL: appRoutes.wrappedCardProfile(),
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
		mockSendVerificationOtp.mockResolvedValue({ error: null });
		mockSignInEmailOtp.mockResolvedValue({ error: null });

		const user = userEvent.setup();
		render(<SignupForm onSwitchToLogin={vi.fn()} />);

		await user.click(
			screen.getByRole("button", { name: "Create account with Email" }),
		);
		expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
		await user.type(screen.getByLabelText("Email"), "ada.lovelace@example.com");
		await user.click(screen.getByRole("button", { name: "Send code" }));

		await waitFor(() => {
			expect(mockSendVerificationOtp).toHaveBeenCalledWith({
				email: "ada.lovelace@example.com",
				type: "sign-in",
			});
		});

		await user.type(await screen.findByLabelText("Email code"), "123456");
		await user.click(screen.getByRole("button", { name: "Verify code" }));

		await waitFor(() => {
			expect(mockSignInEmailOtp).toHaveBeenCalledWith({
				name: "Ada Lovelace",
				email: "ada.lovelace@example.com",
				otp: "123456",
			});
		});

		await waitFor(() => {
			expect(mockNavigateToDestination).toHaveBeenCalledWith(
				appRoutes.wrappedCardProfile(),
			);
		});

		expect(window.location.search).toBe(
			`?signup_redirect=${encodeURIComponent(appRoutes.wrappedCardProfile())}`,
		);
	});

	it("hard-navigates to explicit redirect destinations after email sign up", async () => {
		window.history.replaceState({}, "", "/?redirect=%2Fdashboard%2Fsessions");
		mockSendVerificationOtp.mockResolvedValue({ error: null });
		mockSignInEmailOtp.mockResolvedValue({ error: null });

		const user = userEvent.setup();
		render(<SignupForm onSwitchToLogin={vi.fn()} />);

		await user.click(
			screen.getByRole("button", { name: "Create account with Email" }),
		);
		await user.type(screen.getByLabelText("Email"), "ada@example.com");
		await user.click(screen.getByRole("button", { name: "Send code" }));
		await user.type(await screen.findByLabelText("Email code"), "123456");
		await user.click(screen.getByRole("button", { name: "Verify code" }));

		await waitFor(() => {
			expect(mockNavigateToDestination).toHaveBeenCalledWith(
				"/dashboard/sessions",
			);
		});
	});

	it("hard-navigates back into device flow after email sign up", async () => {
		window.history.replaceState({}, "", "/?user_code=ABCD");
		mockSendVerificationOtp.mockResolvedValue({ error: null });
		mockSignInEmailOtp.mockResolvedValue({ error: null });

		const user = userEvent.setup();
		render(<SignupForm onSwitchToLogin={vi.fn()} />);

		await user.click(
			screen.getByRole("button", { name: "Create account with Email" }),
		);
		await user.type(screen.getByLabelText("Email"), "ada@example.com");
		await user.click(screen.getByRole("button", { name: "Send code" }));
		await user.type(await screen.findByLabelText("Email code"), "123456");
		await user.click(screen.getByRole("button", { name: "Verify code" }));

		await waitFor(() => {
			expect(mockNavigateToDestination).toHaveBeenCalledWith(
				"/?user_code=ABCD",
			);
		});
	});

	it("does not navigate when email sign up fails", async () => {
		mockSendVerificationOtp.mockResolvedValue({ error: null });
		mockSignInEmailOtp.mockResolvedValue({
			error: { message: "Sign up failed" },
		});

		const user = userEvent.setup();
		render(<SignupForm onSwitchToLogin={vi.fn()} />);

		await user.click(
			screen.getByRole("button", { name: "Create account with Email" }),
		);
		await user.type(screen.getByLabelText("Email"), "ada@example.com");
		await user.click(screen.getByRole("button", { name: "Send code" }));
		await user.type(await screen.findByLabelText("Email code"), "123456");
		await user.click(screen.getByRole("button", { name: "Verify code" }));

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
				newUserCallbackURL: appRoutes.wrappedCardProfile(),
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

		expect(handlePreviewSubmit).toHaveBeenCalledWith("ada@example.com");
		expect(mockSendVerificationOtp).not.toHaveBeenCalled();
		expect(mockNavigateToDestination).not.toHaveBeenCalled();
		expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
	});

	it("hard-navigates after a successful email sign in", async () => {
		window.history.replaceState(
			{},
			"",
			`/?signup_redirect=${encodeURIComponent(appRoutes.getStarted())}`,
		);
		mockSendVerificationOtp.mockResolvedValue({ error: null });
		mockSignInEmailOtp.mockResolvedValue({ error: null });

		const user = userEvent.setup();
		render(<LoginForm onSwitchToSignup={vi.fn()} />);

		await user.click(screen.getByRole("button", { name: "Log in with Email" }));
		await user.type(screen.getByLabelText("Email"), "ada@example.com");
		await user.click(screen.getByRole("button", { name: "Send code" }));

		await waitFor(() => {
			expect(mockSendVerificationOtp).toHaveBeenCalledWith({
				email: "ada@example.com",
				type: "sign-in",
			});
		});

		await user.type(await screen.findByLabelText("Email code"), "123456");
		await user.click(screen.getByRole("button", { name: "Verify code" }));

		await waitFor(() => {
			expect(mockSignInEmailOtp).toHaveBeenCalledWith({
				email: "ada@example.com",
				otp: "123456",
			});
		});

		await waitFor(() => {
			expect(mockNavigateToDestination).toHaveBeenCalledWith("/");
		});

		expect(mockRefreshAuthClientState).toHaveBeenCalledTimes(1);
		expect(window.location.search).toBe("");
	});

	it("restores a pending email sign in code after remounting", async () => {
		mockSendVerificationOtp.mockResolvedValue({ error: null });
		mockSignInEmailOtp.mockResolvedValue({ error: null });

		const user = userEvent.setup();
		const view = render(<LoginForm onSwitchToSignup={vi.fn()} />);

		await user.click(screen.getByRole("button", { name: "Log in with Email" }));
		await user.type(screen.getByLabelText("Email"), "ada@example.com");
		await user.click(screen.getByRole("button", { name: "Send code" }));

		await waitFor(() => {
			expect(mockSendVerificationOtp).toHaveBeenCalledWith({
				email: "ada@example.com",
				type: "sign-in",
			});
		});

		view.unmount();
		render(<LoginForm onSwitchToSignup={vi.fn()} />);

		expect(screen.getByLabelText("Email")).toHaveValue("ada@example.com");
		expect(screen.getByLabelText("Email code")).toHaveValue("");
		expect(
			screen.getByRole("button", { name: "Verify code" }),
		).toBeInTheDocument();

		await user.type(screen.getByLabelText("Email code"), "123456");
		await user.click(screen.getByRole("button", { name: "Verify code" }));

		await waitFor(() => {
			expect(mockSignInEmailOtp).toHaveBeenCalledWith({
				email: "ada@example.com",
				otp: "123456",
			});
		});
		expect(readPendingEmailLoginCodeDraft()).toBeNull();
	});

	it("hard-navigates wrapped logins back into wrapped", async () => {
		window.history.replaceState({}, "", "/wrapped");
		mockSendVerificationOtp.mockResolvedValue({ error: null });
		mockSignInEmailOtp.mockResolvedValue({ error: null });

		const user = userEvent.setup();
		render(<LoginForm onSwitchToSignup={vi.fn()} />);

		await user.click(screen.getByRole("button", { name: "Log in with Email" }));
		await user.type(screen.getByLabelText("Email"), "ada@example.com");
		await user.click(screen.getByRole("button", { name: "Send code" }));
		await user.type(await screen.findByLabelText("Email code"), "123456");
		await user.click(screen.getByRole("button", { name: "Verify code" }));

		await waitFor(() => {
			expect(mockNavigateToDestination).toHaveBeenCalledWith(
				appRoutes.wrappedSessionsLanded(),
			);
		});
		expect(mockRefreshAuthClientState).toHaveBeenCalledTimes(1);
	});

	it("uses a card profile destination for new users created from social login", async () => {
		window.history.replaceState({}, "", "/wrapped?share_id=share-123");
		mockSignInSocial.mockResolvedValue({ error: null });

		const user = userEvent.setup();
		render(<LoginForm onSwitchToSignup={vi.fn()} />);

		await user.click(
			screen.getByRole("button", { name: "Log in with Google" }),
		);

		await waitFor(() => {
			expect(mockSignInSocial).toHaveBeenCalledWith({
				provider: "google",
				callbackURL: `/?redirect=${encodeURIComponent(
					"/wrapped?share_id=share-123&flow=sessions-landed",
				)}`,
				newUserCallbackURL: "/wrapped?share_id=share-123&flow=card-profile",
			});
		});
	});

	it("shows verbose dev details for email sign in failures", async () => {
		mockSendVerificationOtp.mockResolvedValue({ error: null });
		mockSignInEmailOtp.mockResolvedValue({
			error: {
				code: "INVALID_ORIGIN",
				message: "Invalid origin",
				status: 403,
				statusText: "Forbidden",
			},
		});

		const user = userEvent.setup();
		render(<LoginForm onSwitchToSignup={vi.fn()} />);

		await user.click(screen.getByRole("button", { name: "Log in with Email" }));
		await user.type(screen.getByLabelText("Email"), "ada@example.com");
		await user.click(screen.getByRole("button", { name: "Send code" }));
		await user.type(await screen.findByLabelText("Email code"), "123456");
		await user.click(screen.getByRole("button", { name: "Verify code" }));

		const alert = await screen.findByRole("alert");
		expect(alert).toHaveTextContent("Invalid origin");
		expect(alert).toHaveTextContent("Dev auth details:");
		expect(alert).toHaveTextContent("Operation: email code sign in");
		expect(alert).toHaveTextContent("Request origin: http://localhost:4011");
		expect(alert).toHaveTextContent("error.code: INVALID_ORIGIN");
		expect(alert).toHaveTextContent(
			"Likely fix: add the request origin to the API trusted origins",
		);
		expect(mockNavigateToDestination).not.toHaveBeenCalled();
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

		expect(handlePreviewSubmit).toHaveBeenCalledWith("ada@example.com");
		expect(mockSignInEmailOtp).not.toHaveBeenCalled();
		expect(mockNavigateToDestination).not.toHaveBeenCalled();
		expect(
			screen.queryByRole("button", { name: "Forgot password?" }),
		).not.toBeInTheDocument();
	});
});
