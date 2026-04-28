import type { WrappedShareAppearance } from "@rudel/api-routes";
import {
	ChevronRight,
	Clipboard,
	Download,
	Loader2,
	Share2,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
	type CSSProperties,
	type RefObject,
	// biome-ignore lint/style/noRestrictedImports: reveal-stage timers are an imperative storyboard bridge for this wrapped surface.
	useEffect,
	useRef,
	useState,
} from "react";
import { Button } from "@/app/ui/button";
import type { TeamPageMemberRow } from "@/features/team/use-team-page-data";
import { WrappedPrimaryAction } from "@/features/wrapped/actions";
import type { WrappedOnboardingMetrics } from "@/features/wrapped/onboarding/types";
import { WrappedStageFrame } from "@/features/wrapped/stage-frame";
import {
	getWrappedArchetypeCardBackgroundValue,
	type WrappedArchetypeCardTheme,
} from "./archetypes";
import { buildWrappedTeamCardBackMetrics } from "./back-metrics";
import {
	WrappedTeamMemberCard,
	type WrappedTeamMemberCardHeaderMetric,
	type WrappedTeamMemberCardStatItem,
	type WrappedTeamMemberCardStatLayerOpacities,
	type WrappedTeamMemberCardTheme,
} from "./card";
import {
	WrappedTeamMemberCardBack,
	type WrappedTeamMemberCardBackMetric,
} from "./card-back";
import { WrappedPrintedCardFlip } from "./printed-card-flip";
import { resolveWrappedShareAppearance } from "./share-appearance";
import { WrappedTeamCardSharePreview } from "./share-preview";
import type { WrappedCardTiltController } from "./tilt/use-card-tilt";

interface WrappedTeamCardStageCardProps {
	headerLeftMetric: WrappedTeamMemberCardHeaderMetric;
	headerRightMetric: WrappedTeamMemberCardHeaderMetric;
	row: TeamPageMemberRow;
	shellClassName: string;
	shellStyle: CSSProperties;
	statItems: readonly WrappedTeamMemberCardStatItem[];
	statLayerOpacities: WrappedTeamMemberCardStatLayerOpacities;
	theme: WrappedTeamMemberCardTheme;
}

interface WrappedTeamCardShareStageProps extends WrappedTeamCardStageCardProps {
	appearance: WrappedShareAppearance;
	backMetrics: readonly WrappedTeamMemberCardBackMetric[];
	frontCardHandoffRef?: RefObject<HTMLDivElement | null>;
	isFrontCardHandoffHidden?: boolean;
	isDownloadPending?: boolean;
	onBack: () => void;
	onCopy: () => void | Promise<void>;
	onContinueToDashboard: () => void;
	onDownload: () => void | Promise<void>;
	onAppearanceChange: (nextValue: WrappedShareAppearance) => void;
	onShare: () => void | Promise<void>;
	shareCardCreatedAtLabel: string;
	sharePostRef: RefObject<HTMLDivElement | null>;
}

interface WrappedTeamCardRevealStageProps
	extends WrappedTeamCardStageCardProps {
	activeArchetype: WrappedArchetypeCardTheme;
	footerActionLabel?: string;
	handoffCardRef?: RefObject<HTMLDivElement | null>;
	isPostHandoffPreparing?: boolean;
	onboardingMetrics: WrappedOnboardingMetrics;
	onPreviewPost: () => void;
	onRevealComplete?: () => void;
	revealedFooterActionLabel?: string;
	isPreviewPostVisible: boolean;
	shareCardCreatedAtLabel: string;
	tiltController: WrappedCardTiltController;
}

interface WrappedRevealArchetypeTitleStyle extends CSSProperties {
	"--wrapped-reveal-archetype-accent": string;
	"--wrapped-reveal-archetype-gt-direction": string;
	"--wrapped-reveal-archetype-gt-gradient": string;
}

type WrappedRevealIntroPhase = "name" | "line" | "accent" | "description";
type WrappedRevealGradientTextState = "active" | "waiting";

const WRAPPED_REVEAL_TEXT_DARK = "#17161c";
const WRAPPED_REVEAL_GRADIENT_COLOR_PATTERN = /#[\da-fA-F]{3,8}\b/g;
const WRAPPED_REVEAL_LINEAR_GRADIENT_PATTERN =
	/^linear-gradient\(([^,]+),\s*(.+)\)$/;

interface WrappedRevealTextGradient {
	accent: string;
	direction: string;
	stops: string;
}

function formatWrappedRevealGradientStopPosition(position: number) {
	return position.toFixed(2).replace(/\.?0+$/, "");
}

function buildWrappedRevealTextGradientStops(colors: readonly string[]) {
	if (colors.length === 0) {
		return `${WRAPPED_REVEAL_TEXT_DARK} 0%, ${WRAPPED_REVEAL_TEXT_DARK} 100%`;
	}

	if (colors.length === 1) {
		return `${WRAPPED_REVEAL_TEXT_DARK} 0%, ${WRAPPED_REVEAL_TEXT_DARK} 40%, ${colors[0]} 48%, ${colors[0]} 100%`;
	}

	const colorRangeStart = 48;
	const colorRangeEnd = 100;
	const colorRange = colorRangeEnd - colorRangeStart;
	const colorDenominator = Math.max(colors.length - 1, 1);
	const colorStops = colors
		.map((color, index) => {
			const stopPosition =
				colorRangeStart + (colorRange * index) / colorDenominator;

			return `${color} ${formatWrappedRevealGradientStopPosition(stopPosition)}%`;
		})
		.join(", ");

	return `${WRAPPED_REVEAL_TEXT_DARK} 0%, ${WRAPPED_REVEAL_TEXT_DARK} 40%, ${colorStops}`;
}

