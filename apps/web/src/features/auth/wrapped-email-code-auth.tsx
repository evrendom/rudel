import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
	type ChangeEvent,
	type FormEvent,
	type ReactNode,
	useEffect,
	useState,
} from "react";
import { Input } from "@/app/ui/input";
import { Separator } from "@/app/ui/separator";
import {
	WrappedPrimaryAction,
	WrappedSecondaryAction,
} from "@/features/wrapped/actions";
import { cn } from "@/lib/utils";
import type { EmailAuthFeedback } from "./email-code-auth";
import {
	getWrappedAuthSceneItemMotion,
	getWrappedAuthSceneMotion,
	getWrappedAuthSceneShellMotion,
	type WrappedAuthScene,
} from "./wrapped-auth-motion";

interface WrappedEmailCodeAuthLabels {
	google: string;
	github: string;
	email: string;
}

interface WrappedEmailCodeAuthProps {
	codeInputId: string;
	email: string;
	emailCode: string;
	emailInputId: string;
	feedback: EmailAuthFeedback;
	labels: WrappedEmailCodeAuthLabels;
	loading: boolean;
	onCodeChange: (value: string) => void;
	onContinueEmail: () => void;
	onEmailChange: (value: string) => void;
	onOpenEmail: () => void;
	onReturnToChoice: () => void;
	onSocialSignIn: (provider: "google" | "github") => void;
	onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void> | void;
	onUseDifferentEmail: () => void;
	scene: WrappedAuthScene;
	usesPreviewSubmit: boolean;
}

interface WrappedAuthMotionState {
	getInitialState: <T>(initial: T) => T | false;
	getItemMotion: (
		delay?: number,
	) => ReturnType<typeof getWrappedAuthSceneItemMotion>;
	sceneMotion: ReturnType<typeof getWrappedAuthSceneMotion>;
	shellMotion: ReturnType<typeof getWrappedAuthSceneShellMotion>;
}

interface WrappedAuthFeedbackProps {
	className?: string;
	feedback: EmailAuthFeedback;
}

interface WrappedMotionItemProps {
	children: ReactNode;
	className: string;
	delay?: number;
	motionState: WrappedAuthMotionState;
}

interface WrappedAuthChoiceSceneProps {
	feedback: EmailAuthFeedback;
	labels: WrappedEmailCodeAuthLabels;
	motionState: WrappedAuthMotionState;
	onOpenEmail: () => void;
	onSocialSignIn: (provider: "google" | "github") => void;
}

interface WrappedEmailCodeSceneProps {
	codeInputId: string;
	email: string;
	emailCode: string;
	emailInputId: string;
	feedback: EmailAuthFeedback;
	loading: boolean;
	motionState: WrappedAuthMotionState;
	onCodeChange: (value: string) => void;
	onContinueEmail: () => void;
	onEmailChange: (value: string) => void;
	onReturnToChoice: () => void;
	onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void> | void;
	onUseDifferentEmail: () => void;
	scene: WrappedAuthScene;
	usesPreviewSubmit: boolean;
}

export function WrappedEmailCodeAuth(props: WrappedEmailCodeAuthProps) {
	const motionState = useWrappedAuthMotion();

	return (
		<div
			className="mymind-wrapped-auth-form"
			data-email-auth-stage={props.scene}
		>
			<div className="mymind-wrapped-auth-form__scene-shell">
				<AnimatePresence initial={false} mode="wait">
					{props.scene === "choice" ? (
						<WrappedAuthChoiceScene
							feedback={props.feedback}
							labels={props.labels}
							motionState={motionState}
							onOpenEmail={props.onOpenEmail}
							onSocialSignIn={props.onSocialSignIn}
						/>
					) : (
						<WrappedEmailCodeScene
							codeInputId={props.codeInputId}
							email={props.email}
							emailCode={props.emailCode}
							emailInputId={props.emailInputId}
							feedback={props.feedback}
							loading={props.loading}
							motionState={motionState}
							onCodeChange={props.onCodeChange}
							onContinueEmail={props.onContinueEmail}
							onEmailChange={props.onEmailChange}
							onReturnToChoice={props.onReturnToChoice}
							onSubmit={props.onSubmit}
							onUseDifferentEmail={props.onUseDifferentEmail}
							scene={props.scene}
							usesPreviewSubmit={props.usesPreviewSubmit}
						/>
					)}
				</AnimatePresence>
			</div>
		</div>
	);
}

function WrappedAuthChoiceScene(props: WrappedAuthChoiceSceneProps) {
	const shellMotion = props.motionState.shellMotion;

	return (
		<motion.div
			key="choice"
			animate={shellMotion.animate}
			className="mymind-wrapped-auth-form__scene mymind-wrapped-auth-form__scene--choice"
			exit={shellMotion.exit}
			initial={props.motionState.getInitialState(shellMotion.initial)}
			transition={shellMotion.transition}
		>
			<div className="mymind-wrapped-auth-form__choice-footer">
				<div className="mymind-wrapped-auth-form__social">
					<WrappedMotionItem
						className="mymind-wrapped-auth-form__action-item"
						motionState={props.motionState}
					>
						<WrappedSecondaryAction
							onClick={() => props.onSocialSignIn("google")}
						>
							{props.labels.google}
						</WrappedSecondaryAction>
					</WrappedMotionItem>
					<WrappedMotionItem
						className="mymind-wrapped-auth-form__action-item"
						delay={0.04}
						motionState={props.motionState}
					>
						<WrappedSecondaryAction
							onClick={() => props.onSocialSignIn("github")}
						>
							{props.labels.github}
						</WrappedSecondaryAction>
					</WrappedMotionItem>
				</div>

				<WrappedMotionItem
					className="mymind-wrapped-auth-form__divider"
					delay={0.08}
					motionState={props.motionState}
				>
					<Separator className="mymind-wrapped-auth-form__divider-line" />
					<span className="mymind-wrapped-auth-form__divider-label">OR</span>
					<Separator className="mymind-wrapped-auth-form__divider-line" />
				</WrappedMotionItem>

				<WrappedMotionItem
					className="mymind-wrapped-auth-form__action-item"
					delay={0.12}
					motionState={props.motionState}
				>
					<WrappedPrimaryAction
						kind="button"
						onClick={props.onOpenEmail}
						className="mymind-wrapped-auth-form__scene-action"
					>
						{props.labels.email}
					</WrappedPrimaryAction>
				</WrappedMotionItem>

				<WrappedAuthFeedback feedback={props.feedback} />
			</div>
		</motion.div>
	);
}

