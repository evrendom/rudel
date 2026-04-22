import { useState } from "react";
import { Button } from "@/app/ui/button";
import { Input } from "@/app/ui/input";
import { Label } from "@/app/ui/label";
import { Separator } from "@/app/ui/separator";
import { useAnalyticsTracking } from "@/features/analytics/tracking/useAnalyticsTracking";
import { authClient } from "@/lib/auth-client";
import {
	captureSignUpFailed,
	normalizeWebErrorCode,
} from "@/lib/product-analytics";
import { cn } from "@/lib/utils";
import { navigateToDestination } from "./auth-navigation";
import {
	clearPendingSignupRedirect,
	getEmailSignupSuccessDestination,
	getEmailSignupVerificationCallbackURL,
	getSocialSignupRedirectOptions,
	primePendingSignupRedirect,
} from "./auth-route-utils";
import {
	recordOAuthRedirectResult,
	recordOAuthRedirectStart,
} from "./oauth-debug";

function getSignupContext() {
	const params = new URLSearchParams(window.location.search);
	const redirect = params.get("redirect");
	const userCode = params.get("user_code");
	const path = window.location.pathname;

	const entryPoint:
		| "homepage"
		| "cli_device_login"
		| "accept_invitation"
		| "direct" = userCode
		? "cli_device_login"
		: path.startsWith("/invitation/") || redirect?.includes("/invitation/")
			? "accept_invitation"
			: path === "/" || path === ""
				? "homepage"
				: "direct";

	return {
		entryPoint,
		isInviteFlow:
			path.startsWith("/invitation/") ||
			redirect?.includes("/invitation/") ||
			false,
	};
}

interface SignupFormProps {
	hideSwitchPrompt?: boolean;
	onSwitchToLogin: () => void;
	variant?: "default" | "wrapped-story";
}