function buildWrappedRevealTextAccentGradient(input: {
	colors: readonly string[];
	direction: string;
}) {
	const { colors, direction } = input;

	if (colors.length === 0) {
		return WRAPPED_REVEAL_TEXT_DARK;
	}

	if (colors.length === 1) {
		return colors[0];
	}

	const denominator = Math.max(colors.length - 1, 1);
	const colorStops = colors
		.map((color, index) => {
			const stopPosition = (100 * index) / denominator;

			return `${color} ${formatWrappedRevealGradientStopPosition(stopPosition)}%`;
		})
		.join(", ");

	return `linear-gradient(${direction}, ${colorStops})`;
}

function getWrappedRevealTextGradientValue(
	theme: WrappedArchetypeCardTheme,
): WrappedRevealTextGradient {
	const cardBackgroundValue = getWrappedArchetypeCardBackgroundValue(theme);
	const gradientMatch = cardBackgroundValue?.match(
		WRAPPED_REVEAL_LINEAR_GRADIENT_PATTERN,
	);
	const colors = cardBackgroundValue?.match(
		WRAPPED_REVEAL_GRADIENT_COLOR_PATTERN,
	);
	const direction = gradientMatch?.[1]?.trim() ?? "184deg";
	const gradientColors = colors ?? [];

	return {
		accent: buildWrappedRevealTextAccentGradient({
			colors: gradientColors,
			direction,
		}),
		direction,
		stops: buildWrappedRevealTextGradientStops(gradientColors),
	};
}

function WrappedArchetypeGradientText(props: {
	activeArchetype: WrappedArchetypeCardTheme;
	className: string;
	isHoverReplayEnabled?: boolean;
	state: WrappedRevealGradientTextState;
}) {
	const {
		activeArchetype,
		className,
		isHoverReplayEnabled = false,
		state,
	} = props;
	const gradient = getWrappedRevealTextGradientValue(activeArchetype);
	const style: WrappedRevealArchetypeTitleStyle = {
		"--wrapped-reveal-archetype-accent": gradient.accent,
		"--wrapped-reveal-archetype-gt-direction": gradient.direction,
		"--wrapped-reveal-archetype-gt-gradient": gradient.stops,
	};
	const classNames = `mymind-wrapped-final-stage__gradient-text ${className}${
		activeArchetype.id === "needs_to_touch_grass" ? " is-obsession" : ""
	}`;

	return (
		<span
			className={classNames}
			data-accent-state={state}
			data-hover-replay={
				isHoverReplayEnabled && state === "active" ? "ready" : undefined
			}
			data-label={activeArchetype.displayLabel}
			style={style}
		>
			{activeArchetype.displayLabel}
		</span>
	);
}

/* ─────────────────────────────────────────────────────────
 * REVEAL COMPANION STORYBOARD
 *
 * Read top-to-bottom. Each `at` value is ms after the flip trigger.
 *
 *    0ms   card flips 180deg → 0deg while staying centered
 *  680ms   flipped card slides into the revealed composition
 *  760ms   archetype copy resolves beside/above the card
 *    0ms   on share trigger, copy exits and card recenters
 *  580ms   share handoff measures the recentered card and begins
 * ───────────────────────────────────────────────────────── */
const REVEAL_COMPANION_TIMING = {
	copyEnter: 0.08, // seconds after the card slide starts before copy resolves
	exitToShareMs: 580, // ms before measuring the card for the share handoff
} as const;

const REVEAL_COMPANION_COPY = {
	enterBlur: "14px",
	exitBlur: "10px",
	enterOffsetY: 16,
	exitOffsetY: -10,
	initialScale: 0.986,
	finalScale: 1,
	exitScale: 0.992,
	transition: {
		duration: 0.34,
		ease: [0.22, 1, 0.36, 1] as const,
	},
};

/* ─────────────────────────────────────────────────────────
 * REVEAL INTRO STORYBOARD
 *
 * Read top-to-bottom. Each `at` value is ms after intro mount.
 *
 *    0ms   user name is visible, archetype line stays invisible
 *  850ms   "you're a {archetype}" fades in as black text
 * 1520ms   archetype word sweeps into the card colorway
 * 2140ms   archetype description resolves and Continue becomes available
 *  click   intro exits, card drops, normal reveal flow resumes
 * ───────────────────────────────────────────────────────── */
const REVEAL_INTRO_TIMING = {
	accentRevealMs: 1_520, // ms after mount when the archetype color sweep starts
	descriptionRevealMs: 2_140, // ms after mount when the description and gate appear
	lineRevealMs: 850, // ms after mount when the second line fades in
} as const;

