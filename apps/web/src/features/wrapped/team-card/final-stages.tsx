import { ChevronRight, Clipboard, Download, Share2 } from "lucide-react";
import type { WrappedShareAppearance } from "@rudel/api-routes";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
// biome-ignore lint/style/noRestrictedImports: reveal-stage timers are an imperative storyboard bridge for this wrapped surface.
import { type CSSProperties, type RefObject, useEffect, useState } from "react";
import { Button } from "@/app/ui/button";
import type { TeamPageMemberRow } from "@/features/team/use-team-page-data";
import {
	WrappedPrimaryAction,
} from "@/features/wrapped/actions";
import type { WrappedOnboardingMetrics } from "@/features/wrapped/onboarding/types";
import { WrappedStageFrame } from "@/features/wrapped/stage-frame";
import {
	formatCompactWholeCurrency,
	formatCompactWholeNumber,
	formatMinutes,
	formatPercent,
} from "@/lib/format";
import type { WrappedArchetypeCardTheme } from "./archetypes";
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
	onboardingMetrics: WrappedOnboardingMetrics;
	shareCardCreatedAtLabel: string;
	tiltController: WrappedCardTiltController;
}

type WrappedRevealSequencePhase = "sessions" | "tokens" | "archetype";

const WRAPPED_SHARE_VARIANTS: ReadonlyArray<{
	appearance: WrappedShareAppearance;
	description: string;
	number: "1" | "2" | "3" | "4";
}> = [
	{
		appearance: {
			layoutMode: "front",
			showArchetypeLabel: true,
		},
		description: "Front card with archetype text",
		number: "1",
	},
	{
		appearance: {
			layoutMode: "front",
			showArchetypeLabel: false,
		},
		description: "Front card without archetype text",
		number: "2",
	},
	{
		appearance: {
			layoutMode: "front_back",
			showArchetypeLabel: true,
		},
		description: "Front and back card with archetype text",
		number: "3",
	},
	{
		appearance: {
			layoutMode: "front_back",
			showArchetypeLabel: false,
		},
		description: "Front and back card without archetype text",
		number: "4",
	},
];

const REVEAL_STAGE_MOTION = {
	duration: {
		card: 1.02,
		flip: 0.68,
		text: 0.26,
	},
	easing: {
		enter: [0.22, 1, 0.36, 1] as const,
		drop: [0.16, 1, 0.22, 1] as const,
		flip: [0.32, 0.72, 0, 1] as const,
	},
};

const REVEAL_STAGE_TEXT_TRANSITION = {
	duration: REVEAL_STAGE_MOTION.duration.text,
	ease: REVEAL_STAGE_MOTION.easing.enter,
};

const REVEAL_STAGE_SEQUENCE = [
	{ holdMs: 1_700, phase: "tokens" },
	{ holdMs: 1_900, phase: "archetype" },
] as const satisfies ReadonlyArray<{
	holdMs: number;
	phase: Exclude<WrappedRevealSequencePhase, "sessions">;
}>;

const REVEAL_STAGE_CARD_DROP_DELAY_MS = 1_250;
const REVEAL_STAGE_CARD_FLIP_DURATION_MS = Math.round(
	REVEAL_STAGE_MOTION.duration.flip * 1_000,
);

