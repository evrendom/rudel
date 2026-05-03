import { type FormEvent, useState } from "react";
import { Button } from "@/app/ui/button";
import { Input } from "@/app/ui/input";
import { Label } from "@/app/ui/label";
import { Separator } from "@/app/ui/separator";
import { useAnalyticsTracking } from "@/features/analytics/tracking/useAnalyticsTracking";
import { authClient, refreshAuthClientState } from "@/lib/auth-client";
import { getInitialSignupName } from "@/lib/auth-signup-name";
import {
	captureSignUpFailed,
	normalizeWebErrorCode,
} from "@/lib/product-analytics";
import { cn } from "@/lib/utils";
import { navigateToDestination } from "./auth-navigation";
import {
	clearPendingSignupRedirect,
	getEmailSignupSuccessDestination,
	getSocialSignupRedirectOptions,
	primePendingSignupRedirect,
} from "./auth-route-utils";
import {
	type EmailAuthFeedback,
	type EmailCodeStage,
	isValidAuthEmail,
	isValidEmailCode,
	normalizeAuthEmail,
	sanitizeEmailCodeInput,
} from "./email-code-auth";
import {
	recordOAuthRedirectResult,
	recordOAuthRedirectStart,
} from "./oauth-debug";
import type { WrappedAuthScene } from "./wrapped-auth-motion";
import { WrappedEmailCodeAuth } from "./wrapped-email-code-auth";

const SIGNUP_CODE_INPUT_ID = "signup-code";
const WRAPPED_SIGNUP_EMAIL_INPUT_ID = "signup-email";
const WRAPPED_SIGNUP_AUTH_LABELS = {
	email: "Create account with Email",
	github: "Create account with GitHub",
	google: "Create account with Google",
};

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
	onEmailPasswordPreviewSubmit?: (email: string) => void;
	onSwitchToLogin: () => void;
	variant?: "default" | "wrapped-story";
}