const REVEAL_INTRO_COPY = {
	descriptionBlur: "10px",
	descriptionOffsetY: 14,
	enterBlur: "14px",
	exitBlur: "8px",
	lineOffsetY: 14,
	initialScale: 0.986,
	finalScale: 1,
	exitScale: 1.012,
	transition: {
		duration: 0.32,
		ease: [0.22, 1, 0.36, 1] as const,
	},
	lineTransition: {
		duration: 0.42,
		ease: [0.22, 1, 0.36, 1] as const,
	},
	descriptionTransition: {
		duration: 0.44,
		ease: [0.22, 1, 0.36, 1] as const,
	},
};

const WRAPPED_SHARE_VARIANTS: ReadonlyArray<{
	appearance: WrappedShareAppearance;
	description: string;
	label: "1" | "2";
}> = [
	{
		appearance: {
			layoutMode: "front",
			showArchetypeLabel: true,
		},
		description: "One card",
		label: "1",
	},
	{
		appearance: {
			layoutMode: "front_back",
			showArchetypeLabel: true,
		},
		description: "Two cards",
		label: "2",
	},
];

const REVEAL_STAGE_MOTION = {
	duration: {
		card: 1.02,
		flip: 0.68,
	},
	easing: {
		drop: [0.16, 1, 0.22, 1] as const,
		flip: [0.32, 0.72, 0, 1] as const,
	},
};

const REVEAL_STAGE_CARD_DROP_DURATION_MS = Math.round(
	REVEAL_STAGE_MOTION.duration.card * 1_000,
);
const REVEAL_STAGE_CARD_FLIP_DURATION_MS = Math.round(
	REVEAL_STAGE_MOTION.duration.flip * 1_000,
);
const WRAPPED_FINAL_SHARE_CHROME_EASE = [0.22, 1, 0.36, 1] as const;

export function WrappedTeamCardShareStage(
	props: WrappedTeamCardShareStageProps,
) {
	const {
		appearance,
		backMetrics,
		frontCardHandoffRef,
		headerLeftMetric,
		headerRightMetric,
		isDownloadPending = false,
		isFrontCardHandoffHidden = false,
		onBack,
		onCopy,
		onContinueToDashboard,
		onDownload,
		onAppearanceChange,
		onShare,
		row,
		shareCardCreatedAtLabel,
		sharePostRef,
		shellClassName,
		shellStyle,
		statItems,
		statLayerOpacities,
		theme,
	} = props;
	const shouldReduceMotion = useReducedMotion();
	const reduceMotion = shouldReduceMotion ?? false;
	const resolvedAppearance = resolveWrappedShareAppearance(appearance);
	const shareObjectShellRef = useWrappedShareStageObjectSize();

	return (
		<WrappedStageFrame
			className="mymind-wrapped-final-stage mymind-wrapped-final-stage--share"
			copyClassName="mymind-wrapped-final-stage__copy"
			objectClassName="mymind-wrapped-final-stage__object"
			supportClassName="mymind-wrapped-final-stage__support"
			copy={
				<motion.div
					{...getWrappedShareChromeMotion({
						delay: 0.12,
						reduceMotion,
						y: 10,
					})}
					className="mymind-wrapped-final-stage__share-copy-shell"
				>
					<h1 className="mymind-wrapped-stage-copy__headline mymind-wrapped-final-stage__headline">
						Show this to world
					</h1>
				</motion.div>
			}
			object={
				<div
					ref={shareObjectShellRef}
					className="mymind-wrapped-final-stage__share-object-shell"
				>
					<motion.div layout className="mymind-wrapped-share-surface">
						<motion.div
							{...getWrappedShareChromeMotion({
								delay: 0.22,
								reduceMotion,
								y: -8,
							})}
							className="mymind-wrapped-share-surface__rail"
						>
							<fieldset
								aria-label="Post variants"
								className="mymind-wrapped-share-variant-picker"
							>
								{WRAPPED_SHARE_VARIANTS.map((variant) => {
									const isActive = isWrappedShareAppearanceActive({
										currentValue: resolvedAppearance,
										targetValue: variant.appearance,
									});

									return (
										<Button
											key={variant.label}
											type="button"
											size="sm"
											variant="outline"
											aria-label={variant.description}
											aria-pressed={isActive}
											title={variant.description}
											className="mymind-wrapped-share-variant-button"
											data-active={isActive ? "true" : "false"}
											onClick={() => onAppearanceChange(variant.appearance)}
										>
											{variant.label}
										</Button>
									);
								})}
							</fieldset>

							<div
								role="toolbar"
								aria-label="Share card actions"
								className="mymind-wrapped-share-toolbar"
							>
								<Button
									type="button"
									size="icon-sm"
									variant="outline"
									aria-label="Copy image"
									className="mymind-wrapped-share-toolbar__button"
									onClick={onCopy}
								>
									<Clipboard className="size-4" />
								</Button>
								<Button
									type="button"
									size="icon-sm"
									variant="outline"
									aria-busy={isDownloadPending ? "true" : undefined}
									aria-label={
										isDownloadPending ? "Downloading PNG" : "Download PNG"
									}
									className="mymind-wrapped-share-toolbar__button"
									disabled={isDownloadPending}
									onClick={onDownload}
								>
									{isDownloadPending ? (
										<Loader2 className="size-4 animate-spin" />
									) : (
										<Download className="size-4" />
									)}
								</Button>
							</div>
						</motion.div>

						<div className="mymind-wrapped-share-surface__preview">
							<WrappedTeamCardSharePreview
								appearance={resolvedAppearance}
								backMetrics={backMetrics}
								frontCardHandoffRef={frontCardHandoffRef}
								headerLeftMetric={headerLeftMetric}
								headerRightMetric={headerRightMetric}
								isChromeEntranceAnimated
								isFrontCardHandoffHidden={isFrontCardHandoffHidden}
								row={row}
								shareCardCreatedAtLabel={shareCardCreatedAtLabel}
								sharePostRef={sharePostRef}
								shellClassName={shellClassName}
								shellStyle={shellStyle}
								statItems={statItems}
								statLayerOpacities={statLayerOpacities}
								theme={theme}
							/>
						</div>
					</motion.div>
				</div>
			}
			support={
				<>
					<motion.div
						{...getWrappedShareChromeMotion({
							delay: 0.42,
							reduceMotion,
							y: 12,
						})}
					>
						<nav className="mymind-wrapped-share-actions">
							<Button
								type="button"
								size="lg"
								className="mymind-wrapped-share-actions__primary"
								onClick={onShare}
							>
								<Share2 className="size-4" />
								Share to X
							</Button>
						</nav>
					</motion.div>

					<motion.div
						{...getWrappedShareChromeMotion({
							delay: 0.48,
							reduceMotion,
							y: 12,
						})}
						className="mymind-wrapped-share-actions__meta-grid"
					>
						<Button
							type="button"
							size="lg"
							variant="outline"
							className="mymind-wrapped-share-actions__secondary"
							onClick={onBack}
						>
							Back to card
						</Button>
						<Button
							type="button"
							size="lg"
							variant="outline"
							aria-label="Continue to dashboard"
							className="mymind-wrapped-share-actions__secondary"
							onClick={onContinueToDashboard}
						>
							Continue
						</Button>
					</motion.div>
				</>
			}
		/>
	);
}

