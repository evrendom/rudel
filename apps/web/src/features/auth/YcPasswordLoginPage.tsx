import { motion, useReducedMotion } from "motion/react";
import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { appRoutes } from "@/app/routes";
import { Input } from "@/app/ui/input";
import { useAnalyticsTracking } from "@/features/analytics/tracking/useAnalyticsTracking";
import {
	getWrappedAuthSceneItemMotion,
	getWrappedAuthSceneMotion,
	getWrappedAuthSceneShellMotion,
} from "@/features/auth/wrapped-auth-motion";
import { WrappedPrimaryAction } from "@/features/wrapped/actions";
import { WrappedRouteStageShell } from "@/features/wrapped/route-stage-shell";
import { WrappedGuestPreviewCard } from "@/features/wrapped/WrappedGuestPreviewCard";
import type { WrappedGuestPreviewProfile } from "@/features/wrapped/wrapped-guest-preview";
import { refreshAuthClientState } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { navigateToDestination } from "./auth-navigation";
import {
	type EmailAuthFeedback,
	isValidAuthEmail,
	normalizeAuthEmail,
} from "./email-code-auth";

const YC_PASSWORD_LOGIN_EMAIL_INPUT_ID = "yc-password-login-email";
const YC_PASSWORD_LOGIN_PASSWORD_INPUT_ID = "yc-password-login-password";
const YC_WRAPPED_PREVIEW_PROFILE = {
	displayName: "Evren",
	followerCount: null,
	imageUrl: null,
	source: "local",
	username: "evren",
	verified: false,
} satisfies WrappedGuestPreviewProfile;

export function YcPasswordLoginPage() {
	return (
		<WrappedRouteStageShell
			hideTopChromeControls
			objectClassName="mymind-wrapped-entry-stage__object--auth-form"
			stage={<YcPasswordLoginStage />}
			stageClassName="mymind-wrapped-entry-stage--auth"
			title="YC Log in"
			titleClassName="mymind-wrapped-entry-stage__headline--auth"
		/>
	);
}

function YcPasswordLoginStage() {
	return (
		<div className="mymind-wrapped-auth-panel mymind-wrapped-auth-panel--form">
			<div className="mymind-wrapped-auth-panel__card">
				<div className="mymind-wrapped-auth-panel__card-scale-shell">
					<WrappedGuestPreviewCard
						profile={YC_WRAPPED_PREVIEW_PROFILE}
						size="hero"
					/>
				</div>
			</div>
			<div className="mymind-wrapped-auth-panel__body mymind-wrapped-auth-panel__body--form">
				<YcPasswordLoginForm />
			</div>
		</div>
	);
}

function YcPasswordLoginForm() {
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [feedback, setFeedback] = useState<EmailAuthFeedback>(null);
	const [loading, setLoading] = useState(false);
	const motionState = useWrappedPasswordAuthMotion();
	const shellMotion = motionState.shellMotion;
	const fieldMotion = motionState.sceneMotion;
	const { trackAuthenticationAction } = useAnalyticsTracking({
		pageName: "login",
	});

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setFeedback(null);

		const loginEmail = normalizeAuthEmail(email);
		if (!isValidAuthEmail(loginEmail)) {
			focusInput(YC_PASSWORD_LOGIN_EMAIL_INPUT_ID);
			setFeedback({
				kind: "error",
				message: "Enter a valid email to continue.",
			});
			return;
		}

		if (!password) {
			focusInput(YC_PASSWORD_LOGIN_PASSWORD_INPUT_ID);
			setFeedback({
				kind: "error",
				message: "Enter the account password.",
			});
			return;
		}

		trackAuthenticationAction({
			actionName: "sign_in",
			sourceComponent: "yc_password_login_form",
			authMethod: "email_password",
		});
		setLoading(true);
		const { error } = await signInWithYcCredentials({
			email: loginEmail,
			password,
		});
		setLoading(false);

		if (error) {
			setFeedback({
				kind: "error",
				message: error,
			});
			return;
		}

		refreshAuthClientState();
		navigateToDestination(appRoutes.dashboard());
	}

	return (
		<div
			className="mymind-wrapped-auth-form"
			data-email-auth-stage="credentials"
		>
			<div className="mymind-wrapped-auth-form__scene-shell">
				<motion.div
					animate={shellMotion.animate}
					className="mymind-wrapped-auth-form__scene mymind-wrapped-auth-form__scene--email mymind-wrapped-auth-form__scene--credentials"
					exit={shellMotion.exit}
					initial={motionState.getInitialState(shellMotion.initial)}
					transition={shellMotion.transition}
				>
					<form
						noValidate
						onSubmit={handleSubmit}
						className="mymind-wrapped-auth-form__scene-form"
					>
						<motion.div
							animate={fieldMotion.enter}
							className="mymind-wrapped-auth-form__scene-fields"
							exit={fieldMotion.exit}
							initial={motionState.getInitialState(fieldMotion.initial)}
							transition={fieldMotion.transition}
						>
							<motion.div
								className="mymind-wrapped-auth-form__field"
								transition={fieldMotion.transition}
							>
								<Input
									aria-label="Email"
									autoComplete="email"
									autoFocus
									id={YC_PASSWORD_LOGIN_EMAIL_INPUT_ID}
									name="email"
									type="email"
									placeholder="you@example.com"
									value={email}
									onChange={(event) => {
										setEmail(event.target.value);
										if (feedback) {
											setFeedback(null);
										}
									}}
									className="mymind-wrapped-auth-form__input"
									required
								/>
							</motion.div>
							<motion.div
								className="mymind-wrapped-auth-form__field"
								transition={fieldMotion.transition}
							>
								<Input
									aria-label="Password"
									autoComplete="current-password"
									id={YC_PASSWORD_LOGIN_PASSWORD_INPUT_ID}
									name="password"
									type="password"
									placeholder="Password"
									value={password}
									onChange={(event) => {
										setPassword(event.target.value);
										if (feedback?.kind === "error") {
											setFeedback(null);
										}
									}}
									className="mymind-wrapped-auth-form__input"
									required
								/>
							</motion.div>
						</motion.div>

						<YcPasswordLoginFeedback feedback={feedback} />

						<YcPasswordLoginMotionItem
							className="mymind-wrapped-auth-form__action-item mymind-wrapped-auth-form__action-item--primary"
							delay={0.08}
							motionState={motionState}
						>
							<WrappedPrimaryAction
								kind="button"
								type="submit"
								disabled={loading}
								className="mymind-wrapped-auth-form__scene-action"
							>
								{loading ? "Signing in..." : "Log in"}
							</WrappedPrimaryAction>
						</YcPasswordLoginMotionItem>
					</form>
				</motion.div>
			</div>
		</div>
	);
}

