import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
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
import {
	getWrappedAuthSceneItemMotion,
	getWrappedAuthSceneMotion,
	getWrappedAuthSceneShellMotion,
	type WrappedAuthScene,
} from "./wrapped-auth-motion";

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
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState("");
	const [loading, setLoading] = useState(false);
	const [showEmailForm, setShowEmailForm] = useState(false);
	const [wrappedScene, setWrappedScene] = useState<WrappedAuthScene>("choice");
	const { trackAuthenticationAction } = useAnalyticsTracking({
		pageName: "signup",
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
		setError("");

		if (usesWrappedEmailPreview) {
			if (!hasValidEmail) {
				const emailField = document.getElementById("signup-email");
				if (emailField instanceof HTMLInputElement) {
					emailField.focus();
				}
				setError("Enter a valid email to continue.");
				return;
			}

			if (password.length < 8) {
				const passwordField = document.getElementById("password");
				if (passwordField instanceof HTMLInputElement) {
					passwordField.focus();
				}
				setError("Use at least 8 characters for the password.");
				return;
			}

			onEmailPasswordPreviewSubmit(email.trim());
			return;
		}

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

	function renderWrappedFeedback() {
		if (!error) {
			return null;
		}

		return (
			<p
				role="alert"
				className={cn("mymind-wrapped-auth-form__feedback", "is-error")}
			>
				{error}
			</p>
		);
	}

	function handleOpenWrappedEmail() {
		setError("");
		setPassword("");
		setWrappedScene("email");
	}

	function handleContinueWrappedEmail() {
		setError("");
		if (!hasValidEmail) {
			const emailField = document.getElementById("signup-email");
			if (emailField instanceof HTMLInputElement) {
				emailField.focus();
			}
			setError("Enter a valid email to continue.");
			return;
		}
		setPassword("");
		setWrappedScene("credentials");
	}

	function handleReturnToWrappedChoice() {
		setError("");
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
								Create account with Google
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
								Create account with GitHub
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
							Create account with Email
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
								id="signup-email"
								type="email"
								placeholder="you@example.com"
								value={email}
								onChange={(e) => {
									setEmail(e.target.value);
									if (error) {
										setError("");
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
									className="mymind-wrapped-auth-form__scene-fields"
									exit={wrappedSceneMotion.exit}
									initial={wrappedSceneMotion.initial}
									transition={wrappedSceneMotion.transition}
								>
									{usesWrappedEmailPreview ? null : (
										<div className="mymind-wrapped-auth-form__field">
											<Label
												className="mymind-wrapped-auth-form__label"
												htmlFor="name"
											>
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
									)}
									<div className="mymind-wrapped-auth-form__field">
										<Input
											autoFocus={usesWrappedEmailPreview}
											aria-label="Password"
											id="password"
											type="password"
											autoComplete="new-password"
											placeholder="Password"
											value={password}
											onChange={(e) => setPassword(e.target.value)}
											className="mymind-wrapped-auth-form__input"
											required
											minLength={8}
										/>
									</div>
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
							disabled={isPasswordStep ? loading : false}
							className="mymind-wrapped-entry-action mymind-wrapped-auth-form__scene-action h-11 rounded-full px-7 [font-family:var(--app-font-heading)] text-[1.0625rem] font-semibold"
						>
							{isPasswordStep
								? loading
									? "Creating account..."
									: "Sign up"
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