function isWrappedShareAppearanceActive(input: {
	currentValue: WrappedShareAppearance;
	targetValue: WrappedShareAppearance;
}) {
	const { currentValue, targetValue } = input;

	return currentValue.layoutMode === targetValue.layoutMode;
}

function useWrappedShareStageObjectSize() {
	const shareObjectShellRef = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		if (typeof window === "undefined") {
			return;
		}

		const shell = shareObjectShellRef.current;

		if (!shell) {
			return;
		}

		const shellElement = shell;
		const objectFrame =
			shellElement.closest<HTMLElement>(
				".mymind-wrapped-final-stage__object",
			) ?? shellElement.parentElement;
		const rail = shellElement.querySelector<HTMLElement>(
			".mymind-wrapped-share-surface__rail",
		);
		let animationFrameId: number | null = null;
		let lastAppliedSize = "";

		function updateShareObjectSize() {
			animationFrameId = null;

			const objectFrameRect = objectFrame?.getBoundingClientRect();
			const railRect = rail?.getBoundingClientRect();
			const availableWidth = objectFrameRect?.width ?? shellElement.clientWidth;
			const availableHeight = objectFrameRect?.height ?? 0;
			const railHeight = railRect?.height ?? 0;
			const availablePreviewSize = Math.floor(
				Math.max(0, Math.min(availableWidth, availableHeight - railHeight)),
			);

			if (availablePreviewSize <= 0) {
				return;
			}

			const nextAppliedSize = `${availablePreviewSize}px`;

			if (nextAppliedSize === lastAppliedSize) {
				return;
			}

			lastAppliedSize = nextAppliedSize;
			shellElement.style.setProperty(
				"--wrapped-share-object-available-size",
				nextAppliedSize,
			);
		}

		function scheduleShareObjectSizeUpdate() {
			if (animationFrameId !== null) {
				return;
			}

			animationFrameId = window.requestAnimationFrame(updateShareObjectSize);
		}

		updateShareObjectSize();
		window.addEventListener("resize", scheduleShareObjectSizeUpdate);

		if (!window.ResizeObserver) {
			return () => {
				window.removeEventListener("resize", scheduleShareObjectSizeUpdate);
				if (animationFrameId !== null) {
					window.cancelAnimationFrame(animationFrameId);
				}
			};
		}

		const resizeObserver = new window.ResizeObserver(
			scheduleShareObjectSizeUpdate,
		);

		resizeObserver.observe(shellElement);
		if (objectFrame) {
			resizeObserver.observe(objectFrame);
		}
		if (rail) {
			resizeObserver.observe(rail);
		}

		return () => {
			window.removeEventListener("resize", scheduleShareObjectSizeUpdate);
			if (animationFrameId !== null) {
				window.cancelAnimationFrame(animationFrameId);
			}
			resizeObserver.disconnect();
		};
	}, []);

	return shareObjectShellRef;
}