export function WrappedTeamCardShareStage(
	props: WrappedTeamCardShareStageProps,
) {
	const {
		appearance,
		backMetrics,
		headerLeftMetric,
		headerRightMetric,
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
	const resolvedAppearance = resolveWrappedShareAppearance(appearance);

	return (
		<WrappedStageFrame
			className="mymind-wrapped-final-stage mymind-wrapped-final-stage--share"
			copyClassName="mymind-wrapped-final-stage__copy"
			objectClassName="mymind-wrapped-final-stage__object"
			supportClassName="mymind-wrapped-final-stage__support"
			copy={
				<div className="mymind-wrapped-final-stage__share-copy-shell">
					<h1 className="mymind-wrapped-stage-copy__headline mymind-wrapped-final-stage__headline">
						Show this to world
					</h1>
				</div>
			}
			object={
				<div className="mymind-wrapped-final-stage__share-object-shell">
					<div className="mymind-wrapped-share-surface">
						<div className="mymind-wrapped-share-surface__rail">
							<div
								role="group"
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
											key={variant.number}
											type="button"
											size="icon-sm"
											variant="outline"
											aria-label={`Variant ${variant.number}: ${variant.description}`}
											aria-pressed={isActive}
											title={`Variant ${variant.number}: ${variant.description}`}
											className="mymind-wrapped-share-variant-button"
											data-active={isActive ? "true" : "false"}
											onClick={() => onAppearanceChange(variant.appearance)}
										>
											{variant.number}
										</Button>
									);
								})}
							</div>

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
									aria-label="Download PNG"
									className="mymind-wrapped-share-toolbar__button"
									onClick={onDownload}
								>
									<Download className="size-4" />
								</Button>
							</div>
						</div>

						<div className="mymind-wrapped-share-surface__preview">
							<WrappedTeamCardSharePreview
								appearance={resolvedAppearance}
								backMetrics={backMetrics}
								headerLeftMetric={headerLeftMetric}
								headerRightMetric={headerRightMetric}
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
					</div>
				</div>
			}
			support={
				<>
					<nav className="mymind-wrapped-share-actions">
						<Button
							type="button"
							size="lg"
							className="mymind-wrapped-share-actions__primary"
							onClick={onShare}
						>
							<Share2 className="size-4" />
							Share post
						</Button>
					</nav>

					<div className="mymind-wrapped-share-actions__meta-grid">
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
					</div>
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

	return (
		currentValue.layoutMode === targetValue.layoutMode &&
		currentValue.showArchetypeLabel === targetValue.showArchetypeLabel
	);
}

