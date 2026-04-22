import { useState } from "react";
import { Button } from "@/app/ui/button";
import { Input } from "@/app/ui/input";
import { Label } from "@/app/ui/label";
import { Separator } from "@/app/ui/separator";
import { useAnalyticsTracking } from "@/features/analytics/tracking/useAnalyticsTracking";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { navigateToDestination } from "./auth-navigation";
import {
	clearPendingSignupRedirect,
	getEmailLoginSuccessDestination,
} from "./auth-route-utils";
import {
	recordOAuthRedirectResult,
	recordOAuthRedirectStart,
} from "./oauth-debug";

type FeedbackState = {
	kind: "error" | "success";
	message: string;
} | null;

interface LoginFormProps {
	hideSwitchPrompt?: boolean;
	onSwitchToSignup: () => void;
	variant?: "default" | "wrapped-story";
}

function getCallbackURL(): string {
	const params = new URLSearchParams(window.location.search);
	const userCode = params.get("user_code");
	if (userCode) {
		return `/?user_code=${encodeURIComponent(userCode)}`;
	}
	const redirect = params.get("redirect");
	if (redirect) {
		return `/?redirect=${encodeURIComponent(redirect)}`;
	}
	const path = window.location.pathname;
	const search = window.location.search;
	if (path !== "/" && path !== "") {
		return `/?redirect=${encodeURIComponent(`${path}${search}`)}`;
	}
	return "/";
}

