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
import { useMountEffect } from "@/app/hooks/useMountEffect";
import { LoginForm } from "@/features/auth/LoginForm";
import { SignupForm } from "@/features/auth/SignupForm";
import {
	ClaudeModelIcon,
	CodexModelIcon,
} from "@/features/dashboard/components/DashboardModelBadges";
import {
	WrappedPrimaryAction,
	WrappedSecondaryAction,
} from "@/features/wrapped/actions";
import { cn } from "@/lib/utils";
import { WrappedRouteStageShell } from "./route-stage-shell";
import { WrappedGuestPreviewCard } from "./WrappedGuestPreviewCard";
import {
	getWrappedAuthFormCardOffsetY,
	useWrappedAuthViewportSize,
	WRAPPED_AUTH_FORM_CARD_Y_DEFAULTS,
	type WrappedAuthFormCardYValues,
} from "./wrapped-auth-card-position";
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
	targetMode: WrappedAuthMode;
	to?: WrappedAuthCardFlightRect;
	transitionDurationMs: number;
};

const WRAPPED_AUTH_INTRO_TITLE_LABEL = "Your Claude Wrapped";
const WRAPPED_AUTH_GITHUB_URL = "https://github.com/obsessiondb/rudel";
const WRAPPED_AUTH_HACKER_NEWS_URL =
	"https://news.ycombinator.com/item?id=47350416";
const WRAPPED_AUTH_PRODUCT_HUNT_URL =
	"https://www.producthunt.com/products/rudel?embed=true&utm_source=badge-featured&utm_medium=badge&utm_campaign=badge-claude-code-codex-usage-trading-cards-by-rudel";
const WRAPPED_AUTH_PRODUCT_HUNT_BADGE_SRC =
	"https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1135782&theme=light&t=1777898459345";
const WRAPPED_AUTH_PRODUCT_HUNT_BADGE_ALT =
	"Claude Code & Codex Usage Trading Cards by Rudel - Get your trading card based on your CC & codex usage | Product Hunt";
const WRAPPED_AUTH_INTRO_EASE = [0.22, 1, 0.36, 1] as const;
const WRAPPED_AUTH_EXIT_EASE = [0.4, 0, 0.2, 1] as const;
const WRAPPED_AUTH_LAYOUT_EASE = [0.32, 0.72, 0, 1] as const;
const WRAPPED_AUTH_CARD_FLIGHT_CARD_WIDTH = 233;
const WRAPPED_AUTH_CARD_FLIGHT_DURATION_MS = 720;
const WRAPPED_AUTH_CARD_FLIGHT_SETTLE_MS = 90;
const WRAPPED_AUTH_CARD_FLIGHT_RETARGET_DELAYS_MS = [120, 260, 420] as const;
const WRAPPED_AUTH_CARD_FLIGHT_MIN_RETARGET_DURATION_MS = 180;
const WRAPPED_AUTH_CARD_FLIGHT_TRANSITION = {
	duration: WRAPPED_AUTH_CARD_FLIGHT_DURATION_MS / 1_000,
	ease: WRAPPED_AUTH_LAYOUT_EASE,
};
const WRAPPED_AUTH_CARD_APPEARANCE_DURATION_MS = 480;
const WRAPPED_AUTH_CARD_APPEARANCE_SETTLE_MS = 80;
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
	authFormCardYValues?: WrappedAuthFormCardYValues;
	authIntroCardScale?: number;
	debugControls?: ReactNode;
	onEmailPasswordPreviewSubmit?: (email: string) => void;
	previewProfile: WrappedGuestPreviewProfile | null;
}

interface WrappedAuthStageProps {
	authFormCardScale?: number;
	authFormCardOffsetY?: number;
	authIntroCardScale?: number;
	cardAppearance: WrappedAuthCardAppearance;
	cardAppearanceOverlay: WrappedAuthCardAppearance | null;
	cardStageRef: Ref<HTMLDivElement>;
	isCardFlightActive: boolean;
	mode: WrappedAuthMode;
	onEmailPasswordPreviewSubmit?: (email: string) => void;
	onModeChange: (mode: WrappedAuthMode) => void;
	previewProfile: WrappedGuestPreviewProfile | null;
	suppressIntroCardEnter: boolean;
}

