import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { Button } from "@/app/ui/button";
import { Input } from "@/app/ui/input";
import { Label } from "@/app/ui/label";
import { Separator } from "@/app/ui/separator";
import { useAnalyticsTracking } from "@/features/analytics/tracking/useAnalyticsTracking";
import {
	WrappedPrimaryAction,
	WrappedSecondaryAction,
} from "@/features/wrapped/actions";
import { authClient, refreshAuthClientState } from "@/lib/auth-client";
import { formatAuthErrorMessage } from "@/lib/auth-error-message";
import { cn } from "@/lib/utils";
import { navigateToDestination } from "./auth-navigation";
import {
	clearPendingSignupRedirect,
	getEmailLoginSuccessDestination,
	getSocialLoginRedirectOptions,
} from "./auth-route-utils";
import {
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
import {
	getWrappedAuthSceneItemMotion,
	getWrappedAuthSceneMotion,
	getWrappedAuthSceneShellMotion,
	type WrappedAuthScene,
} from "./wrapped-auth-motion";

type FeedbackState = {
	kind: "error" | "success";
	message: string;
} | null;

interface LoginFormProps {
	hideSwitchPrompt?: boolean;
	onEmailPasswordPreviewSubmit?: (email: string) => void;
	onSwitchToSignup: () => void;
	variant?: "default" | "wrapped-story";
}

export function LoginForm(props: LoginFormProps) {
	const {
		hideSwitchPrompt = false,
		onEmailPasswordPreviewSubmit,
		onSwitchToSignup,
		variant = "default",
	} = props;
	const [email, setEmail] = useState("");
	const [emailCode, setEmailCode] = useState("");
	const [emailCodeStage, setEmailCodeStage] = useState<EmailCodeStage>("email");
	const [feedback, setFeedback] = useState<FeedbackState>(null);
	const [loading, setLoading] = useState(false);
	const [showEmailForm, setShowEmailForm] = useState(false);
	const [wrappedScene, setWrappedScene] = useState<WrappedAuthScene>("choice");
	const { trackAuthenticationAction } = useAnalyticsTracking({
		pageName: "login",
	});
	const isWrappedStory = variant === "wrapped-story";
	const usesWrappedEmailPreview =
		isWrappedStory && onEmailPasswordPreviewSubmit !== undefined;
	const hasValidEmail = isValidAuthEmail(email);
	const hasValidEmailCode = isValidEmailCode(emailCode);
	const shouldReduceMotion = useReducedMotion() ?? false;
	const [hasMountedWrappedScene, setHasMountedWrappedScene] = useState(false);
	const wrappedSceneShellMotion =
		getWrappedAuthSceneShellMotion(shouldReduceMotion);
	const wrappedSceneMotion = getWrappedAuthSceneMotion(shouldReduceMotion);

	useEffect(() => {
		if (!isWrappedStory) {
			return;
		}

		setHasMountedWrappedScene(true);
	}, [isWrappedStory]);

	function getWrappedSceneItemMotion(delay = 0) {
		return getWrappedAuthSceneItemMotion(shouldReduceMotion, delay);
	}

	function getWrappedSceneInitialState<T>(initial: T): T | false {
		return hasMountedWrappedScene ? initial : false;
	}

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setFeedback(null);
		const loginEmail = normalizeAuthEmail(email);

		if (usesWrappedEmailPreview) {
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

			onEmailPasswordPreviewSubmit(loginEmail);
			return;
		}

		if (emailCodeStage === "email") {
			await sendEmailCode();
			return;
		}

		if (!hasValidEmailCode) {
			const codeField = document.getElementById("login-code");
			if (codeField instanceof HTMLInputElement) {
				codeField.focus();
			}
			setFeedback({
				kind: "error",
				message: "Enter the 6-digit code from your email.",
			});
			return;
		}

		const successDestination = getEmailLoginSuccessDestination();
		trackAuthenticationAction({
			actionName: "sign_in",
			sourceComponent: "login_form",
			authMethod: "email_otp",
		});
		clearPendingSignupRedirect();
		setLoading(true);
		const { error } = await authClient.signIn.emailOtp({
			email: loginEmail,
			otp: emailCode,
		});
		setLoading(false);
		if (error) {
			setFeedback({
				kind: "error",
				message: formatAuthErrorMessage({
					error,
					fallbackMessage: "Sign in failed",
					operation: "email code sign in",
				}),
			});
			return;
		}

		refreshAuthClientState();
		navigateToDestination(successDestination);
	}

	async function sendEmailCode() {
		setFeedback(null);
		const loginEmail = normalizeAuthEmail(email);

		if (!hasValidEmail) {
			const emailField = document.getElementById(
				isWrappedStory ? "login-email" : "email",
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

		trackAuthenticationAction({
			actionName: "request_email_code",
			sourceComponent: "login_form",
			authMethod: "email_otp",
		});
		setLoading(true);
		const { error } = await authClient.emailOtp.sendVerificationOtp({
			email: loginEmail,
			type: "sign-in",
		});
		setLoading(false);

		if (error) {
			setFeedback({
				kind: "error",
				message: formatAuthErrorMessage({
					error,
					fallbackMessage: "Could not send the email code",
					operation: "email code request",
				}),
			});
			return;
		}

		setEmail(loginEmail);
		setEmailCode("");
		setEmailCodeStage("code");
		setWrappedScene("credentials");
		setFeedback({
			kind: "success",
			message: `We sent a 6-digit code to ${loginEmail}.`,
		});
	}

	async function handleSocialSignIn(provider: "google" | "github") {
		setFeedback(null);
		trackAuthenticationAction({
			actionName: "sign_in",
			sourceComponent: "login_form",
			authMethod: provider,
		});
		const { callbackURL, newUserCallbackURL } = getSocialLoginRedirectOptions();
		recordOAuthRedirectStart({
			callbackURL,
			newUserCallbackURL,
			provider,
			source: "login_form",
		});
		const { error } = await authClient.signIn.social({
			provider,
			callbackURL,
			newUserCallbackURL,
		});
		recordOAuthRedirectResult({
			errorMessage: error?.message,
			provider,
			source: "login_form",
		});
		if (error) {
			setFeedback({
				kind: "error",
				message: formatAuthErrorMessage({
					error,
					fallbackMessage: `Sign in with ${provider} failed`,
					operation: `${provider} social sign in`,
				}),
			});
		}
	}

	function renderWrappedFeedback(extraClassName?: string) {
		if (!feedback) {
			return null;
		}

		return (
			<div
				role={feedback.kind === "error" ? "alert" : "status"}
				aria-live="polite"
				className={cn(
					"mymind-wrapped-auth-form__feedback",
					extraClassName,
					feedback.kind === "error" ? "is-error" : "is-success",
				)}
			>
				{feedback.message}
			</div>
		);
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

	function renderWrappedChoiceScene() {
		return (
			<motion.div
				key="choice"
				animate={wrappedSceneShellMotion.animate}
				className="mymind-wrapped-auth-form__scene mymind-wrapped-auth-form__scene--choice"
				exit={wrappedSceneShellMotion.exit}
				initial={getWrappedSceneInitialState(wrappedSceneShellMotion.initial)}
				transition={wrappedSceneShellMotion.transition}
			>
				<div className="mymind-wrapped-auth-form__choice-footer">
					<div className="mymind-wrapped-auth-form__social">
						<motion.div
							animate={getWrappedSceneItemMotion().animate}
							className="mymind-wrapped-auth-form__action-item"
							exit={getWrappedSceneItemMotion().exit}
							initial={getWrappedSceneInitialState(
								getWrappedSceneItemMotion().initial,
							)}
							transition={getWrappedSceneItemMotion().transition}
						>
							<WrappedSecondaryAction
								onClick={() => handleSocialSignIn("google")}
							>
								Log in with Google
							</WrappedSecondaryAction>
						</motion.div>
						<motion.div
							animate={getWrappedSceneItemMotion(0.04).animate}
							className="mymind-wrapped-auth-form__action-item"
							exit={getWrappedSceneItemMotion(0.04).exit}
							initial={getWrappedSceneInitialState(
								getWrappedSceneItemMotion(0.04).initial,
							)}
							transition={getWrappedSceneItemMotion(0.04).transition}
						>
							<WrappedSecondaryAction
								onClick={() => handleSocialSignIn("github")}
							>
								Log in with GitHub
							</WrappedSecondaryAction>
						</motion.div>
					</div>

					<motion.div
						animate={getWrappedSceneItemMotion(0.08).animate}
						className="mymind-wrapped-auth-form__divider"
						exit={getWrappedSceneItemMotion(0.08).exit}
						initial={getWrappedSceneInitialState(
							getWrappedSceneItemMotion(0.08).initial,
						)}
						transition={getWrappedSceneItemMotion(0.08).transition}
					>
						<Separator className="mymind-wrapped-auth-form__divider-line" />
						<span className="mymind-wrapped-auth-form__divider-label">OR</span>
						<Separator className="mymind-wrapped-auth-form__divider-line" />
					</motion.div>

					<motion.div
						animate={getWrappedSceneItemMotion(0.12).animate}
						className="mymind-wrapped-auth-form__action-item"
						exit={getWrappedSceneItemMotion(0.12).exit}
						initial={getWrappedSceneInitialState(
							getWrappedSceneItemMotion(0.12).initial,
						)}
						transition={getWrappedSceneItemMotion(0.12).transition}
					>
						<WrappedPrimaryAction
							kind="button"
							onClick={handleOpenWrappedEmail}
							className="mymind-wrapped-auth-form__scene-action"
						>
							Log in with Email
						</WrappedPrimaryAction>
					</motion.div>

					{renderWrappedFeedback()}
				</div>
			</motion.div>
		);
	}

	function renderWrappedEmailCodeScene() {
		const isCodeStep = wrappedScene === "credentials";

		return (
			<motion.div
				key="email-code"
				animate={wrappedSceneShellMotion.animate}
				className={cn(
					"mymind-wrapped-auth-form__scene mymind-wrapped-auth-form__scene--email",
					isCodeStep ? "mymind-wrapped-auth-form__scene--credentials" : null,
				)}
				exit={wrappedSceneShellMotion.exit}
				initial={getWrappedSceneInitialState(wrappedSceneShellMotion.initial)}
				transition={wrappedSceneShellMotion.transition}
			>
				<form
					noValidate
					onSubmit={(event) => {
						if (!isCodeStep) {
							event.preventDefault();
							handleContinueWrappedEmail();
							return;
						}

						void handleSubmit(event);
					}}
					className="mymind-wrapped-auth-form__scene-form"
				>
					<motion.div
						animate={wrappedSceneMotion.enter}
						className="mymind-wrapped-auth-form__scene-fields"
						exit={wrappedSceneMotion.exit}
						initial={getWrappedSceneInitialState(wrappedSceneMotion.initial)}
						transition={wrappedSceneMotion.transition}
					>
						{isCodeStep ? null : (
							<motion.div
								layout="position"
								className="mymind-wrapped-auth-form__field"
								transition={wrappedSceneMotion.transition}
							>
								<Input
									aria-label="Email"
									autoComplete="email"
									autoFocus
									id="login-email"
									name="email"
									type="email"
									placeholder="you@example.com"
									value={email}
									onChange={(e) => {
										setEmail(e.target.value);
										if (feedback) {
											setFeedback(null);
										}
									}}
									className="mymind-wrapped-auth-form__input"
									required
								/>
							</motion.div>
						)}
						<AnimatePresence initial={false}>
							{isCodeStep ? (
								<motion.div
									key="email-code"
									animate={wrappedSceneMotion.enter}
									className="mymind-wrapped-auth-form__field mymind-wrapped-auth-form__code-field"
									exit={wrappedSceneMotion.exit}
									initial={wrappedSceneMotion.initial}
									transition={wrappedSceneMotion.transition}
								>
									<Input
										autoFocus
										aria-label="Email code"
										autoComplete="one-time-code"
										id="login-code"
										inputMode="numeric"
										name="code"
										pattern="[0-9]*"
										placeholder="123456"
										value={emailCode}
										onChange={(e) => {
											setEmailCode(sanitizeEmailCodeInput(e.target.value));
											if (feedback?.kind === "error") {
												setFeedback(null);
											}
										}}
										className="mymind-wrapped-auth-form__input mymind-wrapped-auth-step__otp-input"
										required
									/>
									{renderWrappedFeedback(
										"mymind-wrapped-auth-form__feedback--code-note",
									)}
								</motion.div>
							) : null}
						</AnimatePresence>
					</motion.div>

					{isCodeStep ? null : renderWrappedFeedback()}

					<motion.div
						animate={getWrappedSceneItemMotion(0.08).animate}
						className="mymind-wrapped-auth-form__action-item mymind-wrapped-auth-form__action-item--primary"
						exit={getWrappedSceneItemMotion(0.08).exit}
						initial={getWrappedSceneInitialState(
							getWrappedSceneItemMotion(0.08).initial,
						)}
						transition={getWrappedSceneItemMotion(0.08).transition}
					>
						<WrappedPrimaryAction
							kind="button"
							type="submit"
							disabled={
								isCodeStep && !usesWrappedEmailPreview ? loading : false
							}
							className="mymind-wrapped-auth-form__scene-action"
						>
							{isCodeStep
								? loading
									? "Verifying..."
									: "Verify code"
								: "Continue"}
						</WrappedPrimaryAction>
					</motion.div>

					{isCodeStep ? (
						<motion.div
							animate={getWrappedSceneItemMotion(0.1).animate}
							className="mymind-wrapped-auth-form__action-item"
							exit={getWrappedSceneItemMotion(0.1).exit}
							initial={getWrappedSceneInitialState(
								getWrappedSceneItemMotion(0.1).initial,
							)}
							transition={getWrappedSceneItemMotion(0.1).transition}
						>
							<button
								type="button"
								onClick={() => {
									setFeedback(null);
									setEmailCode("");
									setEmailCodeStage("email");
									setWrappedScene("email");
								}}
								className="mymind-wrapped-auth-form__scene-link"
							>
								Use a different email
							</button>
						</motion.div>
					) : (
						<motion.div
							animate={getWrappedSceneItemMotion(0.1).animate}
							className="mymind-wrapped-auth-form__action-item"
							exit={getWrappedSceneItemMotion(0.1).exit}
							initial={getWrappedSceneInitialState(
								getWrappedSceneItemMotion(0.1).initial,
							)}
							transition={getWrappedSceneItemMotion(0.1).transition}
						>
							<button
								type="button"
								onClick={handleReturnToWrappedChoice}
								className="mymind-wrapped-auth-form__scene-link"
							>
								Use another method
							</button>
						</motion.div>
					)}
				</form>
			</motion.div>
		);
	}

	if (isWrappedStory) {
		return (
			<div
				className="mymind-wrapped-auth-form"
				data-email-auth-stage={wrappedScene}
			>
				<div className="mymind-wrapped-auth-form__scene-shell">
					<AnimatePresence initial={false} mode="wait">
						{wrappedScene === "choice"
							? renderWrappedChoiceScene()
							: renderWrappedEmailCodeScene()}
					</AnimatePresence>
				</div>
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
						Log in with Google
					</Button>
					<Button
						type="button"
						variant="outline"
						onClick={() => handleSocialSignIn("github")}
					>
						Log in with GitHub
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
							"whitespace-pre-line",
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
								disabled={emailCodeStage === "code"}
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
						{emailCodeStage === "code" ? (
							<div className="flex flex-col gap-2">
								<Label htmlFor="login-code">Email code</Label>
								<Input
									autoComplete="one-time-code"
									id="login-code"
									inputMode="numeric"
									name="code"
									pattern="[0-9]*"
									placeholder="123456"
									value={emailCode}
									onChange={(e) => {
										setEmailCode(sanitizeEmailCodeInput(e.target.value));
										if (feedback?.kind === "error") {
											setFeedback(null);
										}
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
						Log in with Email
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