export function LoginForm(props: LoginFormProps) {
	const {
		hideSwitchPrompt = false,
		onSwitchToSignup,
		variant = "default",
	} = props;
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [feedback, setFeedback] = useState<FeedbackState>(null);
	const [loading, setLoading] = useState(false);
	const [requestingPasswordReset, setRequestingPasswordReset] = useState(false);
	const [showEmailForm, setShowEmailForm] = useState(false);
	const { trackAuthenticationAction } = useAnalyticsTracking({
		pageName: "login",
	});
	const isWrappedStory = variant === "wrapped-story";
	const hasValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

	function handleRevealEmailLogin() {
		setFeedback(null);
		if (!hasValidEmail) {
			const emailField = document.getElementById("login-email");
			if (emailField instanceof HTMLInputElement) {
				emailField.focus();
			}
			setFeedback({
				kind: "error",
				message: "Enter a valid email to continue.",
			});
			return;
		}
		setShowEmailForm(true);
	}

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setFeedback(null);
		const successDestination = getEmailLoginSuccessDestination();
		trackAuthenticationAction({
			actionName: "sign_in",
			sourceComponent: "login_form",
			authMethod: "email_password",
		});
		clearPendingSignupRedirect();
		setLoading(true);
		const { error } = await authClient.signIn.email({ email, password });
		setLoading(false);
		if (error) {
			setFeedback({
				kind: "error",
				message: error.message ?? "Sign in failed",
			});
			return;
		}

		navigateToDestination(successDestination);
	}

	async function handleRequestPasswordReset() {
		if (!email.trim()) {
			const emailField = document.getElementById("email");
			if (emailField instanceof HTMLInputElement) {
				emailField.focus();
			}
			setFeedback({
				kind: "error",
				message:
					"Enter your email first and we will send the reset link there.",
			});
			return;
		}

		trackAuthenticationAction({
			actionName: "request_password_reset",
			sourceComponent: "login_form",
			authMethod: "email_password",
		});
		setFeedback(null);
		setRequestingPasswordReset(true);
		const { error } = await authClient.requestPasswordReset({
			email,
			redirectTo: `${window.location.origin}/reset-password`,
		});
		setRequestingPasswordReset(false);

		if (error) {
			setFeedback({
				kind: "error",
				message: error.message ?? "Could not send password reset email",
			});
			return;
		}

		setFeedback({
			kind: "success",
			message: `If an account exists for ${email.trim()}, a reset link is on its way.`,
		});
	}

	async function handleSocialSignIn(provider: "google" | "github") {
		setFeedback(null);
		trackAuthenticationAction({
			actionName: "sign_in",
			sourceComponent: "login_form",
			authMethod: provider,
		});
		const callbackURL = getCallbackURL();
		recordOAuthRedirectStart({
			callbackURL,
			provider,
			source: "login_form",
		});
		const { error } = await authClient.signIn.social({
			provider,
			callbackURL,
		});
		recordOAuthRedirectResult({
			errorMessage: error?.message,
			provider,
			source: "login_form",
		});
		if (error) {
			setFeedback({
				kind: "error",
				message: error.message ?? `Sign in with ${provider} failed`,
			});
		}
	}

	if (isWrappedStory) {
		return (
			<div className="mymind-wrapped-auth-form">
				<div className="mymind-wrapped-auth-form__social">
					<Button
						type="button"
						variant="outline"
						className="mymind-wrapped-secondary-action rounded-full"
						onClick={() => handleSocialSignIn("google")}
					>
						Continue with Google
					</Button>
					<Button
						type="button"
						variant="outline"
						className="mymind-wrapped-secondary-action rounded-full"
						onClick={() => handleSocialSignIn("github")}
					>
						Continue with GitHub
					</Button>
				</div>

				<div className="mymind-wrapped-auth-form__divider">
					<Separator className="mymind-wrapped-auth-form__divider-line" />
					<span className="mymind-wrapped-auth-form__divider-label">OR</span>
					<Separator className="mymind-wrapped-auth-form__divider-line" />
				</div>

				{feedback ? (
					<div
						role={feedback.kind === "error" ? "alert" : "status"}
						aria-live="polite"
						className={cn(
							"mymind-wrapped-auth-form__feedback",
							feedback.kind === "error" ? "is-error" : "is-success",
						)}
					>
						{feedback.message}
					</div>
				) : null}

				<div className="mymind-wrapped-auth-form__email-row">
					<Input
						aria-label="Email"
						id="login-email"
						name="email"
						type="email"
						autoComplete="email"
						placeholder="you@example.com"
						value={email}
						onChange={(e) => {
							setEmail(e.target.value);
							if (feedback) {
								setFeedback(null);
							}
						}}
						className="mymind-wrapped-auth-form__email-input h-11"
						required
					/>
					{hasValidEmail ? (
						<Button
							type="button"
							variant="outline"
							size="sm"
							className="mymind-wrapped-auth-form__email-button"
							onClick={handleRevealEmailLogin}
						>
							Continue
						</Button>
					) : null}
				</div>

				{showEmailForm ? (
					<form onSubmit={handleSubmit} className="flex flex-col gap-4">
						<div className="mymind-wrapped-auth-form__field">
							<div className="flex items-center justify-between gap-3">
								<Label
									className="mymind-wrapped-auth-form__label"
									htmlFor="password"
								>
									Password
								</Label>
								<Button
									type="button"
									variant="ghost"
									size="xs"
									onClick={() => {
										void handleRequestPasswordReset();
									}}
									disabled={requestingPasswordReset}
									className="mymind-wrapped-auth-form__inline-action"
								>
									{requestingPasswordReset
										? "Sending link..."
										: feedback?.kind === "success"
											? "Resend link"
											: "Forgot password?"}
								</Button>
							</div>
							<Input
								id="password"
								name="password"
								type="password"
								autoComplete="current-password"
								value={password}
								onChange={(e) => {
									setPassword(e.target.value);
									if (feedback?.kind === "error") {
										setFeedback(null);
									}
								}}
								className="mymind-wrapped-auth-form__input"
								required
							/>
						</div>
						<Button
							type="submit"
							disabled={loading || requestingPasswordReset}
							className="mymind-wrapped-entry-action h-11 rounded-full px-7 [font-family:var(--app-font-heading)] text-[1.0625rem] font-semibold"
						>
							{loading ? "Signing in..." : "Sign in"}
						</Button>
					</form>
				) : null}

				<p className="mymind-wrapped-auth-form__terms">
					By continuing, you agree to our{" "}
					<a
						href="https://rudel.ai/terms"
						target="_blank"
						rel="noopener noreferrer"
						className="mymind-wrapped-auth-form__switch-link"
					>
						Terms of Service
					</a>{" "}
					and{" "}
					<a
						href="https://obsessiondb.com/privacy"
						target="_blank"
						rel="noopener noreferrer"
						className="mymind-wrapped-auth-form__switch-link"
					>
						Privacy Policy
					</a>
					.
				</p>

				{hideSwitchPrompt ? null : (
					<p className="mymind-wrapped-auth-form__switch-copy">
						Don&apos;t have an account?{" "}
						<button
							type="button"
							onClick={() => {
								trackAuthenticationAction({
									actionName: "open_signup",
									sourceComponent: "login_form",
								});
								onSwitchToSignup();
							}}
							className="mymind-wrapped-auth-form__switch-link"
						>
							Sign up
						</button>
					</p>
				)}
			</div>
		);
	}

	return (
		<div className="w-full max-w-sm">
			<div className="flex flex-col gap-4">
				<div className="flex flex-col gap-2">
					<Button
						type="button"
						variant="outline"
						onClick={() => handleSocialSignIn("google")}
					>
						Continue with Google
					</Button>
					<Button
						type="button"
						variant="outline"
						onClick={() => handleSocialSignIn("github")}
					>
						Continue with GitHub
					</Button>
				</div>

				<div className="flex items-center gap-2">
					<Separator className="flex-1" />
					<span className="text-xs text-muted-foreground">OR</span>
					<Separator className="flex-1" />
				</div>

				{feedback ? (
					<div
						role={feedback.kind === "error" ? "alert" : "status"}
						aria-live="polite"
						className={cn(
							"rounded-3xl px-3 py-2 text-sm leading-5 ring-1",
							feedback.kind === "error"
								? "bg-destructive/5 text-destructive ring-destructive/15"
								: "bg-muted/35 text-muted-foreground ring-border/60",
						)}
					>
						{feedback.message}
					</div>
				) : null}

				{showEmailForm ? (
					<form onSubmit={handleSubmit} className="flex flex-col gap-4">
						<div className="flex flex-col gap-2">
							<Label htmlFor="email">Email</Label>
							<Input
								id="email"
								name="email"
								type="email"
								autoComplete="email"
								placeholder="you@example.com"
								value={email}
								onChange={(e) => {
									setEmail(e.target.value);
									if (feedback) {
										setFeedback(null);
									}
								}}
								required
							/>
						</div>
						<div className="flex flex-col gap-2">
							<div className="flex items-center justify-between gap-3">
								<Label htmlFor="password">Password</Label>
								<Button
									type="button"
									variant="ghost"
									size="xs"
									onClick={() => {
										void handleRequestPasswordReset();
									}}
									disabled={requestingPasswordReset}
									className="text-muted-foreground hover:text-foreground"
								>
									{requestingPasswordReset
										? "Sending link..."
										: feedback?.kind === "success"
											? "Resend link"
											: "Forgot password?"}
								</Button>
							</div>
							<Input
								id="password"
								name="password"
								type="password"
								autoComplete="current-password"
								value={password}
								onChange={(e) => {
									setPassword(e.target.value);
									if (feedback?.kind === "error") {
										setFeedback(null);
									}
								}}
								required
							/>
						</div>
						<Button type="submit" disabled={loading || requestingPasswordReset}>
							{loading ? "Signing in..." : "Sign in"}
						</Button>
					</form>
				) : (
					<Button
						type="button"
						variant="outline"
						onClick={() => {
							setShowEmailForm(true);
						}}
					>
						Use email and password instead
					</Button>
				)}

				<p className="text-center text-xs text-muted-foreground">
					By signing up, you agree to our{" "}
					<a
						href="https://rudel.ai/terms"
						target="_blank"
						rel="noopener noreferrer"
						className="underline underline-offset-4 hover:text-primary"
					>
						Terms of Service
					</a>{" "}
					and{" "}
					<a
						href="https://obsessiondb.com/privacy"
						target="_blank"
						rel="noopener noreferrer"
						className="underline underline-offset-4 hover:text-primary"
					>
						Privacy Policy
					</a>
				</p>

				{hideSwitchPrompt ? null : (
					<p className="text-center text-sm text-muted-foreground">
						Don&apos;t have an account?{" "}
						<button
							type="button"
							onClick={() => {
								trackAuthenticationAction({
									actionName: "open_signup",
									sourceComponent: "login_form",
								});
								onSwitchToSignup();
							}}
							className="underline underline-offset-4 hover:text-primary"
						>
							Sign up
						</button>
					</p>
				)}
			</div>
		</div>
	);
}