function getWrappedShareChromeMotion(input: {
	delay: number;
	reduceMotion: boolean;
	y: number;
}) {
	const { delay, reduceMotion, y } = input;

	if (reduceMotion) {
		return {
			animate: { opacity: 1 },
			initial: { opacity: 0 },
			transition: {
				delay: Math.min(delay, 0.08),
				duration: 0.14,
				ease: "linear" as const,
			},
		};
	}

	return {
		animate: { filter: "blur(0px)", opacity: 1, y: 0 },
		initial: { filter: "blur(8px)", opacity: 0, y },
		transition: {
			delay,
			duration: 0.32,
			ease: WRAPPED_FINAL_SHARE_CHROME_EASE,
		},
	};
}

export function WrappedTeamCardRevealStage(
	props: WrappedTeamCardRevealStageProps,
) {
	const {
		activeArchetype,
		footerActionLabel = "Continue",
		handoffCardRef,
		headerLeftMetric,
		headerRightMetric,
		isPostHandoffPreparing = false,
		isPreviewPostVisible,
		onboardingMetrics,
		onPreviewPost,
		onRevealComplete,
		revealedFooterActionLabel,
		row,
		shellClassName,
		shellStyle,
		shareCardCreatedAtLabel,
		statItems,
		statLayerOpacities,
		theme,
		tiltController,
	} = props;
	const shouldReduceMotion = useReducedMotion();
	const reduceMotion = shouldReduceMotion ?? false;
	const [introPhase, setIntroPhase] = useState<WrappedRevealIntroPhase>(() =>
		reduceMotion ? "accent" : "name",
	);
	const [isCardDropped, setIsCardDropped] = useState(() => reduceMotion);
	const [isCardFrontVisible, setIsCardFrontVisible] = useState(false);
	const [hasCardFrontBeenRevealed, setHasCardFrontBeenRevealed] =
		useState(false);
	const [isCardFlipAnimating, setIsCardFlipAnimating] = useState(false);
	const [isRevealExitPending, setIsRevealExitPending] = useState(false);
	const revealTimerRefs = useRef<number[]>([]);
	const onRevealCompleteRef = useRef(onRevealComplete);
	const revealCopy = getWrappedRevealCopy(activeArchetype);
	const revealBackMetrics = getWrappedRevealBackMetrics({
		onboardingMetrics,
		row,
		shareCardCreatedAtLabel,
	});
	const shouldShowRevealIntroLine =
		introPhase === "line" ||
		introPhase === "accent" ||
		introPhase === "description";
	const shouldShowRevealIntroAccent =
		introPhase === "accent" || introPhase === "description";
	const shouldShowRevealIntroDescription = introPhase === "description";
	const shouldShowRevealIntroContinue =
		!isCardDropped && shouldShowRevealIntroDescription;
	const shouldShowArchetypeCompanion =
		isCardDropped &&
		isCardFrontVisible &&
		hasCardFrontBeenRevealed &&
		!isCardFlipAnimating &&
		!isRevealExitPending;
	const revealCompanionState = shouldShowArchetypeCompanion
		? "visible"
		: isRevealExitPending
			? "exiting"
			: "hidden";
	const revealFooterLabel = shouldShowArchetypeCompanion
		? (revealedFooterActionLabel ?? footerActionLabel)
		: footerActionLabel;
	const shouldShowRevealFooter =
		shouldShowRevealIntroContinue || (isCardDropped && isPreviewPostVisible);
	const printedCardCaptureKey = [
		activeArchetype.id,
		row.userId,
		row.displayName,
		row.imageUrl ?? "",
		theme,
		shellClassName,
		headerLeftMetric.value,
		headerRightMetric.value,
		...statItems.map((item) => `${item.key}:${item.value}`),
		...revealBackMetrics.map((metric) => `${metric.label}:${metric.value}`),
	].join("|");

	useEffect(() => {
		onRevealCompleteRef.current = onRevealComplete;
	}, [onRevealComplete]);

	function clearRevealTimers() {
		for (const timeoutId of revealTimerRefs.current) {
			window.clearTimeout(timeoutId);
		}

		revealTimerRefs.current = [];
	}

	function notifyRevealComplete() {
		onRevealCompleteRef.current?.();
	}

	// biome-ignore lint/correctness/useExhaustiveDependencies: the reveal sequence should restart when the active archetype changes.
	useEffect(() => {
		clearRevealTimers();

		if (reduceMotion) {
			setIntroPhase("description");
			setIsCardDropped(false);
			setIsCardFrontVisible(false);
			setHasCardFrontBeenRevealed(false);
			setIsCardFlipAnimating(false);
			setIsRevealExitPending(false);
			return;
		}

		setIntroPhase("name");
		setIsCardDropped(false);
		setIsCardFrontVisible(false);
		setHasCardFrontBeenRevealed(false);
		setIsCardFlipAnimating(false);
		setIsRevealExitPending(false);
		const timeoutIds = [
			window.setTimeout(() => {
				setIntroPhase("line");
			}, REVEAL_INTRO_TIMING.lineRevealMs),
			window.setTimeout(() => {
				setIntroPhase("accent");
			}, REVEAL_INTRO_TIMING.accentRevealMs),
			window.setTimeout(() => {
				setIntroPhase("description");
			}, REVEAL_INTRO_TIMING.descriptionRevealMs),
		];
		revealTimerRefs.current = timeoutIds;

		return () => {
			clearRevealTimers();
		};
	}, [activeArchetype.id, reduceMotion]);

	useEffect(() => {
		if (!isRevealExitPending) {
			return;
		}

		if (reduceMotion) {
			onPreviewPost();
			return;
		}

		const timeoutId = window.setTimeout(() => {
			onPreviewPost();
		}, REVEAL_COMPANION_TIMING.exitToShareMs);

		return () => {
			window.clearTimeout(timeoutId);
		};
	}, [isRevealExitPending, onPreviewPost, reduceMotion]);

	useEffect(() => {
		if (!isCardFlipAnimating || reduceMotion) {
			return;
		}

		const timeoutId = window.setTimeout(() => {
			setIsCardFlipAnimating(false);
		}, REVEAL_STAGE_CARD_FLIP_DURATION_MS);

		return () => {
			window.clearTimeout(timeoutId);
		};
	}, [isCardFlipAnimating, reduceMotion]);

	function startRevealCardDrop() {
		clearRevealTimers();
		setIsCardDropped(true);

		if (reduceMotion) {
			notifyRevealComplete();
			return;
		}

		const timeoutId = window.setTimeout(() => {
			notifyRevealComplete();
		}, REVEAL_STAGE_CARD_DROP_DURATION_MS);

		revealTimerRefs.current = [timeoutId];
	}

	function handleCardFlipToggle() {
		if (
			!isCardDropped ||
			isCardFlipAnimating ||
			isRevealExitPending ||
			hasCardFrontBeenRevealed
		) {
			return;
		}

		tiltController.handlePointerLeave();
		setHasCardFrontBeenRevealed(true);

		if (reduceMotion) {
			setIsCardFrontVisible(true);
			return;
		}

		setIsCardFlipAnimating(true);
		setIsCardFrontVisible(true);
	}

	function handleRevealFooterAction() {
		if (!isCardDropped) {
			if (!shouldShowRevealIntroContinue) {
				return;
			}

			startRevealCardDrop();
			return;
		}

		if (!hasCardFrontBeenRevealed || !isCardFrontVisible) {
			handleCardFlipToggle();
			return;
		}

		tiltController.handlePointerLeave();
		setIsRevealExitPending(true);
	}

	return (
		<WrappedStageFrame
			className={`mymind-wrapped-final-stage mymind-wrapped-final-stage--reveal${
				isPostHandoffPreparing
					? " mymind-wrapped-final-stage--handoff-preparing"
					: ""
			}`}
			objectClassName="mymind-wrapped-final-stage__object mymind-wrapped-final-stage__object--canvas"
			supportClassName="mymind-wrapped-final-stage__support"
			object={
				<div className="mymind-wrapped-final-stage__canvas">
					<div className="mymind-wrapped-final-stage__text-layer">
						<AnimatePresence initial={false} mode="wait">
							{!isCardDropped ? (
								<motion.div
									key={`${activeArchetype.id}:intro`}
									animate={{
										filter: "blur(0px)",
										opacity: 1,
										scale: REVEAL_INTRO_COPY.finalScale,
										y: 0,
									}}
									exit={{
										filter: `blur(${REVEAL_INTRO_COPY.exitBlur})`,
										opacity: 0,
										scale: REVEAL_INTRO_COPY.exitScale,
										y: -18,
									}}
									initial={{
										filter: `blur(${REVEAL_INTRO_COPY.enterBlur})`,
										opacity: 0,
										scale: REVEAL_INTRO_COPY.initialScale,
										y: 18,
									}}
									className="mymind-wrapped-final-stage__canvas-copy-shell"
									transition={REVEAL_INTRO_COPY.transition}
								>
									<h1 className="mymind-wrapped-final-stage__canvas-copy">
										<span className="mymind-wrapped-final-stage__canvas-copy-name">
											{row.displayName},
										</span>
										<motion.span
											animate={{
												opacity: shouldShowRevealIntroLine ? 1 : 0,
												y: shouldShowRevealIntroLine
													? 0
													: REVEAL_INTRO_COPY.lineOffsetY,
											}}
											aria-hidden={!shouldShowRevealIntroLine}
											className="mymind-wrapped-final-stage__canvas-copy-line"
											initial={false}
											transition={REVEAL_INTRO_COPY.lineTransition}
										>
											you&apos;re a{" "}
											<WrappedArchetypeGradientText
												activeArchetype={activeArchetype}
												className="mymind-wrapped-final-stage__intro-accent"
												state={
													shouldShowRevealIntroAccent ? "active" : "waiting"
												}
											/>
										</motion.span>
									</h1>
									<motion.p
										animate={{
											filter: shouldShowRevealIntroDescription
												? "blur(0px)"
												: `blur(${REVEAL_INTRO_COPY.descriptionBlur})`,
											opacity: shouldShowRevealIntroDescription ? 1 : 0,
											y: shouldShowRevealIntroDescription
												? 0
												: REVEAL_INTRO_COPY.descriptionOffsetY,
										}}
										aria-hidden={!shouldShowRevealIntroDescription}
										className="mymind-wrapped-final-stage__canvas-description"
										initial={false}
										transition={REVEAL_INTRO_COPY.descriptionTransition}
									>
										{revealCopy.description}
									</motion.p>
								</motion.div>
							) : null}
						</AnimatePresence>
					</div>
					<motion.div
						animate={resolveWrappedRevealCardAnimate({
							isCardDropped,
							reduceMotion,
						})}
						className="mymind-wrapped-final-stage__card-drop-layer"
						data-card-state={isCardDropped ? "dropped" : "waiting"}
						initial={false}
						style={{
							pointerEvents: isCardDropped ? "auto" : "none",
							transformPerspective: 2200,
							transformStyle: "preserve-3d",
						}}
						transition={resolveWrappedRevealCardTransition({
							isCardDropped,
							reduceMotion,
						})}
					>
						<div
							className="mymind-wrapped-final-stage__reveal-stage"
							data-companion-state={revealCompanionState}
							data-motion={reduceMotion ? "reduced" : "standard"}
						>
							<div className="mymind-wrapped-final-stage__slide-card-slot">
								<div className="team-lineup-card-tilt-stage mymind-wrapped-final-stage__card-visual-stage w-full max-w-[16rem] min-[360px]:max-w-[16.75rem] sm:max-w-none">
									<div
										ref={handoffCardRef}
										className="mymind-wrapped-final-stage__card-morph-shell"
										onPointerMove={(event) => {
											if (
												!isCardFlipAnimating &&
												!isPostHandoffPreparing &&
												!isRevealExitPending
											) {
												tiltController.handlePointerMove(event);
											}
										}}
										onPointerEnter={tiltController.handlePointerEnter}
										onPointerLeave={tiltController.handlePointerLeave}
										onPointerCancel={tiltController.handlePointerLeave}
									>
										<div
											ref={tiltController.cardTiltRef}
											className="team-lineup-card-tilt-shell mymind-wrapped-final-stage__tilt-shell [--wrapped-card-render-scale:1] min-[360px]:[--wrapped-card-render-scale:1.08] sm:[--wrapped-card-render-scale:1.42] lg:[--wrapped-card-render-scale:1.56]"
											data-flip-active={isCardFlipAnimating ? "true" : "false"}
											style={
												{
													"--wrapped-card-flip-rotate-y": isCardFrontVisible
														? "0deg"
														: "180deg",
												} as CSSProperties
											}
										>
											<button
												aria-label={
													isCardFrontVisible
														? "Card revealed"
														: "Reveal front of card"
												}
												aria-pressed={isCardFrontVisible}
												className="mymind-wrapped-final-stage__flip-control"
												data-card-face={isCardFrontVisible ? "front" : "back"}
												disabled={
													!isCardDropped ||
													isCardFrontVisible ||
													isPostHandoffPreparing ||
													isRevealExitPending
												}
												onClick={handleCardFlipToggle}
												type="button"
											>
												<WrappedPrintedCardFlip
													captureKey={printedCardCaptureKey}
													front={
														<div className="grid justify-center">
															<WrappedTeamMemberCard
																disableOuterShadow
																headerLeftMetric={headerLeftMetric}
																headerRightMetric={headerRightMetric}
																hideHeaderLogo
																layoutPreset="team-card-preview"
																mediaPanelClassName="mx-auto"
																row={row}
																shellClassName={shellClassName}
																shellStyle={shellStyle}
																statItems={statItems}
																statLayerOpacities={statLayerOpacities}
																statTileClassName=""
																theme={theme}
															/>
														</div>
													}
													back={
														<div className="grid justify-center">
															<WrappedTeamMemberCardBack
																disableOuterShadow
																metrics={revealBackMetrics}
																shellClassName={shellClassName}
																shellStyle={shellStyle}
																theme={theme}
															/>
														</div>
													}
													isFrontVisible={isCardFrontVisible}
													reduceMotion={reduceMotion}
												/>
											</button>
										</div>
									</div>
								</div>
							</div>

							<AnimatePresence>
								{shouldShowArchetypeCompanion ? (
									<motion.aside
										key={activeArchetype.id}
										animate={{
											filter: "blur(0px)",
											opacity: 1,
											scale: REVEAL_COMPANION_COPY.finalScale,
											y: 0,
										}}
										className="mymind-wrapped-final-stage__archetype-copy"
										exit={{
											filter: `blur(${REVEAL_COMPANION_COPY.exitBlur})`,
											opacity: 0,
											scale: REVEAL_COMPANION_COPY.exitScale,
											y: REVEAL_COMPANION_COPY.exitOffsetY,
										}}
										initial={{
											filter: `blur(${REVEAL_COMPANION_COPY.enterBlur})`,
											opacity: 0,
											scale: REVEAL_COMPANION_COPY.initialScale,
											y: REVEAL_COMPANION_COPY.enterOffsetY,
										}}
										transition={
											reduceMotion
												? { duration: 0 }
												: {
														...REVEAL_COMPANION_COPY.transition,
														delay: REVEAL_COMPANION_TIMING.copyEnter,
													}
										}
									>
										<h2 className="mymind-wrapped-final-stage__archetype-title">
											<span className="mymind-wrapped-final-stage__archetype-name">
												{row.displayName},
											</span>
											<span className="mymind-wrapped-final-stage__archetype-line">
												you&apos;re a{" "}
												<WrappedArchetypeGradientText
													activeArchetype={activeArchetype}
													className="mymind-wrapped-final-stage__archetype-accent"
													isHoverReplayEnabled
													state="active"
												/>
											</span>
										</h2>
										<p className="mymind-wrapped-final-stage__archetype-description">
											{revealCopy.description}
										</p>
									</motion.aside>
								) : null}
							</AnimatePresence>
						</div>
					</motion.div>
				</div>
			}
			support={
				<WrappedTeamCardRevealFooter
					isDisabled={
						isCardFlipAnimating || isPostHandoffPreparing || isRevealExitPending
					}
					isVisible={shouldShowRevealFooter}
					label={revealFooterLabel}
					onAction={handleRevealFooterAction}
				/>
			}
		/>
	);
}

