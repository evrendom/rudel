import {
	AnimatePresence,
	LayoutGroup,
	motion,
	useReducedMotion,
} from "motion/react";
import type { ReactNode } from "react";
import { startTransition, useEffect, useEffectEvent, useState } from "react";
import { LoginForm } from "@/features/auth/LoginForm";
import { SignupForm } from "@/features/auth/SignupForm";
import {
	WrappedPrimaryAction,
	WrappedSecondaryAction,
} from "@/features/wrapped/actions";
import { cn } from "@/lib/utils";
import {
	WrappedDebugControlStack,
	WrappedRouteStageShell,
} from "./route-stage-shell";
import { WrappedGuestPreviewCard } from "./WrappedGuestPreviewCard";
import type { WrappedGuestPreviewProfile } from "./wrapped-guest-preview";

type WrappedAuthMode = "login" | "signup" | null;
type WrappedAuthIntroTool = "Claude" | "Codex";

const WRAPPED_AUTH_INTRO_TITLE_LABEL = "Your Claude Wrapped";
const WRAPPED_AUTH_INTRO_EASE = [0.22, 1, 0.36, 1] as const;
const WRAPPED_AUTH_EXIT_EASE = [0.4, 0, 0.2, 1] as const;
const WRAPPED_AUTH_LAYOUT_EASE = [0.32, 0.72, 0, 1] as const;
const WRAPPED_AUTH_FORM_ENTER_DELAY = 0.08;
const WRAPPED_AUTH_FORM_TRANSITION_DURATION = 0.32;
const WRAPPED_AUTH_LAYOUT_DURATION = 0.6;
const WRAPPED_AUTH_INTRO_REDUCED_DURATION = 0.14;
const WRAPPED_AUTH_INTRO_TOOL_ROTATION_MS = 3000;
const WRAPPED_AUTH_TITLE_ENTER_DELAY = 0.16;
const WRAPPED_AUTH_TITLE_ENTER_DURATION = 0.34;
const WRAPPED_AUTH_TITLE_EXIT_DURATION = 0.22;
const WRAPPED_AUTH_TITLE_MICRO_DURATION = 0.2;

interface WrappedAuthFlowProps {
	debugControls?: ReactNode;
	onEmailPasswordPreviewSubmit?: (email: string) => void;
	previewProfile: WrappedGuestPreviewProfile | null;
}

interface WrappedAuthStageProps {
	debugControls?: ReactNode;
	mode: WrappedAuthMode;
	onEmailPasswordPreviewSubmit?: (email: string) => void;
	previewProfile: WrappedGuestPreviewProfile | null;
	setMode: (mode: WrappedAuthMode) => void;
}

