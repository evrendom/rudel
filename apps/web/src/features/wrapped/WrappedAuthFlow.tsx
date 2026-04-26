import {
	AnimatePresence,
	LayoutGroup,
	motion,
	useReducedMotion,
} from "motion/react";
import type { MutableRefObject, ReactNode, Ref } from "react";
import {
	startTransition,
	// biome-ignore lint/style/noRestrictedImports: auth-card flight measurement is an imperative storyboard bridge for this wrapped surface.
	useEffect,
	useEffectEvent,
	useRef,
	useState,
} from "react";
import { LoginForm } from "@/features/auth/LoginForm";
import { SignupForm } from "@/features/auth/SignupForm";
import {
	WrappedPrimaryAction,
	WrappedSecondaryAction,
} from "@/features/wrapped/actions";
import { useMountEffect } from "@/hooks/useMountEffect";
import { cn } from "@/lib/utils";
import { WrappedRouteStageShell } from "./route-stage-shell";
import { WrappedGuestPreviewCard } from "./WrappedGuestPreviewCard";
import type { WrappedGuestPreviewProfile } from "./wrapped-guest-preview";

type WrappedAuthMode = "login" | "signup" | null;
type WrappedAuthCardAppearance = "default" | "unknown";
type WrappedAuthIntroTool = "Claude" | "Codex";
type WrappedAuthCardFlightRect = {
	left: number;
	scale: number;
	top: number;
};
type WrappedAuthCardFlight = {
	appearance: WrappedAuthCardAppearance;
	from: WrappedAuthCardFlightRect;
	key: number;
	targetMode: Exclude<WrappedAuthMode, null>;
	to?: WrappedAuthCardFlightRect;
};

const WRAPPED_AUTH_INTRO_TITLE_LABEL = "Your Claude Wrapped";
const WRAPPED_AUTH_INTRO_EASE = [0.22, 1, 0.36, 1] as const;
const WRAPPED_AUTH_EXIT_EASE = [0.4, 0, 0.2, 1] as const;
const WRAPPED_AUTH_LAYOUT_EASE = [0.32, 0.72, 0, 1] as const;
const WRAPPED_AUTH_CARD_FLIGHT_CARD_WIDTH = 233;
const WRAPPED_AUTH_CARD_FLIGHT_DURATION_MS = 720;
const WRAPPED_AUTH_CARD_FLIGHT_SETTLE_MS = 90;
const WRAPPED_AUTH_CARD_FLIGHT_TRANSITION = {
	duration: WRAPPED_AUTH_CARD_FLIGHT_DURATION_MS / 1_000,
	ease: WRAPPED_AUTH_LAYOUT_EASE,
};
const WRAPPED_AUTH_FORM_TRANSITION_DURATION = 0.32;
const WRAPPED_AUTH_LAYOUT_DURATION = 0.6;
const WRAPPED_AUTH_FORM_CARD_SCALE = 1;
const WRAPPED_AUTH_INTRO_REDUCED_DURATION = 0.14;
const WRAPPED_AUTH_INTRO_CARD_SCALE = 1;
const WRAPPED_AUTH_CARD_SCALE_MAX = 1.08;
const WRAPPED_AUTH_CARD_SCALE_MIN = 0.88;
const WRAPPED_AUTH_INTRO_TOOL_ROTATION_MS = 3000;
const WRAPPED_AUTH_TITLE_ENTER_DELAY = 0.16;
const WRAPPED_AUTH_TITLE_ENTER_DURATION = 0.34;
const WRAPPED_AUTH_TITLE_EXIT_DURATION = 0.22;
const WRAPPED_AUTH_TITLE_MICRO_DURATION = 0.2;

interface WrappedAuthFlowProps {
	authFormCardScale?: number;
	authIntroCardScale?: number;
	debugControls?: ReactNode;
	onEmailPasswordPreviewSubmit?: (email: string) => void;
	previewProfile: WrappedGuestPreviewProfile | null;
}

interface WrappedAuthStageProps {
	authFormCardScale?: number;
	authIntroCardScale?: number;
	cardAppearance: WrappedAuthCardAppearance;
	cardStageRef: Ref<HTMLDivElement>;
	isCardFlightActive: boolean;
	mode: WrappedAuthMode;
	onEmailPasswordPreviewSubmit?: (email: string) => void;
	onModeChange: (mode: WrappedAuthMode) => void;
	previewProfile: WrappedGuestPreviewProfile | null;
}