function WrappedAuthStage(props: WrappedAuthStageProps) {
	const {
		authFormCardScale,
		authFormCardOffsetY = 0,
		authIntroCardScale,
		cardAppearance,
		cardAppearanceOverlay,
		cardStageRef,
		isCardFlightActive,
		mode,
		onEmailPasswordPreviewSubmit,
		onModeChange,
		previewProfile,
		suppressIntroCardEnter,
	} = props;
	const shouldReduceMotion = useReducedMotion() ?? false;
	const isIntro = mode === null;
	const activeCardScale = clampWrappedAuthCardScale(
		isIntro
			? (authIntroCardScale ?? WRAPPED_AUTH_INTRO_CARD_SCALE)
			: (authFormCardScale ?? WRAPPED_AUTH_FORM_CARD_SCALE),
	);
	const activeCardOffsetY = isIntro ? 0 : authFormCardOffsetY;
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
					suppressIntroCardEnter && isIntro
						? "mymind-wrapped-auth-panel--suppress-intro-card-enter"
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
						animate={{ scale: activeCardScale, y: activeCardOffsetY }}
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
							appearanceOverlay={cardAppearanceOverlay}
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
		authFormCardYValues,
		authFormCardScale,
		authIntroCardScale,
		debugControls,
		onEmailPasswordPreviewSubmit,
		previewProfile,
	} = props;
	const [mode, setMode] = useState<WrappedAuthMode>(null);
	const [cardAppearance, setCardAppearance] =
		useState<WrappedAuthCardAppearance>("default");
	const [cardAppearanceOverlay, setCardAppearanceOverlay] =
		useState<WrappedAuthCardAppearance | null>(null);
	const [authCardFlight, setAuthCardFlight] =
		useState<WrappedAuthCardFlight | null>(null);
	const [suppressIntroCardEnter, setSuppressIntroCardEnter] = useState(false);
	const authCardHandoffRef = useRef<HTMLDivElement | null>(null);
	const cardAppearanceTimeoutRef = useRef<number | null>(null);
	const cardAppearanceOverlayTimeoutRef = useRef<number | null>(null);
	const authCardFlightMeasureRef = useRef<number | null>(null);
	const authCardFlightRetargetTimersRef = useRef<readonly number[]>([]);
	const authCardFlightTimerRef = useRef<number | null>(null);
	const [introTool, setIntroTool] = useState<WrappedAuthIntroTool>("Claude");
	const shouldReduceMotion = useReducedMotion() ?? false;
	const authViewportSize = useWrappedAuthViewportSize();
	const authFormCardOffsetY = getWrappedAuthFormCardOffsetY({
		values: authFormCardYValues ?? WRAPPED_AUTH_FORM_CARD_Y_DEFAULTS,
		viewportSize: authViewportSize,
	});
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
		clearCardAppearanceOverlayTimeout();
		clearWrappedAuthCardFlightAnimationFrame(authCardFlightMeasureRef);
		clearWrappedAuthCardFlightRetargetTimers(authCardFlightRetargetTimersRef);
		clearWrappedAuthCardFlightTimer(authCardFlightTimerRef);
	});

	const activeAuthCardFlightAppearance = authCardFlight?.appearance;
	const activeAuthCardFlightKey = authCardFlight?.key ?? null;
	const activeAuthCardFlightTargetMode = authCardFlight?.targetMode;
	const transitionCardAppearance = useEffectEvent(
		(
			nextAppearance: WrappedAuthCardAppearance,
			previousAppearance: WrappedAuthCardAppearance,
		) => {
			clearCardAppearanceOverlayTimeout();
			setCardAppearance(nextAppearance);

			if (nextAppearance === previousAppearance || shouldReduceMotion) {
				setCardAppearanceOverlay(null);
				return;
			}

			setCardAppearanceOverlay(previousAppearance);
			cardAppearanceOverlayTimeoutRef.current = window.setTimeout(() => {
				cardAppearanceOverlayTimeoutRef.current = null;
				startTransition(() => {
					setCardAppearanceOverlay(null);
				});
			}, WRAPPED_AUTH_CARD_APPEARANCE_DURATION_MS +
				WRAPPED_AUTH_CARD_APPEARANCE_SETTLE_MS);
		},
	);

	useEffect(() => {
		if (
			activeAuthCardFlightKey === null ||
			activeAuthCardFlightAppearance === undefined ||
			activeAuthCardFlightTargetMode === undefined ||
			mode !== activeAuthCardFlightTargetMode
		) {
			return;
		}

		const flightAppearance = activeAuthCardFlightAppearance;
		const flightKey = activeAuthCardFlightKey;
		const flightTargetMode = activeAuthCardFlightTargetMode;
		const measurementStartTime = performance.now();
		let hasScheduledCompletion = false;

		function completeCardFlight() {
			setAuthCardFlight(null);
			startTransition(() => {
				transitionCardAppearance(
					getWrappedAuthCardAppearance(flightTargetMode),
					flightAppearance,
				);
			});
		}

		function scheduleCardFlightCompletion() {
			if (hasScheduledCompletion) {
				return;
			}

			hasScheduledCompletion = true;
			clearWrappedAuthCardFlightTimer(authCardFlightTimerRef);
			authCardFlightTimerRef.current = window.setTimeout(() => {
				authCardFlightTimerRef.current = null;
				completeCardFlight();
			}, WRAPPED_AUTH_CARD_FLIGHT_DURATION_MS +
				WRAPPED_AUTH_CARD_FLIGHT_SETTLE_MS);
		}

		function getRetargetTransitionDuration() {
			const elapsedMs = performance.now() - measurementStartTime;
			return Math.max(
				WRAPPED_AUTH_CARD_FLIGHT_MIN_RETARGET_DURATION_MS,
				WRAPPED_AUTH_CARD_FLIGHT_DURATION_MS - elapsedMs,
			);
		}

		function measureCardFlightTarget(transitionDurationMs: number) {
			const measuredRect = getWrappedAuthCardFlightRect(
				authCardHandoffRef.current,
			);

			if (!measuredRect) {
				completeCardFlight();
				return;
			}

			setAuthCardFlight((currentFlight) =>
				currentFlight?.key === flightKey
					? { ...currentFlight, to: measuredRect, transitionDurationMs }
					: currentFlight,
			);
			scheduleCardFlightCompletion();
		}

		clearWrappedAuthCardFlightAnimationFrame(authCardFlightMeasureRef);
		authCardFlightMeasureRef.current = window.requestAnimationFrame(() => {
			measureCardFlightTarget(WRAPPED_AUTH_CARD_FLIGHT_DURATION_MS);
		});
		clearWrappedAuthCardFlightRetargetTimers(authCardFlightRetargetTimersRef);
		authCardFlightRetargetTimersRef.current =
			WRAPPED_AUTH_CARD_FLIGHT_RETARGET_DELAYS_MS.map((delayMs) =>
				window.setTimeout(() => {
					measureCardFlightTarget(getRetargetTransitionDuration());
				}, delayMs),
			);

		return () => {
			clearWrappedAuthCardFlightAnimationFrame(authCardFlightMeasureRef);
			clearWrappedAuthCardFlightRetargetTimers(authCardFlightRetargetTimersRef);
		};
	}, [
		activeAuthCardFlightAppearance,
		activeAuthCardFlightKey,
		activeAuthCardFlightTargetMode,
		mode,
	]);

	function clearCardAppearanceTimeout() {
		if (cardAppearanceTimeoutRef.current === null) {
			return;
		}

		window.clearTimeout(cardAppearanceTimeoutRef.current);
		cardAppearanceTimeoutRef.current = null;
	}

	function clearCardAppearanceOverlayTimeout() {
		if (cardAppearanceOverlayTimeoutRef.current === null) {
			return;
		}

		window.clearTimeout(cardAppearanceOverlayTimeoutRef.current);
		cardAppearanceOverlayTimeoutRef.current = null;
	}

	function scheduleCardAppearanceForMode(
		nextMode: WrappedAuthMode,
		appearanceDelayMs: number | null,
	) {
		clearCardAppearanceTimeout();

		const nextAppearance = getWrappedAuthCardAppearance(nextMode);

		if (nextAppearance === cardAppearance) {
			setCardAppearanceOverlay(null);
			return;
		}

		if (shouldReduceMotion || appearanceDelayMs === null) {
			transitionCardAppearance(nextAppearance, cardAppearance);
			return;
		}

		cardAppearanceTimeoutRef.current = window.setTimeout(() => {
			cardAppearanceTimeoutRef.current = null;
			startTransition(() => {
				transitionCardAppearance(nextAppearance, cardAppearance);
			});
		}, appearanceDelayMs);
	}

	function handleAuthModeChange(nextMode: WrappedAuthMode) {
		clearWrappedAuthCardFlightTimer(authCardFlightTimerRef);
		clearWrappedAuthCardFlightAnimationFrame(authCardFlightMeasureRef);
		clearWrappedAuthCardFlightRetargetTimers(authCardFlightRetargetTimersRef);

		const shouldAnimateCardFlight =
			mode !== nextMode &&
			(mode === null || nextMode === null) &&
			!shouldReduceMotion;
		const cardFlightFrom = shouldAnimateCardFlight
			? getWrappedAuthCardFlightRect(authCardHandoffRef.current)
			: null;
		const shouldUseCardFlight = cardFlightFrom !== null;
		const appearanceDelayMs =
			mode === null || nextMode === null
				? WRAPPED_AUTH_LAYOUT_DURATION * 1000
				: null;

		if (shouldUseCardFlight) {
			clearCardAppearanceTimeout();
		} else {
			scheduleCardAppearanceForMode(nextMode, appearanceDelayMs);
		}
		setAuthCardFlight(
			cardFlightFrom
				? {
						appearance: cardAppearance,
						from: cardFlightFrom,
						key: Date.now(),
						targetMode: nextMode,
						transitionDurationMs: WRAPPED_AUTH_CARD_FLIGHT_DURATION_MS,
					}
				: null,
		);
		startTransition(() => {
			setIntroTool("Claude");
			setSuppressIntroCardEnter(nextMode === null);
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
			status={
				mode === null ? (
					<WrappedAuthIntroLaunchLinks />
				) : hasDebugControls ? (
					debugControls
				) : undefined
			}
			stage={
				<WrappedAuthStage
					authFormCardScale={authFormCardScale}
					authFormCardOffsetY={authFormCardOffsetY}
					authIntroCardScale={authIntroCardScale}
					cardAppearance={cardAppearance}
					cardAppearanceOverlay={cardAppearanceOverlay}
					cardStageRef={authCardHandoffRef}
					isCardFlightActive={authCardFlight !== null}
					mode={mode}
					onEmailPasswordPreviewSubmit={onEmailPasswordPreviewSubmit}
					onModeChange={handleAuthModeChange}
					previewProfile={previewProfile}
					suppressIntroCardEnter={
						suppressIntroCardEnter || authCardFlight !== null
					}
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
			transition={{
				...WRAPPED_AUTH_CARD_FLIGHT_TRANSITION,
				duration: flight.transitionDurationMs / 1_000,
			}}
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

function clearWrappedAuthCardFlightRetargetTimers(
	timerRef: MutableRefObject<readonly number[]>,
) {
	for (const timerId of timerRef.current) {
		window.clearTimeout(timerId);
	}

	timerRef.current = [];
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
	const introToolRotateDegrees = introTool === "Claude" ? -2.5 : 2.5;

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
												? { opacity: 1, rotate: introToolRotateDegrees }
												: {
														filter: "blur(0px)",
														opacity: 1,
														rotate: introToolRotateDegrees,
														y: 0,
													}
										}
										className={cn(
											"mymind-wrapped-auth-intro-title__word",
											introTool === "Claude" ? "is-claude" : "is-codex",
										)}
										exit={
											shouldReduceMotion
												? {
														opacity: 0,
														rotate: introToolRotateDegrees,
														transition: {
															duration: WRAPPED_AUTH_INTRO_REDUCED_DURATION,
															ease: "linear" as const,
														},
													}
												: {
														filter: "blur(6px)",
														opacity: 0,
														rotate: introToolRotateDegrees,
														y: -4,
														transition: {
															duration: WRAPPED_AUTH_TITLE_MICRO_DURATION,
															ease: WRAPPED_AUTH_EXIT_EASE,
														},
													}
										}
										initial={
											shouldReduceMotion
												? { opacity: 0, rotate: introToolRotateDegrees }
												: {
														filter: "blur(6px)",
														opacity: 0,
														rotate: introToolRotateDegrees,
														y: 4,
													}
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
										{introTool === "Claude" ? (
											<ClaudeModelIcon className="mymind-wrapped-auth-intro-title__word-icon" />
										) : (
											<CodexModelIcon className="mymind-wrapped-auth-intro-title__word-icon" />
										)}
										<span className="mymind-wrapped-auth-intro-title__word-label">
											{introTool}
											{introTool === "Claude" ? (
												<span
													aria-hidden="true"
													className="mymind-wrapped-auth-intro-title__word-sublabel"
												>
													Code
												</span>
											) : null}
										</span>
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

function WrappedAuthIntroLaunchLinks() {
	return (
		<nav
			aria-label="Rudel launch links"
			className="mymind-wrapped-auth-launch-links"
		>
			<a
				aria-label="View Rudel on GitHub"
				className="mymind-wrapped-auth-launch-link mymind-wrapped-auth-launch-link--github"
				href={WRAPPED_AUTH_GITHUB_URL}
				target="_blank"
				rel="noopener noreferrer"
			>
				<span className="mymind-wrapped-auth-launch-link__badge mymind-wrapped-auth-launch-link__badge--github">
					<svg
						aria-hidden="true"
						className="mymind-wrapped-auth-launch-link__github-icon"
						viewBox="0 0 16 16"
					>
						<path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
					</svg>
					<span className="mymind-wrapped-auth-launch-link__github-count">
						262
					</span>
				</span>
			</a>
			<a
				aria-label="View Rudel on Hacker News"
				className="mymind-wrapped-auth-launch-link mymind-wrapped-auth-launch-link--hacker-news"
				href={WRAPPED_AUTH_HACKER_NEWS_URL}
				target="_blank"
				rel="noopener noreferrer"
			>
				<span className="mymind-wrapped-auth-launch-link__badge mymind-wrapped-auth-launch-link__badge--hacker-news">
					<span className="mymind-wrapped-auth-launch-link__hn-mark">Y</span>
					<span className="mymind-wrapped-auth-launch-link__hn-score">
						<span
							aria-hidden="true"
							className="mymind-wrapped-auth-launch-link__hn-arrow"
						/>
						144
					</span>
				</span>
			</a>
			<a
				aria-label="View Rudel on Product Hunt"
				className="mymind-wrapped-auth-launch-link mymind-wrapped-auth-launch-link--product-hunt"
				href={WRAPPED_AUTH_PRODUCT_HUNT_URL}
				target="_blank"
				rel="noopener noreferrer"
			>
				<img
					alt={WRAPPED_AUTH_PRODUCT_HUNT_BADGE_ALT}
					className="mymind-wrapped-auth-launch-link__product-hunt-badge"
					height={54}
					src={WRAPPED_AUTH_PRODUCT_HUNT_BADGE_SRC}
					width={250}
				/>
			</a>
		</nav>
	);
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