export function WrappedTeamCardRevealStage(
	props: WrappedTeamCardRevealStageProps,
) {
	const {
		activeArchetype,
		headerLeftMetric,
		headerRightMetric,
		onboardingMetrics,
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
	const [sequencePhase, setSequencePhase] =
		useState<WrappedRevealSequencePhase>(() =>
			reduceMotion ? "archetype" : "sessions",
		);
	const [isCardDropped, setIsCardDropped] = useState(() => reduceMotion);
	const [isCardFrontVisible, setIsCardFrontVisible] = useState(false);
	const [isCardFlipAnimating, setIsCardFlipAnimating] = useState(false);
	const revealCopy = getWrappedRevealCopy(activeArchetype);
	const revealStoryCopy = getWrappedRevealStoryCopy({
		archetype: activeArchetype,
		onboardingMetrics,
		row,
	});
	const revealBackMetrics = getWrappedRevealBackMetrics({
		onboardingMetrics,
		row,
		shareCardCreatedAtLabel,
	});
	const revealTextLine =
		sequencePhase === "sessions"
			? revealStoryCopy.claim
			: sequencePhase === "tokens"
				? revealStoryCopy.proof
				: revealCopy.title;

	// biome-ignore lint/correctness/useExhaustiveDependencies: the reveal sequence should restart when the active archetype changes.
	useEffect(() => {
		if (reduceMotion) {
			setSequencePhase("archetype");
			setIsCardDropped(true);
			setIsCardFrontVisible(false);
			setIsCardFlipAnimating(false);
			return;
		}

		setSequencePhase("sessions");
		setIsCardDropped(false);
		setIsCardFrontVisible(false);
		setIsCardFlipAnimating(false);
		let elapsedMs = 0;
		const timeoutIds = REVEAL_STAGE_SEQUENCE.map((step) => {
			elapsedMs += step.holdMs;
			return window.setTimeout(() => {
				setSequencePhase(step.phase);
			}, elapsedMs);
		});
		timeoutIds.push(
			window.setTimeout(() => {
				setIsCardDropped(true);
			}, elapsedMs + REVEAL_STAGE_CARD_DROP_DELAY_MS),
		);

		return () => {
			for (const timeoutId of timeoutIds) {
				window.clearTimeout(timeoutId);
			}
		};
	}, [activeArchetype.id, reduceMotion]);

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

	function handleCardFlipToggle() {
		if (!isCardDropped || isCardFlipAnimating) {
			return;
		}

		tiltController.handlePointerLeave();

		if (reduceMotion) {
			setIsCardFrontVisible((currentValue) => !currentValue);
			return;
		}

		setIsCardFlipAnimating(true);
		setIsCardFrontVisible((currentValue) => !currentValue);
	}

	return (
		<WrappedStageFrame
			className="mymind-wrapped-final-stage mymind-wrapped-final-stage--reveal"
			objectClassName="mymind-wrapped-final-stage__object mymind-wrapped-final-stage__object--canvas"
			supportClassName="mymind-wrapped-final-stage__support"
			object={
				<div className="mymind-wrapped-final-stage__canvas">
					<div className="mymind-wrapped-final-stage__text-layer">
						<AnimatePresence initial={false} mode="wait">
							{!isCardDropped ? (
								<motion.p
									key={`${activeArchetype.id}:${sequencePhase}`}
									animate={{
										filter: "blur(0px)",
										opacity: 1,
										scale: 1,
										y: 0,
									}}
									className="mymind-wrapped-final-stage__canvas-copy"
									exit={{
										filter: "blur(8px)",
										opacity: 0,
										scale: 1.015,
										y: -18,
									}}
									initial={{
										filter: "blur(12px)",
										opacity: 0,
										scale: 0.986,
										y: 18,
									}}
									transition={REVEAL_STAGE_TEXT_TRANSITION}
								>
									{revealTextLine}
								</motion.p>
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
						<div className="team-lineup-card-tilt-stage w-full max-w-[16rem] min-[360px]:max-w-[16.75rem] sm:max-w-none">
							<div
								ref={tiltController.cardTiltRef}
								className="team-lineup-card-tilt-shell mymind-wrapped-final-stage__tilt-shell [--wrapped-card-render-scale:1] min-[360px]:[--wrapped-card-render-scale:1.08] sm:[--wrapped-card-render-scale:1.42] lg:[--wrapped-card-render-scale:1.56]"
								data-flip-active={isCardFlipAnimating ? "true" : "false"}
								onPointerMove={(event) => {
									if (!isCardFlipAnimating) {
										tiltController.handlePointerMove(event);
									}
								}}
								onPointerLeave={tiltController.handlePointerLeave}
								onPointerCancel={tiltController.handlePointerLeave}
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
											? "Show back of card"
											: "Reveal front of card"
									}
									aria-pressed={isCardFrontVisible}
									className="mymind-wrapped-final-stage__flip-control"
									data-card-face={isCardFrontVisible ? "front" : "back"}
									disabled={!isCardDropped}
									onClick={handleCardFlipToggle}
									type="button"
								>
									<div className="mymind-wrapped-final-stage__flip-shell">
										<div className="mymind-wrapped-final-stage__flip-rotator">
											<div
												aria-hidden={!isCardFrontVisible}
												className="mymind-wrapped-final-stage__flip-face mymind-wrapped-final-stage__flip-face--front"
											>
												<div className="grid justify-center">
													<WrappedTeamMemberCard
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
											</div>

											<div
												aria-hidden={isCardFrontVisible}
												className="mymind-wrapped-final-stage__flip-face mymind-wrapped-final-stage__flip-face--back"
											>
												<WrappedTeamMemberCardBack
													metrics={revealBackMetrics}
													shellClassName={shellClassName}
													shellStyle={shellStyle}
													theme={theme}
												/>
											</div>
										</div>
									</div>
								</button>
							</div>
						</div>
					</motion.div>
				</div>
			}
		/>
	);
}

function getWrappedRevealStoryCopy(input: {
	archetype: WrappedArchetypeCardTheme;
	onboardingMetrics: WrappedOnboardingMetrics;
	row: TeamPageMemberRow;
}): {
	claim: string;
	proof: string;
} {
	const { archetype, onboardingMetrics, row } = input;
	const firstName = getWrappedRevealFirstName(row.displayName);
	const activeDays = Math.max(
		0,
		onboardingMetrics.activeDays || row.activeDays,
	);
	const avgSessionMin =
		onboardingMetrics.avgSessionMin && onboardingMetrics.avgSessionMin > 0
			? onboardingMetrics.avgSessionMin
			: null;
	const commitRate =
		onboardingMetrics.commitRate && onboardingMetrics.commitRate > 0
			? onboardingMetrics.commitRate
			: null;
	const longestSessionMin =
		onboardingMetrics.longestSessionMin &&
		onboardingMetrics.longestSessionMin > 0
			? onboardingMetrics.longestSessionMin
			: null;
	const topProjectName = onboardingMetrics.topProjectName?.trim() || null;
	const topProjectSessions = Math.max(0, onboardingMetrics.topProjectSessions);
	const totalRepos = Math.max(0, onboardingMetrics.repoPulse.totalRepos);
	const totalSessions = Math.max(0, row.totalSessions);
	const totalTokens = Math.max(0, onboardingMetrics.totalTokens);
	const estimatedSpend = Math.max(
		0,
		Math.round(Math.max(row.cost, onboardingMetrics.estimatedCostUsd)),
	);
	const sessionCountLabel = formatCompactWholeNumber(totalSessions);
	const tokenCountLabel = formatCompactWholeNumber(totalTokens);
	const activeDaysLabel = formatCompactWholeNumber(activeDays);
	const repoCountLabel = formatCompactWholeNumber(totalRepos);
	const spendLabel = formatCompactWholeCurrency(estimatedSpend);
	const commitRateLabel =
		commitRate !== null ? formatPercent(commitRate) : null;
	const topProjectSessionLabel = formatCompactWholeNumber(topProjectSessions);

	switch (archetype.id) {
		case "roadrunner":
			return {
				claim: formatWrappedRevealClaim(
					firstName,
					"you were never in one place for long.",
				),
				proof:
					totalRepos > 1
						? `${tokenCountLabel} tokens across ${repoCountLabel} repos made the bursts obvious.`
						: `${sessionCountLabel} sessions and ${tokenCountLabel} tokens made the pace obvious.`,
			};
		case "hit_and_runner":
			return {
				claim: formatWrappedRevealClaim(
					firstName,
					"you came in to land the move, not linger.",
				),
				proof:
					commitRateLabel && avgSessionMin !== null
						? `${commitRateLabel} ended in a commit. Average session: ${formatMinutes(avgSessionMin)}.`
						: `${sessionCountLabel} sessions, sharp and direct.`,
			};
		case "adhd_brain":
			return {
				claim: formatWrappedRevealClaim(
					firstName,
					"one thread was never going to be enough.",
				),
				proof:
					totalRepos > 1
						? `${tokenCountLabel} tokens across ${repoCountLabel} repos kept the work split wide.`
						: `${tokenCountLabel} tokens, and still no single lane held you.`,
			};
		case "window_shopper":
			return {
				claim: formatWrappedRevealClaim(
					firstName,
					"you stayed picky and still found what was worth using.",
				),
				proof:
					estimatedSpend > 0
						? `${spendLabel} total spend still turned into ${sessionCountLabel} sessions.`
						: `${sessionCountLabel} sessions, with a very light footprint.`,
			};
		case "papas_credit_card":
			return {
				claim: formatWrappedRevealClaim(
					firstName,
					"when the work got bigger, so did your appetite for it.",
				),
				proof:
					estimatedSpend > 0
						? `${spendLabel} across ${sessionCountLabel} sessions made that pretty clear.`
						: `${tokenCountLabel} tokens says you were not thinking small.`,
			};
		case "decimal":
			return {
				claim: formatWrappedRevealClaim(
					firstName,
					"you made heavy usage look considered.",
				),
				proof: `${tokenCountLabel} tokens. ${sessionCountLabel} sessions. Still composed.`,
			};
		case "tourist":
			return {
				claim: formatWrappedRevealClaim(
					firstName,
					"you passed through more than you ever settled into.",
				),
				proof:
					totalRepos > 1
						? `${sessionCountLabel} sessions across ${repoCountLabel} repos, without one real home base.`
						: `${sessionCountLabel} sessions, always a little in motion.`,
			};
		case "npc":
			return {
				claim: formatWrappedRevealClaim(
					firstName,
					"you became the person the work could count on.",
				),
				proof:
					commitRateLabel !== null
						? `${sessionCountLabel} sessions over ${activeDaysLabel} active days. ${commitRateLabel} ended in a commit.`
						: `${sessionCountLabel} sessions over ${activeDaysLabel} active days kept the pattern steady.`,
			};
		case "needs_to_touch_grass":
			return {
				claim: formatWrappedRevealClaim(
					firstName,
					"you kept coming back long after most people would have closed the tab.",
				),
				proof:
					topProjectName && topProjectSessions > 0
						? `${topProjectName} alone pulled ${topProjectSessionLabel} sessions out of you.`
						: longestSessionMin !== null
							? `Your longest session hit ${formatMinutes(longestSessionMin)}.`
							: `${activeDaysLabel} active days and ${tokenCountLabel} tokens kept the thread alive.`,
			};
		case "maniac":
			return {
				claim: formatWrappedRevealClaim(
					firstName,
					"you did not ease off once the pace picked up.",
				),
				proof:
					topProjectName && topProjectSessions > 0
						? `${tokenCountLabel} tokens over ${activeDaysLabel} active days, with ${topProjectName} taking ${topProjectSessionLabel} sessions.`
						: `${tokenCountLabel} tokens over ${activeDaysLabel} active days. No letup.`,
			};
		default:
			return {
				claim: formatWrappedRevealClaim(
					firstName,
					"your pattern was specific enough to feel unmistakably yours.",
				),
				proof: `${sessionCountLabel} sessions and ${tokenCountLabel} tokens made that easy to see.`,
			};
	}
}

function getWrappedRevealBackMetrics(input: {
	onboardingMetrics: WrappedOnboardingMetrics;
	row: TeamPageMemberRow;
	shareCardCreatedAtLabel: string;
}) {
	return buildWrappedTeamCardBackMetrics(input);
}

function getWrappedRevealFirstName(displayName: string) {
	const trimmedName = displayName.trim();

	if (
		trimmedName.length === 0 ||
		trimmedName.toLowerCase() === "unknown teammate"
	) {
		return null;
	}

	const firstToken = trimmedName.split(/\s+/)[0]?.replace(/[,:;.!?]+$/g, "");

	if (!firstToken || firstToken.includes("@")) {
		return null;
	}

	return firstToken;
}

function formatWrappedRevealClaim(firstName: string | null, claim: string) {
	if (firstName) {
		return `${firstName}, ${claim}`;
	}

	return `${claim.charAt(0).toUpperCase()}${claim.slice(1)}`;
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
	onPreviewPost: () => void;
}) {
	const { onPreviewPost } = props;

	return (
		<div className="mymind-wrapped-action-stack mymind-wrapped-action-stack--single-action">
			<WrappedPrimaryAction
				kind="button"
				className="text-[1.0625rem] font-semibold"
				icon={<ChevronRight className="size-4" />}
				onClick={onPreviewPost}
			>
				Preview post
			</WrappedPrimaryAction>
		</div>
	);
}