function WrappedAuthStage(props: WrappedAuthStageProps) {
	const {
		debugControls,
		mode,
		onEmailPasswordPreviewSubmit,
		previewProfile,
		setMode,
	} = props;
	const shouldReduceMotion = useReducedMotion() ?? false;
	const isIntro = mode === null;
	const panelLayoutTransition = shouldReduceMotion
		? {
				duration: WRAPPED_AUTH_INTRO_REDUCED_DURATION,
				ease: "linear" as const,
			}
		: {
				duration: WRAPPED_AUTH_LAYOUT_DURATION,
				ease: WRAPPED_AUTH_LAYOUT_EASE,
			};
	const formContentTransition = shouldReduceMotion
		? {
				duration: WRAPPED_AUTH_INTRO_REDUCED_DURATION,
				ease: "linear" as const,
			}
		: {
				delay: WRAPPED_AUTH_FORM_ENTER_DELAY,
				duration: WRAPPED_AUTH_FORM_TRANSITION_DURATION,
				ease: WRAPPED_AUTH_INTRO_EASE,
			};
	const intentExit = shouldReduceMotion
		? { opacity: 0 }
		: { filter: "blur(6px)", opacity: 0, y: -8 };
	const formEnter = shouldReduceMotion
		? { opacity: 1 }
		: { filter: "blur(0px)", opacity: 1, y: 0 };
	const formExit = shouldReduceMotion
		? { opacity: 0 }
		: { filter: "blur(6px)", opacity: 0, y: -10 };
	const formInitial = shouldReduceMotion
		? { opacity: 0 }
		: { filter: "blur(8px)", opacity: 0, y: 14 };
	const cardScaleTransition = shouldReduceMotion
		? {
				duration: WRAPPED_AUTH_INTRO_REDUCED_DURATION,
				ease: "linear" as const,
			}
		: {
				duration: WRAPPED_AUTH_FORM_TRANSITION_DURATION,
				ease: WRAPPED_AUTH_INTRO_EASE,
			};

	return (
		<LayoutGroup id="wrapped-auth-panel">
			<div
				className={cn(
					"mymind-wrapped-auth-panel",
					isIntro
						? "mymind-wrapped-auth-panel--intro"
						: "mymind-wrapped-auth-panel--form",
				)}
			>
				<motion.div
					layout="position"
					className="mymind-wrapped-auth-panel__card"
					transition={{ layout: panelLayoutTransition }}
				>
					<motion.div
						animate={
							shouldReduceMotion ? { scale: 1 } : { scale: isIntro ? 1 : 0.92 }
						}
						className="mymind-wrapped-auth-panel__card-scale-shell"
						transition={cardScaleTransition}
					>
						<WrappedGuestPreviewCard profile={previewProfile} size="hero" />
					</motion.div>
				</motion.div>

				<AnimatePresence
					initial={false}
					mode={shouldReduceMotion ? "wait" : "popLayout"}
				>
					{isIntro ? (
						<motion.div
							key="intent"
							layout
							className="mymind-wrapped-auth-panel__cta-region"
							exit={intentExit}
							transition={formContentTransition}
						>
							{debugControls ? (
								<WrappedDebugControlStack>
									{debugControls}
								</WrappedDebugControlStack>
							) : null}
							<div className="mymind-wrapped-auth-panel__actions">
								<WrappedPrimaryAction
									kind="button"
									onClick={() => transitionWrappedAuthMode(setMode, "signup")}
								>
									Create account
								</WrappedPrimaryAction>
								<WrappedSecondaryAction
									onClick={() => transitionWrappedAuthMode(setMode, "login")}
								>
									Log in
								</WrappedSecondaryAction>
							</div>
						</motion.div>
					) : (
						<motion.div
							key={mode}
							animate={formEnter}
							className="mymind-wrapped-auth-panel__body mymind-wrapped-auth-panel__body--form"
							exit={formExit}
							initial={formInitial}
							transition={formContentTransition}
						>
							{mode === "login" ? (
								<LoginForm
									onEmailPasswordPreviewSubmit={onEmailPasswordPreviewSubmit}
									variant="wrapped-story"
									onSwitchToSignup={() =>
										transitionWrappedAuthMode(setMode, "signup")
									}
								/>
							) : (
								<SignupForm
									onEmailPasswordPreviewSubmit={onEmailPasswordPreviewSubmit}
									variant="wrapped-story"
									onSwitchToLogin={() =>
										transitionWrappedAuthMode(setMode, "login")
									}
								/>
							)}
						</motion.div>
					)}
				</AnimatePresence>
			</div>
		</LayoutGroup>
	);
}

export function WrappedAuthFlow(props: WrappedAuthFlowProps) {
	const { debugControls, onEmailPasswordPreviewSubmit, previewProfile } = props;
	const [mode, setMode] = useState<WrappedAuthMode>(null);
	const [introTool, setIntroTool] = useState<WrappedAuthIntroTool>("Claude");
	const shouldReduceMotion = useReducedMotion() ?? false;
	const rotateIntroTool = useEffectEvent(() => {
		startTransition(() => {
			setIntroTool((currentTool) =>
				currentTool === "Claude" ? "Codex" : "Claude",
			);
		});
	});

	useEffect(() => {
		if (mode !== null || shouldReduceMotion) {
			setIntroTool("Claude");
			return;
		}

		const intervalId = window.setInterval(() => {
			rotateIntroTool();
		}, WRAPPED_AUTH_INTRO_TOOL_ROTATION_MS);

		return () => {
			window.clearInterval(intervalId);
		};
	}, [mode, rotateIntroTool, shouldReduceMotion]);

	return (
		<WrappedRouteStageShell
			footerDebugControls={mode ? debugControls : undefined}
			leadingControl={null}
			objectClassName={
				mode
					? "mymind-wrapped-entry-stage__object--auth-form"
					: "mymind-wrapped-entry-stage__object--auth-intro"
			}
			stage={
				<WrappedAuthStage
					debugControls={debugControls}
					mode={mode}
					onEmailPasswordPreviewSubmit={onEmailPasswordPreviewSubmit}
					previewProfile={previewProfile}
					setMode={setMode}
				/>
			}
			stageClassName="mymind-wrapped-entry-stage--auth"
			title={
				<WrappedAuthTitle
					introTool={introTool}
					mode={mode}
					shouldReduceMotion={shouldReduceMotion}
				/>
			}
			titleClassName="mymind-wrapped-entry-stage__headline--auth"
		/>
	);
}