function WrappedAuthStage(props: WrappedAuthStageProps) {
	const {
		authFormCardScale,
		authIntroCardScale,
		cardAppearance,
		cardStageRef,
		isCardFlightActive,
		mode,
		onEmailPasswordPreviewSubmit,
		onModeChange,
		previewProfile,
	} = props;
	const shouldReduceMotion = useReducedMotion() ?? false;
	const isIntro = mode === null;
	const activeCardScale = clampWrappedAuthCardScale(
		isIntro
			? (authIntroCardScale ?? WRAPPED_AUTH_INTRO_CARD_SCALE)
			: (authFormCardScale ?? WRAPPED_AUTH_FORM_CARD_SCALE),
	);
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
		? {
				opacity: 0,
				transition: {
					duration: WRAPPED_AUTH_INTRO_REDUCED_DURATION,
					ease: "linear" as const,
				},
			}
		: {
				filter: "blur(4px)",
				opacity: 0,
				y: -6,
				transition: {
					duration: 0.2,
					ease: WRAPPED_AUTH_EXIT_EASE,
				},
			};
	const formInitial = shouldReduceMotion
		? { opacity: 0 }
		: { filter: "blur(6px)", opacity: 0, y: 8 };
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
					isCardFlightActive
						? "mymind-wrapped-auth-panel--card-flight-active"
						: null,
				)}
			>
				<motion.div
					layout={isCardFlightActive ? false : "position"}
					className="mymind-wrapped-auth-panel__card"
					transition={
						isCardFlightActive ? undefined : { layout: panelLayoutTransition }
					}
				>
					<motion.div
						animate={{ scale: activeCardScale }}
						className="mymind-wrapped-auth-panel__card-scale-shell"
						transition={
							isCardFlightActive
								? {
										duration: 0,
									}
								: cardScaleTransition
						}
					>
						<WrappedGuestPreviewCard
							appearance={cardAppearance}
							cardStageRef={cardStageRef}
							enableAppearanceOverlay
							profile={previewProfile}
							size="hero"
						/>
					</motion.div>
				</motion.div>

				<AnimatePresence initial={false} mode="wait">
					{isIntro ? (
						<motion.div
							key="intent"
							layout
							className="mymind-wrapped-auth-panel__cta-region"
							exit={intentExit}
							transition={formContentTransition}
						>
							<WrappedAuthIntroTerms />
							<div className="mymind-wrapped-auth-panel__actions">
								<WrappedPrimaryAction
									kind="button"
									onClick={() => onModeChange("signup")}
								>
									Create account
								</WrappedPrimaryAction>
								<WrappedSecondaryAction onClick={() => onModeChange("login")}>
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
									onSwitchToSignup={() => onModeChange("signup")}
								/>
							) : (
								<SignupForm
									onEmailPasswordPreviewSubmit={onEmailPasswordPreviewSubmit}
									variant="wrapped-story"
									onSwitchToLogin={() => onModeChange("login")}
								/>
							)}
						</motion.div>
					)}
				</AnimatePresence>
			</div>
		</LayoutGroup>
	);
}

function clampWrappedAuthCardScale(scale: number) {
	return Math.max(
		WRAPPED_AUTH_CARD_SCALE_MIN,
		Math.min(WRAPPED_AUTH_CARD_SCALE_MAX, scale),
	);
}

