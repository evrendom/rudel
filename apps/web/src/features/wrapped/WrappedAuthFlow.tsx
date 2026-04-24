import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { useState } from "react";
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

const WRAPPED_AUTH_INTRO_TITLE_LABEL = "Your Claude/Codex Wrapped";
const WRAPPED_AUTH_INTRO_EASE = [0.22, 1, 0.36, 1] as const;
const WRAPPED_AUTH_EXIT_EASE = [0.4, 0, 0.2, 1] as const;
const WRAPPED_AUTH_LAYOUT_EASE = [0.32, 0.72, 0, 1] as const;
const WRAPPED_AUTH_FORM_ENTER_DELAY = 0.08;
const WRAPPED_AUTH_FORM_TRANSITION_DURATION = 0.32;
const WRAPPED_AUTH_LAYOUT_DURATION = 0.6;
const WRAPPED_AUTH_INTRO_REDUCED_DURATION = 0.14;
const WRAPPED_AUTH_TITLE_ENTER_DELAY = 0.16;
const WRAPPED_AUTH_TITLE_ENTER_DURATION = 0.34;
const WRAPPED_AUTH_TITLE_EXIT_DURATION = 0.22;
const WRAPPED_AUTH_TITLE_HANDOFF_DELAY = 0.05;

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
				duration: WRAPPED_AUTH_LAYOUT_DURATION,
				ease: WRAPPED_AUTH_LAYOUT_EASE,
			};

	return (
		<div
			className={cn(
				"mymind-wrapped-auth-panel",
				isIntro
					? "mymind-wrapped-auth-panel--intro"
					: "mymind-wrapped-auth-panel--form",
			)}
		>
			<div className="mymind-wrapped-auth-panel__card">
				<motion.div
					animate={
						shouldReduceMotion
							? { scale: 1, y: 0 }
							: { scale: isIntro ? 1 : 0.86, y: isIntro ? 0 : -24 }
					}
					className="mymind-wrapped-auth-panel__card-scale-shell"
					transition={cardScaleTransition}
				>
					<WrappedGuestPreviewCard profile={previewProfile} />
				</motion.div>
			</div>

			<AnimatePresence initial={false} mode="wait">
				{isIntro ? (
					<motion.div
						key="intent"
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
	);
}

export function WrappedAuthFlow(props: WrappedAuthFlowProps) {
	const { debugControls, onEmailPasswordPreviewSubmit, previewProfile } = props;
	const [mode, setMode] = useState<WrappedAuthMode>(null);
	const shouldReduceMotion = useReducedMotion() ?? false;

	return (
		<WrappedRouteStageShell
			footerDebugControls={mode ? debugControls : undefined}
			hideTopChromeControls
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
			title={getWrappedAuthTitle(mode, shouldReduceMotion)}
			titleClassName={
				mode === null
					? "mymind-wrapped-entry-stage__headline--auth-intro"
					: undefined
			}
			useReferenceTopChrome
		/>
	);
}

function getWrappedAuthTitle(
	mode: WrappedAuthMode,
	shouldReduceMotion: boolean,
) {
	const titleKey = mode === null ? "intro" : mode;
	const isIntroTitle = mode === null;

	return (
		<span className="mymind-wrapped-auth-title-handoff">
			<AnimatePresence initial={false} mode="wait">
				<motion.span
					key={titleKey}
					animate={
						shouldReduceMotion
							? { opacity: 1 }
							: { filter: "blur(0px)", opacity: 1, y: 0 }
					}
					className={cn(
						"mymind-wrapped-auth-title-handoff__item",
						isIntroTitle
							? "mymind-wrapped-auth-intro-title"
							: "mymind-wrapped-auth-stage-title",
					)}
					exit={
						shouldReduceMotion
							? {
									opacity: 0,
									transition: {
										duration: WRAPPED_AUTH_INTRO_REDUCED_DURATION,
										ease: "linear",
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
								}
					}
					initial={
						shouldReduceMotion
							? { opacity: 0 }
							: {
									filter: isIntroTitle ? "blur(14px)" : "blur(10px)",
									opacity: 0,
									y: isIntroTitle ? 8 : 6,
								}
					}
					transition={
						shouldReduceMotion
							? {
									delay: isIntroTitle ? 0.12 : 0.04,
									duration: WRAPPED_AUTH_INTRO_REDUCED_DURATION,
									ease: "linear",
								}
							: {
									delay: isIntroTitle
										? WRAPPED_AUTH_TITLE_ENTER_DELAY
										: WRAPPED_AUTH_TITLE_HANDOFF_DELAY,
									duration: WRAPPED_AUTH_TITLE_ENTER_DURATION,
									ease: WRAPPED_AUTH_INTRO_EASE,
								}
					}
				>
					{isIntroTitle
						? renderWrappedAuthIntroTitleLine(shouldReduceMotion)
						: mode === "login"
							? "Log in"
							: "Create account"}
				</motion.span>
			</AnimatePresence>
		</span>
	);
}

function renderWrappedAuthIntroTitleLine(shouldReduceMotion: boolean) {
	return (
		<>
			<span className="sr-only">{WRAPPED_AUTH_INTRO_TITLE_LABEL}</span>
			<motion.span
				aria-hidden="true"
				animate={{ opacity: 1, y: 0 }}
				className="mymind-wrapped-auth-intro-title__line mymind-wrapped-auth-intro-title__line--lockup"
				initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 12 }}
				transition={
					shouldReduceMotion
						? {
								delay: 0.12,
								duration: WRAPPED_AUTH_INTRO_REDUCED_DURATION,
								ease: "linear",
							}
						: {
								delay: WRAPPED_AUTH_TITLE_ENTER_DELAY,
								duration: 0.3,
								ease: WRAPPED_AUTH_INTRO_EASE,
							}
				}
			>
				<span className="mymind-wrapped-auth-intro-title__word">Your</span>
				<span className="mymind-wrapped-auth-intro-title__tag-stack">
					<span className="mymind-wrapped-auth-intro-title__tag mymind-wrapped-auth-intro-title__tag--claude">
						Claude Code
					</span>
					<span className="mymind-wrapped-auth-intro-title__tag mymind-wrapped-auth-intro-title__tag--codex">
						Codex
					</span>
				</span>
				<span className="mymind-wrapped-auth-intro-title__word">Wrapped</span>
			</motion.span>
		</>
	);
}

function transitionWrappedAuthMode(
	setMode: (mode: WrappedAuthMode) => void,
	mode: Exclude<WrappedAuthMode, null>,
) {
	setMode(mode);
}