function WrappedEmailCodeScene(props: WrappedEmailCodeSceneProps) {
	const isCodeStep = props.scene === "credentials";
	const shellMotion = props.motionState.shellMotion;
	const fieldMotion = props.motionState.sceneMotion;

	return (
		<motion.div
			key="email-code"
			animate={shellMotion.animate}
			className={cn(
				"mymind-wrapped-auth-form__scene mymind-wrapped-auth-form__scene--email",
				isCodeStep ? "mymind-wrapped-auth-form__scene--credentials" : null,
			)}
			exit={shellMotion.exit}
			initial={props.motionState.getInitialState(shellMotion.initial)}
			transition={shellMotion.transition}
		>
			<form
				noValidate
				onSubmit={(event) => {
					if (!isCodeStep) {
						event.preventDefault();
						props.onContinueEmail();
						return;
					}

					void props.onSubmit(event);
				}}
				className="mymind-wrapped-auth-form__scene-form"
			>
				<motion.div
					animate={fieldMotion.enter}
					className="mymind-wrapped-auth-form__scene-fields"
					exit={fieldMotion.exit}
					initial={props.motionState.getInitialState(fieldMotion.initial)}
					transition={fieldMotion.transition}
				>
					{isCodeStep ? null : (
						<motion.div
							layout="position"
							className="mymind-wrapped-auth-form__field"
							transition={fieldMotion.transition}
						>
							<Input
								aria-label="Email"
								autoComplete="email"
								autoFocus
								id={props.emailInputId}
								name="email"
								type="email"
								placeholder="you@example.com"
								value={props.email}
								onChange={getInputChangeHandler(props.onEmailChange)}
								className="mymind-wrapped-auth-form__input"
								required
							/>
						</motion.div>
					)}
					<AnimatePresence initial={false}>
						{isCodeStep ? (
							<motion.div
								key="email-code"
								animate={fieldMotion.enter}
								className="mymind-wrapped-auth-form__field mymind-wrapped-auth-form__code-field"
								exit={fieldMotion.exit}
								initial={fieldMotion.initial}
								transition={fieldMotion.transition}
							>
								<Input
									autoFocus
									aria-label="Email code"
									autoComplete="one-time-code"
									id={props.codeInputId}
									inputMode="numeric"
									name="code"
									pattern="[0-9]*"
									placeholder="123456"
									value={props.emailCode}
									onChange={getInputChangeHandler(props.onCodeChange)}
									className="mymind-wrapped-auth-form__input mymind-wrapped-auth-step__otp-input"
									required
								/>
								<WrappedAuthFeedback
									feedback={props.feedback}
									className="mymind-wrapped-auth-form__feedback--code-note"
								/>
							</motion.div>
						) : null}
					</AnimatePresence>
				</motion.div>

				{isCodeStep ? null : <WrappedAuthFeedback feedback={props.feedback} />}

				<WrappedMotionItem
					className="mymind-wrapped-auth-form__action-item mymind-wrapped-auth-form__action-item--primary"
					delay={0.08}
					motionState={props.motionState}
				>
					<WrappedPrimaryAction
						kind="button"
						type="submit"
						disabled={
							isCodeStep && !props.usesPreviewSubmit ? props.loading : false
						}
						className="mymind-wrapped-auth-form__scene-action"
					>
						{isCodeStep
							? props.loading
								? "Verifying..."
								: "Verify code"
							: "Continue"}
					</WrappedPrimaryAction>
				</WrappedMotionItem>

				<WrappedMotionItem
					className="mymind-wrapped-auth-form__action-item"
					delay={0.1}
					motionState={props.motionState}
				>
					<button
						type="button"
						onClick={
							isCodeStep ? props.onUseDifferentEmail : props.onReturnToChoice
						}
						className="mymind-wrapped-auth-form__scene-link"
					>
						{isCodeStep ? "Use a different email" : "Use another method"}
					</button>
				</WrappedMotionItem>
			</form>
		</motion.div>
	);
}

function WrappedMotionItem(props: WrappedMotionItemProps) {
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

function WrappedAuthFeedback(props: WrappedAuthFeedbackProps) {
	if (!props.feedback) {
		return null;
	}

	return (
		<div
			role={props.feedback.kind === "error" ? "alert" : "status"}
			aria-live="polite"
			className={cn(
				"mymind-wrapped-auth-form__feedback",
				props.className,
				props.feedback.kind === "error" ? "is-error" : "is-success",
			)}
		>
			{props.feedback.message}
		</div>
	);
}

function useWrappedAuthMotion(): WrappedAuthMotionState {
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

function getInputChangeHandler(onChange: (value: string) => void) {
	return (event: ChangeEvent<HTMLInputElement>) => {
		onChange(event.target.value);
	};
}