export function WrappedAuthFlow(props: WrappedAuthFlowProps) {
	const {
		authFormCardScale,
		authIntroCardScale,
		debugControls,
		onEmailPasswordPreviewSubmit,
		previewProfile,
	} = props;
	const [mode, setMode] = useState<WrappedAuthMode>(null);
	const [cardAppearance, setCardAppearance] =
		useState<WrappedAuthCardAppearance>("default");
	const [authCardFlight, setAuthCardFlight] =
		useState<WrappedAuthCardFlight | null>(null);
	const authCardHandoffRef = useRef<HTMLDivElement | null>(null);
	const cardAppearanceTimeoutRef = useRef<number | null>(null);
	const authCardFlightMeasureRef = useRef<number | null>(null);
	const authCardFlightTimerRef = useRef<number | null>(null);
	const [introTool, setIntroTool] = useState<WrappedAuthIntroTool>("Claude");
	const shouldReduceMotion = useReducedMotion() ?? false;
	const hasDebugControls =
		debugControls !== undefined && debugControls !== null;
	const rotateIntroTool = useEffectEvent(() => {
		if (mode !== null || shouldReduceMotion) {
			return;
		}

		startTransition(() => {
			setIntroTool((currentTool) =>
				currentTool === "Claude" ? "Codex" : "Claude",
			);
		});
	});

	useMountEffect(() => {
		const intervalId = window.setInterval(() => {
			rotateIntroTool();
		}, WRAPPED_AUTH_INTRO_TOOL_ROTATION_MS);

		return () => {
			window.clearInterval(intervalId);
		};
	});

	useMountEffect(() => () => {
		clearCardAppearanceTimeout();
		clearWrappedAuthCardFlightAnimationFrame(authCardFlightMeasureRef);
		clearWrappedAuthCardFlightTimer(authCardFlightTimerRef);
	});

	useEffect(() => {
		if (
			!authCardFlight ||
			authCardFlight.to ||
			mode !== authCardFlight.targetMode
		) {
			return;
		}

		clearWrappedAuthCardFlightAnimationFrame(authCardFlightMeasureRef);
		authCardFlightMeasureRef.current = window.requestAnimationFrame(() => {
			const nextRect = getWrappedAuthCardFlightRect(authCardHandoffRef.current);

			if (!nextRect) {
				setAuthCardFlight(null);
				startTransition(() => {
					setCardAppearance(
						getWrappedAuthCardAppearance(authCardFlight.targetMode),
					);
				});
				return;
			}

			setAuthCardFlight((currentFlight) =>
				currentFlight?.key === authCardFlight.key
					? { ...currentFlight, to: nextRect }
					: currentFlight,
			);
			clearWrappedAuthCardFlightTimer(authCardFlightTimerRef);
			authCardFlightTimerRef.current = window.setTimeout(() => {
				setAuthCardFlight(null);
				startTransition(() => {
					setCardAppearance(
						getWrappedAuthCardAppearance(authCardFlight.targetMode),
					);
				});
			}, WRAPPED_AUTH_CARD_FLIGHT_DURATION_MS +
				WRAPPED_AUTH_CARD_FLIGHT_SETTLE_MS);
		});

		return () => {
			clearWrappedAuthCardFlightAnimationFrame(authCardFlightMeasureRef);
		};
	}, [authCardFlight, mode]);

	function clearCardAppearanceTimeout() {
		if (cardAppearanceTimeoutRef.current === null) {
			return;
		}

		window.clearTimeout(cardAppearanceTimeoutRef.current);
		cardAppearanceTimeoutRef.current = null;
	}

	function scheduleCardAppearanceForMode(
		nextMode: WrappedAuthMode,
		appearanceDelayMs: number | null,
	) {
		clearCardAppearanceTimeout();

		const nextAppearance = getWrappedAuthCardAppearance(nextMode);

		if (nextAppearance === cardAppearance) {
			return;
		}

		if (shouldReduceMotion || appearanceDelayMs === null) {
			setCardAppearance(nextAppearance);
			return;
		}

		cardAppearanceTimeoutRef.current = window.setTimeout(() => {
			cardAppearanceTimeoutRef.current = null;
			startTransition(() => {
				setCardAppearance(nextAppearance);
			});
		}, appearanceDelayMs);
	}

	function handleAuthModeChange(nextMode: WrappedAuthMode) {
		clearWrappedAuthCardFlightTimer(authCardFlightTimerRef);
		clearWrappedAuthCardFlightAnimationFrame(authCardFlightMeasureRef);

		const shouldAnimateCardFlight =
			mode === null && nextMode !== null && !shouldReduceMotion;
		const cardFlightFrom = shouldAnimateCardFlight
			? getWrappedAuthCardFlightRect(authCardHandoffRef.current)
			: null;
		const cardFlightTargetMode =
			cardFlightFrom !== null && nextMode !== null ? nextMode : null;
		const appearanceDelayMs =
			mode === null || nextMode === null
				? WRAPPED_AUTH_LAYOUT_DURATION * 1000
				: null;

		if (cardFlightTargetMode) {
			clearCardAppearanceTimeout();
		} else {
			scheduleCardAppearanceForMode(nextMode, appearanceDelayMs);
		}
		setAuthCardFlight(
			cardFlightFrom && cardFlightTargetMode
				? {
						appearance: cardAppearance,
						from: cardFlightFrom,
						key: Date.now(),
						targetMode: cardFlightTargetMode,
					}
				: null,
		);
		startTransition(() => {
			setIntroTool("Claude");
			setMode(nextMode);
		});
	}

	return (
		<WrappedRouteStageShell
			backLabel="Go back"
			leadingControl={mode === null ? null : undefined}
			objectClassName={
				mode
					? "mymind-wrapped-entry-stage__object--auth-form"
					: "mymind-wrapped-entry-stage__object--auth-intro"
			}
			onBack={
				mode === null
					? undefined
					: () => {
							handleAuthModeChange(null);
						}
			}
			status={hasDebugControls ? debugControls : undefined}
			stage={
				<WrappedAuthStage
					authFormCardScale={authFormCardScale}
					authIntroCardScale={authIntroCardScale}
					cardAppearance={cardAppearance}
					cardStageRef={authCardHandoffRef}
					isCardFlightActive={authCardFlight !== null}
					mode={mode}
					onEmailPasswordPreviewSubmit={onEmailPasswordPreviewSubmit}
					onModeChange={handleAuthModeChange}
					previewProfile={previewProfile}
				/>
			}
			overlay={
				<WrappedAuthCardFlightOverlay
					flight={authCardFlight}
					previewProfile={previewProfile}
				/>
			}
			stageClassName={cn("mymind-wrapped-entry-stage--auth")}
			title={
				<WrappedAuthTitle
					introTool={introTool}
					mode={mode}
					shouldReduceMotion={shouldReduceMotion}
				/>
			}
			titleClassName="mymind-wrapped-entry-stage__headline--auth"
			useReferenceTopChrome={mode !== null}
		/>
	);
}