interface WrappedAuthTitleProps {
	introTool: WrappedAuthIntroTool;
	mode: WrappedAuthMode;
	shouldReduceMotion: boolean;
}

function WrappedAuthTitle(props: WrappedAuthTitleProps) {
	const { introTool, mode, shouldReduceMotion } = props;
	const title = getWrappedAuthTitleText(mode);
	const titleInitial = shouldReduceMotion
		? { opacity: 0 }
		: { filter: "blur(10px)", opacity: 0, y: 8 };
	const titleAnimate = shouldReduceMotion
		? { opacity: 1 }
		: { filter: "blur(0px)", opacity: 1, y: 0 };
	const titleExit = shouldReduceMotion
		? {
				opacity: 0,
				transition: {
					duration: WRAPPED_AUTH_INTRO_REDUCED_DURATION,
					ease: "linear" as const,
				},
			}
		: {
				filter: "blur(8px)",
				opacity: 0,
				y: -6,
				transition: {
					duration: WRAPPED_AUTH_TITLE_EXIT_DURATION,
					ease: WRAPPED_AUTH_EXIT_EASE,
				},
			};
	const titleTransition = shouldReduceMotion
		? {
				duration: WRAPPED_AUTH_INTRO_REDUCED_DURATION,
				ease: "linear" as const,
			}
		: {
				delay: mode === null ? WRAPPED_AUTH_TITLE_ENTER_DELAY : 0,
				duration: WRAPPED_AUTH_TITLE_ENTER_DURATION,
				ease: WRAPPED_AUTH_INTRO_EASE,
			};

	return (
		<span className="mymind-wrapped-auth-title-handoff">
			<AnimatePresence initial={false} mode="wait">
				<motion.span
					key={mode ?? "intro"}
					animate={titleAnimate}
					className="mymind-wrapped-auth-stage-title mymind-wrapped-auth-title-handoff__item"
					exit={titleExit}
					initial={titleInitial}
					transition={titleTransition}
				>
					{mode === null ? (
						<span className="mymind-wrapped-auth-intro-title">
							<span className="mymind-wrapped-auth-intro-title__label">
								Your
							</span>
							<span className="mymind-wrapped-auth-intro-title__word-slot">
								<AnimatePresence initial={false} mode="wait">
									<motion.span
										key={introTool}
										animate={
											shouldReduceMotion
												? { opacity: 1 }
												: { filter: "blur(0px)", opacity: 1, y: 0 }
										}
										className="mymind-wrapped-auth-intro-title__word"
										exit={
											shouldReduceMotion
												? {
														opacity: 0,
														transition: {
															duration: WRAPPED_AUTH_INTRO_REDUCED_DURATION,
															ease: "linear" as const,
														},
													}
												: {
														filter: "blur(6px)",
														opacity: 0,
														y: -4,
														transition: {
															duration: WRAPPED_AUTH_TITLE_MICRO_DURATION,
															ease: WRAPPED_AUTH_EXIT_EASE,
														},
													}
										}
										initial={
											shouldReduceMotion
												? { opacity: 0 }
												: { filter: "blur(6px)", opacity: 0, y: 4 }
										}
										transition={
											shouldReduceMotion
												? {
														duration: WRAPPED_AUTH_INTRO_REDUCED_DURATION,
														ease: "linear" as const,
													}
												: {
														duration: WRAPPED_AUTH_TITLE_MICRO_DURATION,
														ease: WRAPPED_AUTH_INTRO_EASE,
													}
										}
									>
										{introTool}
									</motion.span>
								</AnimatePresence>
							</span>
							<span className="mymind-wrapped-auth-intro-title__label">
								Wrapped
							</span>
						</span>
					) : (
						title
					)}
				</motion.span>
			</AnimatePresence>
		</span>
	);
}

function getWrappedAuthTitleText(mode: WrappedAuthMode) {
	if (mode === null) {
		return WRAPPED_AUTH_INTRO_TITLE_LABEL;
	}

	return mode === "login" ? "Log in" : "Create account";
}

function transitionWrappedAuthMode(
	setMode: (mode: WrappedAuthMode) => void,
	mode: Exclude<WrappedAuthMode, null>,
) {
	startTransition(() => {
		setMode(mode);
	});
}