function getWrappedRevealBackMetrics(input: {
	onboardingMetrics: WrappedOnboardingMetrics;
	row: TeamPageMemberRow;
	shareCardCreatedAtLabel: string;
}) {
	return buildWrappedTeamCardBackMetrics(input);
}

function resolveWrappedRevealCardAnimate(input: {
	isCardDropped: boolean;
	reduceMotion: boolean;
}) {
	const { isCardDropped, reduceMotion } = input;

	if (reduceMotion) {
		return {
			filter: "blur(0px)",
			opacity: 1,
			rotate: "0deg",
			rotateX: "0deg",
			scale: 1,
			y: 0,
		};
	}

	if (!isCardDropped) {
		return {
			filter: "blur(24px)",
			opacity: 0,
			rotate: "-10deg",
			rotateX: "76deg",
			scale: 2.65,
			y: -240,
		};
	}

	return {
		filter: "blur(0px)",
		opacity: 1,
		rotate: "0deg",
		rotateX: "0deg",
		scale: 1,
		y: 0,
	};
}

function resolveWrappedRevealCardTransition(input: {
	isCardDropped: boolean;
	reduceMotion: boolean;
}) {
	const { isCardDropped, reduceMotion } = input;

	if (reduceMotion) {
		return {
			duration: 0.14,
			ease: "linear" as const,
		};
	}

	if (!isCardDropped) {
		return {
			duration: 0,
		};
	}

	return {
		duration: REVEAL_STAGE_MOTION.duration.card,
		ease: REVEAL_STAGE_MOTION.easing.drop,
	};
}