export function SignupForm(props: SignupFormProps) {
	const {
		hideSwitchPrompt = false,
		onEmailPasswordPreviewSubmit,
		onSwitchToLogin,
		variant = "default",
	} = props;
	const [email, setEmail] = useState("");
	const [emailCode, setEmailCode] = useState("");
	const [emailCodeStage, setEmailCodeStage] = useState<EmailCodeStage>("email");
	const [feedback, setFeedback] = useState<EmailAuthFeedback>(null);
	const [loading, setLoading] = useState(false);
	const [showEmailForm, setShowEmailForm] = useState(false);
	const [wrappedScene, setWrappedScene] = useState<WrappedAuthScene>("choice");
	const { trackAuthenticationAction } = useAnalyticsTracking({
		pageName: "signup",
	});
	const isWrappedStory = variant === "wrapped-story";
	const usesWrappedEmailPreview =
		isWrappedStory && onEmailPasswordPreviewSubmit !== undefined;
	const hasValidEmail = isValidAuthEmail(email);
	const hasValidEmailCode = isValidEmailCode(emailCode);

	async function handleSubmit(e: FormEvent) {
		e.preventDefault();
		setFeedback(null);
		const signupEmail = normalizeAuthEmail(email);

		if (usesWrappedEmailPreview) {
			if (!hasValidEmail) {
				const emailField = document.getElementById(
					WRAPPED_SIGNUP_EMAIL_INPUT_ID,
				);
				if (emailField instanceof HTMLInputElement) {
					emailField.focus();
				}
				setFeedback({
					kind: "error",
					message: "Enter a valid email to continue.",
				});
				return;
			}

			onEmailPasswordPreviewSubmit(signupEmail);
			return;
		}

		if (emailCodeStage === "email") {
			await sendEmailCode();
			return;
		}

		if (!hasValidEmailCode) {
			const codeField = document.getElementById(SIGNUP_CODE_INPUT_ID);
			if (codeField instanceof HTMLInputElement) {
				codeField.focus();
			}
			setFeedback({
				kind: "error",
				message: "Enter the 6-digit code from your email.",
			});
			return;
		}

		setLoading(true);
		const successDestination = getEmailSignupSuccessDestination();
		primePendingSignupRedirect(successDestination);
		const signupContext = getSignupContext();
		trackAuthenticationAction({
			actionName: "sign_up",
			sourceComponent: "signup_form",
			authMethod: "email_otp",
			entrypoint: signupContext.entryPoint,
		});
		const { error } = await authClient.signIn.emailOtp({
			name: getInitialSignupName(signupEmail),
			email: signupEmail,
			otp: emailCode,
		});
		setLoading(false);
		if (error) {
			captureSignUpFailed({
				signup_method: "email_otp",
				failure_stage: "form_submit",
				error_code: normalizeWebErrorCode(error),
				is_invite_flow: signupContext.isInviteFlow || undefined,
				entry_point: signupContext.entryPoint,
			});
			setFeedback({
				kind: "error",
				message: error.message ?? "Sign up failed",
			});
			return;
		}

		refreshAuthClientState();
		navigateToDestination(successDestination);
	}

	async function sendEmailCode() {
		setFeedback(null);
		const signupEmail = normalizeAuthEmail(email);

		if (!hasValidEmail) {
			const emailField = document.getElementById(
				isWrappedStory ? WRAPPED_SIGNUP_EMAIL_INPUT_ID : "email",
			);
			if (emailField instanceof HTMLInputElement) {
				emailField.focus();
			}
			setFeedback({
				kind: "error",
				message: "Enter a valid email to continue.",
			});
			return;
		}

		const signupContext = getSignupContext();
		trackAuthenticationAction({
			actionName: "request_email_code",
			sourceComponent: "signup_form",
			authMethod: "email_otp",
			entrypoint: signupContext.entryPoint,
		});
		setLoading(true);
		const successDestination = getEmailSignupSuccessDestination();
		primePendingSignupRedirect(successDestination);
		const { error } = await authClient.emailOtp.sendVerificationOtp({
			email: signupEmail,
			type: "sign-in",
		});
		setLoading(false);

		if (error) {
			clearPendingSignupRedirect();
			captureSignUpFailed({
				signup_method: "email_otp",
				failure_stage: "form_submit",
				error_code: normalizeWebErrorCode(error),
				is_invite_flow: signupContext.isInviteFlow || undefined,
				entry_point: signupContext.entryPoint,
			});
			setFeedback({
				kind: "error",
				message: error.message ?? "Could not send the email code",
			});
			return;
		}

		setEmail(signupEmail);
		setEmailCode("");
		setEmailCodeStage("code");
		setWrappedScene("credentials");
		setFeedback({
			kind: "success",
			message: `Code sent to ${signupEmail}.`,
		});
	}

	async function handleSocialSignIn(provider: "google" | "github") {
		setFeedback(null);
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
			setFeedback({
				kind: "error",
				message: error.message ?? `Sign up with ${provider} failed`,
			});
		}
	}

	function handleEmailChange(value: string) {
		setEmail(value);
		if (feedback) {
			setFeedback(null);
		}
	}

	function handleEmailCodeChange(value: string) {
		setEmailCode(sanitizeEmailCodeInput(value));
		if (feedback?.kind === "error") {
			setFeedback(null);
		}
	}

	function handleOpenWrappedEmail() {
		setFeedback(null);
		setEmailCode("");
		setEmailCodeStage("email");
		setWrappedScene("email");
	}

	function handleContinueWrappedEmail() {
		setFeedback(null);
		if (!hasValidEmail) {
			const emailField = document.getElementById(WRAPPED_SIGNUP_EMAIL_INPUT_ID);
			if (emailField instanceof HTMLInputElement) {
				emailField.focus();
			}
			setFeedback({
				kind: "error",
				message: "Enter a valid email to continue.",
			});
			return;
		}
		if (usesWrappedEmailPreview) {
			onEmailPasswordPreviewSubmit?.(normalizeAuthEmail(email));
			return;
		}
		void sendEmailCode();
	}

	function handleReturnToWrappedChoice() {
		setFeedback(null);
		setEmailCode("");
		setEmailCodeStage("email");
		setWrappedScene("choice");
	}

	if (isWrappedStory) {
		return (
			<WrappedEmailCodeAuth
				codeInputId={SIGNUP_CODE_INPUT_ID}
				email={email}
				emailCode={emailCode}
				emailInputId={WRAPPED_SIGNUP_EMAIL_INPUT_ID}
				feedback={feedback}
				labels={WRAPPED_SIGNUP_AUTH_LABELS}
				loading={loading}
				onCodeChange={handleEmailCodeChange}
				onContinueEmail={handleContinueWrappedEmail}
				onEmailChange={handleEmailChange}
				onOpenEmail={handleOpenWrappedEmail}
				onReturnToChoice={handleReturnToWrappedChoice}
				onSocialSignIn={handleSocialSignIn}
				onSubmit={handleSubmit}
				onUseDifferentEmail={handleOpenWrappedEmail}
				scene={wrappedScene}
				usesPreviewSubmit={usesWrappedEmailPreview}
			/>
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
						Create account with Google
					</Button>
					<Button
						type="button"
						variant="outline"
						onClick={() => handleSocialSignIn("github")}
					>
						Create account with GitHub
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
								autoComplete="email"
								disabled={emailCodeStage === "code"}
								id="email"
								name="email"
								type="email"
								placeholder="you@example.com"
								value={email}
								onChange={(e) => {
									handleEmailChange(e.target.value);
								}}
								required
							/>
						</div>
						{emailCodeStage === "code" ? (
							<div className="flex flex-col gap-2">
								<Label htmlFor={SIGNUP_CODE_INPUT_ID}>Email code</Label>
								<Input
									autoComplete="one-time-code"
									id={SIGNUP_CODE_INPUT_ID}
									inputMode="numeric"
									name="code"
									pattern="[0-9]*"
									placeholder="123456"
									value={emailCode}
									onChange={(e) => {
										handleEmailCodeChange(e.target.value);
									}}
									required
								/>
								<Button
									type="button"
									variant="ghost"
									size="xs"
									onClick={() => {
										setFeedback(null);
										setEmailCode("");
										setEmailCodeStage("email");
									}}
									className="self-start px-0 text-muted-foreground hover:text-foreground"
								>
									Use a different email
								</Button>
							</div>
						) : null}
						<Button type="submit" disabled={loading}>
							{emailCodeStage === "code"
								? loading
									? "Verifying..."
									: "Verify code"
								: loading
									? "Sending code..."
									: "Send code"}
						</Button>
					</form>
				) : (
					<Button
						type="button"
						variant="outline"
						onClick={() => {
							setFeedback(null);
							setEmailCode("");
							setEmailCodeStage("email");
							setShowEmailForm(true);
						}}
					>
						Create account with Email
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