export function SignupForm(props: SignupFormProps) {
	const {
		hideSwitchPrompt = false,
		onSwitchToLogin,
		variant = "default",
	} = props;
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState("");
	const [loading, setLoading] = useState(false);
	const [showEmailForm, setShowEmailForm] = useState(false);
	const { trackAuthenticationAction } = useAnalyticsTracking({
		pageName: "signup",
	});
	const isWrappedStory = variant === "wrapped-story";
	const hasValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

	function handleRevealEmailSignup() {
		setError("");
		if (!hasValidEmail) {
			const emailField = document.getElementById("signup-email");
			if (emailField instanceof HTMLInputElement) {
				emailField.focus();
			}
			setError("Enter a valid email to continue.");
			return;
		}
		setShowEmailForm(true);
	}

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setError("");
		setLoading(true);
		const successDestination = getEmailSignupSuccessDestination();
		const verificationCallbackURL = getEmailSignupVerificationCallbackURL();
		primePendingSignupRedirect(successDestination);
		let didNavigate = false;
		const navigateAfterSignup = () => {
			if (didNavigate) {
				return;
			}
			didNavigate = true;
			navigateToDestination(successDestination);
		};
		const signupContext = getSignupContext();
		trackAuthenticationAction({
			actionName: "sign_up",
			sourceComponent: "signup_form",
			authMethod: "email_password",
			entrypoint: signupContext.entryPoint,
		});
		const { error } = await authClient.signUp.email({
			name,
			email,
			password,
			callbackURL: verificationCallbackURL,
			fetchOptions: {
				disableSignal: true,
				onSuccess: () => {
					navigateAfterSignup();
				},
			},
		});
		setLoading(false);
		if (error) {
			clearPendingSignupRedirect();
			captureSignUpFailed({
				signup_method: "email_password",
				failure_stage: "form_submit",
				error_code: normalizeWebErrorCode(error),
				is_invite_flow: signupContext.isInviteFlow || undefined,
				entry_point: signupContext.entryPoint,
			});
			setError(error.message ?? "Sign up failed");
			return;
		}

		// Better Auth's signUp.email callbackURL is only used for email verification in 1.5.4.
		navigateAfterSignup();
	}

	async function handleSocialSignIn(provider: "google" | "github") {
		setError("");
		const { callbackURL, newUserCallbackURL } =
			getSocialSignupRedirectOptions();
		const signupContext = getSignupContext();
		trackAuthenticationAction({
			actionName: "sign_up",
			sourceComponent: "signup_form",
			authMethod: provider,
			entrypoint: signupContext.entryPoint,
		});
		recordOAuthRedirectStart({
			callbackURL,
			newUserCallbackURL,
			provider,
			source: "signup_form",
		});
		const { error } = await authClient.signIn.social({
			provider,
			callbackURL,
			newUserCallbackURL,
		});
		recordOAuthRedirectResult({
			errorMessage: error?.message,
			provider,
			source: "signup_form",
		});
		if (error) {
			captureSignUpFailed({
				signup_method: provider,
				failure_stage: "provider_redirect",
				error_code: normalizeWebErrorCode(error),
				is_invite_flow: signupContext.isInviteFlow || undefined,
				entry_point: signupContext.entryPoint,
			});
			setError(error.message ?? `Sign up with ${provider} failed`);
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

				{error ? (
					<p
						role="alert"
						className={cn("mymind-wrapped-auth-form__feedback", "is-error")}
					>
						{error}
					</p>
				) : null}

				<div className="mymind-wrapped-auth-form__email-row">
					<Input
						aria-label="Email"
						id="signup-email"
						type="email"
						placeholder="you@example.com"
						value={email}
						onChange={(e) => setEmail(e.target.value)}
						className="mymind-wrapped-auth-form__email-input h-11"
						required
					/>
					{hasValidEmail ? (
						<Button
							type="button"
							variant="outline"
							size="sm"
							className="mymind-wrapped-auth-form__email-button"
							onClick={handleRevealEmailSignup}
						>
							Continue
						</Button>
					) : null}
				</div>

				{showEmailForm ? (
					<form onSubmit={handleSubmit} className="flex flex-col gap-4">
						<div className="mymind-wrapped-auth-form__field">
							<Label className="mymind-wrapped-auth-form__label" htmlFor="name">
								Name
							</Label>
							<Input
								id="name"
								type="text"
								placeholder="Your name"
								value={name}
								onChange={(e) => setName(e.target.value)}
								className="mymind-wrapped-auth-form__input"
								required
							/>
						</div>
						<div className="mymind-wrapped-auth-form__field">
							<Label
								className="mymind-wrapped-auth-form__label"
								htmlFor="password"
							>
								Password
							</Label>
							<Input
								id="password"
								type="password"
								value={password}
								onChange={(e) => setPassword(e.target.value)}
								className="mymind-wrapped-auth-form__input"
								required
								minLength={8}
							/>
						</div>
						<Button
							type="submit"
							disabled={loading}
							className="mymind-wrapped-entry-action h-11 rounded-full px-7 [font-family:var(--app-font-heading)] text-[1.0625rem] font-semibold"
						>
							{loading ? "Creating account..." : "Sign up"}
						</Button>
					</form>
				) : null}

				<p className="mymind-wrapped-auth-form__terms">
					By signing up, you agree to our{" "}
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
						Already have an account?{" "}
						<button
							type="button"
							onClick={() => {
								trackAuthenticationAction({
									actionName: "open_login",
									sourceComponent: "signup_form",
								});
								onSwitchToLogin();
							}}
							className="mymind-wrapped-auth-form__switch-link"
						>
							Sign in
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

				{error ? <p className="text-sm text-destructive">{error}</p> : null}

				{showEmailForm ? (
					<form onSubmit={handleSubmit} className="flex flex-col gap-4">
						<div className="flex flex-col gap-2">
							<Label htmlFor="name">Name</Label>
							<Input
								id="name"
								type="text"
								placeholder="Your name"
								value={name}
								onChange={(e) => setName(e.target.value)}
								required
							/>
						</div>
						<div className="flex flex-col gap-2">
							<Label htmlFor="email">Email</Label>
							<Input
								id="email"
								type="email"
								placeholder="you@example.com"
								value={email}
								onChange={(e) => setEmail(e.target.value)}
								required
							/>
						</div>
						<div className="flex flex-col gap-2">
							<Label htmlFor="password">Password</Label>
							<Input
								id="password"
								type="password"
								value={password}
								onChange={(e) => setPassword(e.target.value)}
								required
								minLength={8}
							/>
						</div>
						<Button type="submit" disabled={loading}>
							{loading ? "Creating account..." : "Sign up"}
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
						Continue with email instead
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
						Already have an account?{" "}
						<button
							type="button"
							onClick={() => {
								trackAuthenticationAction({
									actionName: "open_login",
									sourceComponent: "signup_form",
								});
								onSwitchToLogin();
							}}
							className="underline underline-offset-4 hover:text-primary"
						>
							Sign in
						</button>
					</p>
				)}
			</div>
		</div>
	);
}