async function signInWithYcCredentials(input: {
	email: string;
	password: string;
}): Promise<{ error: string | null }> {
	const response = await fetch("/api/auth/yc/sign-in", {
		body: JSON.stringify({
			email: input.email,
			password: input.password,
		}),
		credentials: "include",
		headers: {
			"Content-Type": "application/json",
		},
		method: "POST",
	});

	if (response.ok) {
		return { error: null };
	}

	return {
		error: (await readYcLoginErrorMessage(response)) ?? "Sign in failed",
	};
}

async function readYcLoginErrorMessage(
	response: Response,
): Promise<string | null> {
	const contentType = response.headers.get("Content-Type");
	if (!contentType?.includes("application/json")) {
		return null;
	}

	const body = await response.json().catch(() => null);
	if (!isRecord(body)) {
		return null;
	}

	const message = body.message;
	return typeof message === "string" && message.trim().length > 0
		? message
		: null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

interface WrappedPasswordAuthMotionState {
	getInitialState: <T>(initial: T) => T | false;
	getItemMotion: (
		delay?: number,
	) => ReturnType<typeof getWrappedAuthSceneItemMotion>;
	sceneMotion: ReturnType<typeof getWrappedAuthSceneMotion>;
	shellMotion: ReturnType<typeof getWrappedAuthSceneShellMotion>;
}

function useWrappedPasswordAuthMotion(): WrappedPasswordAuthMotionState {
	const shouldReduceMotion = useReducedMotion() ?? false;
	const [hasMountedScene, setHasMountedScene] = useState(false);

	useEffect(() => {
		setHasMountedScene(true);
	}, []);

	return {
		getInitialState<T>(initial: T) {
			return hasMountedScene ? initial : false;
		},
		getItemMotion(delay = 0) {
			return getWrappedAuthSceneItemMotion(shouldReduceMotion, delay);
		},
		sceneMotion: getWrappedAuthSceneMotion(shouldReduceMotion),
		shellMotion: getWrappedAuthSceneShellMotion(shouldReduceMotion),
	};
}

function YcPasswordLoginMotionItem(props: {
	children: ReactNode;
	className: string;
	delay?: number;
	motionState: WrappedPasswordAuthMotionState;
}) {
	const itemMotion = props.motionState.getItemMotion(props.delay);

	return (
		<motion.div
			animate={itemMotion.animate}
			className={props.className}
			exit={itemMotion.exit}
			initial={props.motionState.getInitialState(itemMotion.initial)}
			transition={itemMotion.transition}
		>
			{props.children}
		</motion.div>
	);
}

function YcPasswordLoginFeedback(props: { feedback: EmailAuthFeedback }) {
	if (!props.feedback) {
		return null;
	}

	return (
		<div
			role={props.feedback.kind === "error" ? "alert" : "status"}
			aria-live="polite"
			className={cn(
				"mymind-wrapped-auth-form__feedback",
				props.feedback.kind === "error" ? "is-error" : "is-success",
			)}
		>
			{props.feedback.message}
		</div>
	);
}

function focusInput(id: string) {
	const input = document.getElementById(id);
	if (input instanceof HTMLInputElement) {
		input.focus();
	}
}