function WrappedAuthCardFlightOverlay(props: {
	flight: WrappedAuthCardFlight | null;
	previewProfile: WrappedGuestPreviewProfile | null;
}) {
	const { flight, previewProfile } = props;

	if (!flight) {
		return null;
	}

	const targetRect = flight.to ?? flight.from;

	return (
		<motion.div
			key={flight.key}
			aria-hidden="true"
			animate={{
				opacity: 1,
				scale: targetRect.scale,
				x: targetRect.left,
				y: targetRect.top,
			}}
			className="mymind-wrapped-auth-card-flight"
			initial={{
				opacity: 1,
				scale: flight.from.scale,
				x: flight.from.left,
				y: flight.from.top,
			}}
			transition={WRAPPED_AUTH_CARD_FLIGHT_TRANSITION}
		>
			<div className="mymind-wrapped-auth-card-flight__card">
				<WrappedGuestPreviewCard
					appearance={flight.appearance}
					profile={previewProfile}
					size="hero"
				/>
			</div>
		</motion.div>
	);
}

function clearWrappedAuthCardFlightTimer(
	timerRef: MutableRefObject<number | null>,
) {
	if (timerRef.current === null) {
		return;
	}

	window.clearTimeout(timerRef.current);
	timerRef.current = null;
}

function clearWrappedAuthCardFlightAnimationFrame(
	timerRef: MutableRefObject<number | null>,
) {
	if (timerRef.current === null) {
		return;
	}

	window.cancelAnimationFrame(timerRef.current);
	timerRef.current = null;
}

function getWrappedAuthCardFlightRect(
	node: HTMLDivElement | null,
): WrappedAuthCardFlightRect | null {
	if (!node) {
		return null;
	}

	const rect = node.getBoundingClientRect();
	if (rect.width <= 0 || rect.height <= 0) {
		return null;
	}

	return {
		left: rect.left,
		scale: rect.width / WRAPPED_AUTH_CARD_FLIGHT_CARD_WIDTH,
		top: rect.top,
	};
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
			<AnimatePresence initial={false} mode="sync">
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

function getWrappedAuthCardAppearance(
	mode: WrappedAuthMode,
): WrappedAuthCardAppearance {
	return mode === "signup" ? "unknown" : "default";
}

function WrappedAuthIntroTerms() {
	return (
		<p className="mymind-wrapped-auth-form__terms">
			By continuing, you agree to our{" "}
			<a
				href="https://rudel.ai/terms"
				target="_blank"
				rel="noopener noreferrer"
				className="mymind-wrapped-auth-form__terms-link"
			>
				Terms of Service
			</a>{" "}
			and{" "}
			<a
				href="https://obsessiondb.com/privacy"
				target="_blank"
				rel="noopener noreferrer"
				className="mymind-wrapped-auth-form__terms-link"
			>
				Privacy Policy
			</a>
			.
		</p>
	);
}
