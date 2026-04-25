import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { Button } from "@/app/ui/button";
import { Input } from "@/app/ui/input";
import { Label } from "@/app/ui/label";
import { Separator } from "@/app/ui/separator";
import { useAnalyticsTracking } from "@/features/analytics/tracking/useAnalyticsTracking";
import { authClient, refreshAuthClientState } from "@/lib/auth-client";
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
		onEmailPasswordPreviewSubmit,
		onSwitchToSignup,
		variant = "default",
	} = props;
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [feedback, setFeedback] = useState<FeedbackState>(null);
	const [loading, setLoading] = useState(false);
	const [requestingPasswordReset, setRequestingPasswordReset] = useState(false);
	const [showEmailForm, setShowEmailForm] = useState(false);
	const [wrappedScene, setWrappedScene] = useState<WrappedAuthScene>("choice");
	const { trackAuthenticationAction } = useAnalyticsTracking({
		pageName: "login",
	});
	const isWrappedStory = variant === "wrapped-story";
	const usesWrappedEmailPreview =
		isWrappedStory && onEmailPasswordPreviewSubmit !== undefined;
	const hasValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
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

			if (!password.trim()) {
				const passwordField = document.getElementById("password");
				if (passwordField instanceof HTMLInputElement) {
					passwordField.focus();
				}
				setFeedback({
					kind: "error",
					message: "Enter a password to continue.",
				});
				return;
			}

			onEmailPasswordPreviewSubmit(email.trim());
			return;
		}

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

		refreshAuthClientState();
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

	function renderWrappedFeedback() {
		if (!feedback) {
			return null;
		}

		return (
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
		);
	}

	function handleOpenWrappedEmail() {
		setFeedback(null);
		setPassword("");
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
		setPassword("");
		setWrappedScene("credentials");
	}

	function handleReturnToWrappedChoice() {
		setFeedback(null);
		setPassword("");
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
							<Button
								type="button"
								variant="outline"
								className="mymind-wrapped-secondary-action rounded-full"
								onClick={() => handleSocialSignIn("google")}
							>
								Log in with Google
							</Button>
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
							<Button
								type="button"
								variant="outline"
								className="mymind-wrapped-secondary-action rounded-full"
								onClick={() => handleSocialSignIn("github")}
							>
								Log in with GitHub
							</Button>
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
						<Button
							type="button"
							onClick={handleOpenWrappedEmail}
							className="mymind-wrapped-entry-action mymind-wrapped-auth-form__scene-action h-11 rounded-full px-7 [font-family:var(--app-font-heading)] text-[1.0625rem] font-semibold"
						>
							Log in with Email
						</Button>
					</motion.div>

					{renderWrappedFeedback()}
				</div>
			</motion.div>
		);
	}

	function renderWrappedEmailPasswordScene() {
		const isPasswordStep = wrappedScene === "credentials";

		return (
			<motion.div
				key="email-password"
				animate={wrappedSceneShellMotion.animate}
				className={cn(
					"mymind-wrapped-auth-form__scene mymind-wrapped-auth-form__scene--email",
					isPasswordStep
						? "mymind-wrapped-auth-form__scene--credentials"
						: null,
				)}
				exit={wrappedSceneShellMotion.exit}
				initial={getWrappedSceneInitialState(wrappedSceneShellMotion.initial)}
				transition={wrappedSceneShellMotion.transition}
			>
				<form
					noValidate
					onSubmit={(event) => {
						if (!isPasswordStep) {
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
						<motion.div
							layout="position"
							className="mymind-wrapped-auth-form__field"
							transition={wrappedSceneMotion.transition}
						>
							<Input
								aria-label="Email"
								autoComplete="email"
								autoFocus={!isPasswordStep}
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
						<AnimatePresence initial={false}>
							{isPasswordStep ? (
								<motion.div
									key="password"
									animate={wrappedSceneMotion.enter}
									className="mymind-wrapped-auth-form__field"
									exit={wrappedSceneMotion.exit}
									initial={wrappedSceneMotion.initial}
									transition={wrappedSceneMotion.transition}
								>
									<Input
										autoFocus
										aria-label="Password"
										id="password"
										name="password"
										type="password"
										autoComplete="current-password"
										placeholder="Password"
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
									{usesWrappedEmailPreview ? null : (
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
									)}
								</motion.div>
							) : null}
						</AnimatePresence>
					</motion.div>

					{renderWrappedFeedback()}

					<motion.div
						animate={getWrappedSceneItemMotion(0.08).animate}
						className="mymind-wrapped-auth-form__action-item mymind-wrapped-auth-form__action-item--primary"
						exit={getWrappedSceneItemMotion(0.08).exit}
						initial={getWrappedSceneInitialState(
							getWrappedSceneItemMotion(0.08).initial,
						)}
						transition={getWrappedSceneItemMotion(0.08).transition}
					>
						<Button
							type={isPasswordStep ? "submit" : "button"}
							onClick={isPasswordStep ? undefined : handleContinueWrappedEmail}
							disabled={
								isPasswordStep && !usesWrappedEmailPreview
									? loading || requestingPasswordReset
									: false
							}
							className="mymind-wrapped-entry-action mymind-wrapped-auth-form__scene-action h-11 rounded-full px-7 [font-family:var(--app-font-heading)] text-[1.0625rem] font-semibold"
						>
							{isPasswordStep
								? loading
									? "Signing in..."
									: "Sign in"
								: "Continue"}
						</Button>
					</motion.div>

					{isPasswordStep ? null : (
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
							: renderWrappedEmailPasswordScene()}
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