function getWrappedRevealCopy(archetype: WrappedArchetypeCardTheme): {
	description: string;
	title: string;
} {
	switch (archetype.id) {
		case "roadrunner":
			return {
				description:
					"For the one who clears the pass, ships the fix, and is already halfway into the next task.",
				title: "Roadrunner energy.",
			};
		case "hit_and_runner":
			return {
				description:
					"For the operator who gets in, lands the move, and disappears before the mess settles.",
				title: "Hit. Run. Repeat.",
			};
		case "adhd_brain":
			return {
				description:
					"For the mind that keeps five tabs alive, three ideas moving, and the pace somehow intact.",
				title: "Every tab had a job.",
			};
		case "window_shopper":
			return {
				description:
					"For the selective one who keeps the spend light and still finds the exact tool worth using.",
				title: "Low spend, sharp eye.",
			};
		case "papas_credit_card":
			return {
				description:
					"For the teammate who never thinks small when the work calls for a heavier swing.",
				title: "Big-budget instincts.",
			};
		case "decimal":
			return {
				description:
					"For the rare edition energy: polished, expensive-looking, and very aware of the room.",
				title: "Decimal treatment.",
			};
		case "tourist":
			return {
				description:
					"For the wanderer who touched every corner of the work and kept moving between scenes.",
				title: "Every repo got a visit.",
			};
		case "npc":
			return {
				description:
					"For the steady hand who keeps the machine moving without asking for attention on every pass.",
				title: "Smooth by default.",
			};
		case "needs_to_touch_grass":
			return {
				description:
					"For the one who locked in so hard the sessions started stacking on top of each other.",
				title: "Fully, maybe too fully, locked in.",
			};
		case "maniac":
			return {
				description:
					"For the all-gas operator who pushes the pace until the card feels barely contained.",
				title: "No chill. All velocity.",
			};
		default:
			return {
				description:
					"For the kind of operator whose working style is strong enough to deserve its own card.",
				title: `${archetype.displayLabel}, framed.`,
			};
	}
}

export function WrappedTeamCardRevealFooter(props: {
	isDisabled?: boolean;
	isVisible: boolean;
	label: string;
	onAction: () => void;
}) {
	const { isDisabled = false, isVisible, label, onAction } = props;

	return (
		<div
			aria-hidden={isVisible ? undefined : true}
			className="mymind-wrapped-action-stack mymind-wrapped-action-stack--single-action mymind-wrapped-reveal-footer"
			data-visible={isVisible ? "true" : "false"}
		>
			<WrappedPrimaryAction
				kind="button"
				className="text-[1.0625rem] font-semibold"
				disabled={!isVisible || isDisabled}
				icon={<ChevronRight className="size-4" />}
				onClick={onAction}
			>
				{label}
			</WrappedPrimaryAction>
		</div>
	);
}
