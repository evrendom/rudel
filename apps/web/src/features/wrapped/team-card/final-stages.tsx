import { ChevronRight, Clipboard, Download, Share2 } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
// biome-ignore lint/style/noRestrictedImports: reveal-stage timers are an imperative storyboard bridge for this wrapped surface.
import { type CSSProperties, type RefObject, useEffect, useState } from "react";
import { Button } from "@/app/ui/button";
import type { TeamPageMemberRow } from "@/features/team/use-team-page-data";
import {
	WrappedPrimaryAction,
	WrappedSecondaryAction,
} from "@/features/wrapped/actions";
import type { WrappedOnboardingMetrics } from "@/features/wrapped/onboarding/types";
import {
	WrappedStageCopy,
	WrappedStageFrame,
} from "@/features/wrapped/stage-frame";
import {
	formatCompactWholeCurrency,
	formatCompactWholeNumber,
	formatMinutes,
	formatPercent,
} from "@/lib/format";
import type { WrappedArchetypeCardTheme } from "./archetypes";
import {
	WrappedTeamMemberCard,
	type WrappedTeamMemberCardHeaderMetric,
	type WrappedTeamMemberCardStatItem,
	type WrappedTeamMemberCardStatLayerOpacities,
	type WrappedTeamMemberCardTheme,
} from "./card";
import {
	WrappedTeamMemberCardBack,
	type WrappedTeamMemberCardBackHighlight,
} from "./card-back";
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
	onBack: () => void;
	onCopy: () => void | Promise<void>;
	onContinueToDashboard: () => void;
	onDownload: () => void | Promise<void>;
	onShare: () => void | Promise<void>;
	shareCardCreatedAtLabel: string;
	sharePostRef: RefObject<HTMLDivElement | null>;
	shareUrl?: string;
	shareUrlLabel: string;
}

interface WrappedTeamCardRevealStageProps
	extends WrappedTeamCardStageCardProps {
	activeArchetype: WrappedArchetypeCardTheme;
	onboardingMetrics: WrappedOnboardingMetrics;
	tiltController: WrappedCardTiltController;
}

type WrappedRevealSequencePhase = "sessions" | "tokens" | "archetype";

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
		headerLeftMetric,
		headerRightMetric,
		onBack,
		onCopy,
		onContinueToDashboard,
		onDownload,
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

	return (
		<WrappedStageFrame
			className="mymind-wrapped-final-stage mymind-wrapped-final-stage--share"
			copyClassName="mymind-wrapped-final-stage__copy"
			objectClassName="mymind-wrapped-final-stage__object"
			supportClassName="mymind-wrapped-final-stage__support"
			copy={
				<WrappedStageCopy
					description="This is the exact post that gets exported. Nothing extra gets added after you tap share."
					descriptionClassName="mymind-wrapped-final-stage__subline"
					eyebrow="Post preview"
					eyebrowClassName="mymind-wrapped-final-stage__eyebrow"
					title="Ready to share."
					titleClassName="mymind-wrapped-final-stage__headline"
				/>
			}
			object={
				<div ref={sharePostRef} className="mymind-wrapped-share-preview">
					<div className="mymind-wrapped-share-preview__shell team-lineup-surface-scope">
						<div className="mymind-wrapped-share-preview__top">
							<img
								src="/assets/wordmark-dark-BeVDO32X.svg"
								alt="rudel.ai"
								className="h-4 w-auto"
							/>
							<div className="flex items-center gap-2.5">
								<SharePostAnthropicLogo />
								<SharePostCodexLogo />
							</div>
						</div>

						<div className="mymind-wrapped-share-preview__body">
							<div className="team-lineup-card-tilt-stage mymind-wrapped-share-preview__card-stage">
								<div className="team-lineup-card-tilt-shell mymind-wrapped-share-preview__card-shell [--wrapped-card-render-scale:0.8]">
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
							</div>
						</div>

						<div className="mymind-wrapped-share-preview__meta">
							<span className="mymind-wrapped-share-preview__timestamp">
								{shareCardCreatedAtLabel}
							</span>
							<a
								href="https://rudel.ai/wrapped"
								className="mymind-wrapped-share-preview__link"
							>
								rudel.ai/wrapped
							</a>
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
						<div className="mymind-wrapped-share-actions__grid">
							<Button
								type="button"
								size="lg"
								variant="outline"
								className="mymind-wrapped-share-actions__secondary"
								onClick={onCopy}
							>
								<Clipboard className="size-4" />
								Copy image
							</Button>
							<Button
								type="button"
								size="lg"
								variant="outline"
								className="mymind-wrapped-share-actions__secondary"
								onClick={onDownload}
							>
								<Download className="size-4" />
								Download PNG
							</Button>
						</div>
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
	const revealBackHighlights = getWrappedRevealBackHighlights({
		archetype: activeArchetype,
		onboardingMetrics,
		row,
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
													archetypeLabel={activeArchetype.displayLabel}
													displayName={row.displayName}
													editionLabel={
														activeArchetype.taxonomyLabel ?? "Special Edition"
													}
													highlights={revealBackHighlights}
													hintLabel="Turn to reveal the card."
													narrative={revealCopy.description}
													shellClassName={shellClassName}
													shellStyle={shellStyle}
													theme={theme}
													variant="gradient-only"
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

function getWrappedRevealBackHighlights(input: {
	archetype: WrappedArchetypeCardTheme;
	onboardingMetrics: WrappedOnboardingMetrics;
	row: TeamPageMemberRow;
}): readonly WrappedTeamMemberCardBackHighlight[] {
	const { archetype, onboardingMetrics, row } = input;
	const activeDays = Math.max(
		0,
		onboardingMetrics.activeDays || row.activeDays,
	);
	const commitRate =
		onboardingMetrics.commitRate && onboardingMetrics.commitRate > 0
			? onboardingMetrics.commitRate
			: null;
	const longestSessionMin =
		onboardingMetrics.longestSessionMin &&
		onboardingMetrics.longestSessionMin > 0
			? onboardingMetrics.longestSessionMin
			: null;
	const totalRepos = Math.max(0, onboardingMetrics.repoPulse.totalRepos);
	const totalTokens = Math.max(0, onboardingMetrics.totalTokens);
	const estimatedSpend = Math.max(
		0,
		Math.round(Math.max(row.cost, onboardingMetrics.estimatedCostUsd)),
	);
	const sessionValue = formatCompactWholeNumber(Math.max(0, row.totalSessions));

	const highlights: WrappedTeamMemberCardBackHighlight[] = [
		{ label: "Sessions", value: sessionValue },
		{
			label: "Active days",
			value: formatCompactWholeNumber(activeDays),
		},
	];

	switch (archetype.id) {
		case "hit_and_runner":
		case "npc":
			highlights.push({
				label: commitRate !== null ? "Commit rate" : "Tokens",
				value:
					commitRate !== null
						? formatPercent(commitRate)
						: formatCompactWholeNumber(totalTokens),
			});
			break;
		case "roadrunner":
		case "adhd_brain":
		case "tourist":
			highlights.push({
				label: totalRepos > 1 ? "Repos" : "Tokens",
				value:
					totalRepos > 1
						? formatCompactWholeNumber(totalRepos)
						: formatCompactWholeNumber(totalTokens),
			});
			break;
		case "window_shopper":
		case "papas_credit_card":
		case "decimal":
			highlights.push({
				label: estimatedSpend > 0 ? "Spend" : "Tokens",
				value:
					estimatedSpend > 0
						? formatCompactWholeCurrency(estimatedSpend)
						: formatCompactWholeNumber(totalTokens),
			});
			break;
		case "needs_to_touch_grass":
			highlights.push({
				label: longestSessionMin !== null ? "Longest run" : "Tokens",
				value:
					longestSessionMin !== null
						? formatMinutes(longestSessionMin)
						: formatCompactWholeNumber(totalTokens),
			});
			break;
		case "maniac":
			highlights.push({
				label: "Tokens",
				value: formatCompactWholeNumber(totalTokens),
			});
			break;
		default:
			highlights.push({
				label: "Tokens",
				value: formatCompactWholeNumber(totalTokens),
			});
			break;
	}

	return highlights;
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
	onContinueToDashboard: () => void;
	onPreviewPost: () => void;
}) {
	const { onContinueToDashboard, onPreviewPost } = props;

	return (
		<div className="mymind-wrapped-action-stack">
			<WrappedPrimaryAction
				kind="button"
				className="text-[1.0625rem] font-semibold"
				icon={<ChevronRight className="size-4" />}
				onClick={onPreviewPost}
			>
				Preview post
			</WrappedPrimaryAction>
			<WrappedSecondaryAction onClick={onContinueToDashboard}>
				Continue to dashboard
			</WrappedSecondaryAction>
		</div>
	);
}

function SharePostAnthropicLogo() {
	return (
		<svg
			viewBox="0 0 1200 1200"
			aria-hidden="true"
			className="h-4 w-4 shrink-0"
		>
			<path
				fill="currentColor"
				d="M233.959793 800.214905L468.644287 668.536987L472.590637 657.100647L468.644287 650.738403L457.208069 650.738403L417.986633 648.322144L283.892639 644.69812L167.597321 639.865845L54.926208 633.825623L26.577238 627.785339L0.00033 592.751709L2.73832 575.27533L26.577238 559.248352L60.724873 562.228149L136.187973 567.382629L249.422867 575.194763L331.570496 580.026978L453.261841 592.671082L472.590637 592.671082L475.328857 584.859009L468.724915 580.026978L463.570557 575.194763L346.389313 495.785217L219.543671 411.865906L153.100723 363.543762L117.181267 339.060425L99.060455 316.107361L91.248367 266.01355L123.865784 230.093994L167.677887 233.073853L178.872513 236.053772L223.248367 270.201477L318.040283 343.570496L441.825592 434.738342L459.946411 449.798706L467.194672 444.64447L468.080597 441.020203L459.946411 427.409485L392.617493 305.718323L320.778564 181.932983L288.80542 130.630859L280.348999 99.865845C277.369171 87.221436 275.194641 76.590698 275.194641 63.624268L312.322174 13.20813L332.8591 6.604126L382.389313 13.20813L403.248352 31.328979L434.013519 101.71814L483.865753 212.537048L561.181274 363.221497L583.812134 407.919434L595.892639 449.315491L600.40271 461.959839L608.214783 461.959839L608.214783 454.711609L614.577271 369.825623L626.335632 265.61084L637.771851 131.516846L641.718201 93.745117L660.402832 48.483276L697.530334 24.000122L726.52356 37.852417L750.362549 72L747.060486 94.067139L732.886047 186.201416L705.100708 330.52356L686.979919 427.167847L697.530334 427.167847L709.61084 415.087341L758.496704 350.174561L840.644348 247.490051L876.885925 206.738342L919.167847 161.71814L946.308838 140.29541L997.61084 140.29541L1035.38269 196.429626L1018.469849 254.416199L965.637634 321.422852L921.825562 378.201538L859.006714 462.765259L819.785278 530.41626L823.409424 535.812073L832.75177 534.92627L974.657776 504.724915L1051.328979 490.872559L1142.818848 475.167786L1184.214844 494.496582L1188.724854 514.147644L1172.456421 554.335693L1074.604126 578.496765L959.838989 601.449829L788.939636 641.879272L786.845764 643.409485L789.261841 646.389343L866.255127 653.637634L899.194702 655.409424L979.812134 655.409424L1129.932861 666.604187L1169.154419 692.537109L1192.671265 724.268677L1188.724854 748.429688L1128.322144 779.194641L1046.818848 759.865845L856.590759 714.604126L791.355774 698.335754L782.335693 698.335754L782.335693 703.731567L836.69812 756.885986L936.322205 846.845581L1061.073975 962.81897L1067.436279 991.490112L1051.409424 1014.120911L1034.496704 1011.704712L924.885986 929.234924L882.604126 892.107544L786.845764 811.48999L780.483276 811.48999L780.483276 819.946289L802.550415 852.241699L919.087341 1027.409424L925.127625 1081.127686L916.671204 1098.604126L886.469849 1109.154419L853.288696 1103.114136L785.073914 1007.355835L714.684631 899.516785L657.906067 802.872498L650.979858 806.81897L617.476624 1167.704834L601.771851 1186.147705L565.530212 1200L535.328857 1177.046997L519.302124 1139.919556L535.328857 1066.550537L554.657776 970.792053L570.362488 894.68457L584.536926 800.134277L592.993347 768.724976L592.429626 766.630859L585.503479 767.516968L514.22821 865.369263L405.825531 1011.865906L320.053711 1103.677979L299.516815 1111.812256L263.919525 1093.369263L267.221497 1060.429688L287.114136 1031.114136L405.825531 880.107361L477.422913 786.52356L523.651062 732.483276L523.328918 724.671265L520.590698 724.671265L205.288605 929.395935L149.154434 936.644409L124.993355 914.01355L127.973183 876.885986L139.409409 864.80542L234.201385 799.570435L233.879227 799.8927Z"
			/>
		</svg>
	);
}

function SharePostCodexLogo() {
	return (
		<svg viewBox="0 0 320 320" aria-hidden="true" className="h-4 w-4 shrink-0">
			<path
				fill="currentColor"
				d="M297.06 130.97c7.26-21.79 4.76-45.66-6.85-65.48-17.46-30.4-52.56-46.04-86.84-38.68-15.25-17.18-37.16-26.95-60.13-26.81-35.04-.08-66.13 22.48-76.91 55.82-22.51 4.61-41.94 18.7-53.31 38.67-17.59 30.32-13.58 68.54 9.92 94.54-7.26 21.79-4.76 45.66 6.85 65.48 17.46 30.4 52.56 46.04 86.84 38.68 15.24 17.18 37.16 26.95 60.13 26.8 35.06.09 66.16-22.49 76.94-55.86 22.51-4.61 41.94-18.7 53.31-38.67 17.57-30.32 13.55-68.51-9.94-94.51zm-120.28 168.11c-14.03.02-27.62-4.89-38.39-13.88.49-.26 1.34-.73 1.89-1.07l63.72-36.8c3.26-1.85 5.26-5.32 5.24-9.07v-89.83l26.93 15.55c.29.14.48.42.52.74v74.39c-.04 33.08-26.83 59.9-59.91 59.97zm-128.84-55.03c-7.03-12.14-9.56-26.37-7.15-40.18.47.28 1.3.79 1.89 1.13l63.72 36.8c3.23 1.89 7.23 1.89 10.47 0l77.79-44.92v31.1c.02.32-.13.63-.38.83l-64.41 37.19c-28.69 16.52-65.33 6.7-81.92-21.95zm-16.77-139.09c7-12.16 18.05-21.46 31.21-26.29 0 .55-.03 1.52-.03 2.2v73.61c-.02 3.74 1.98 7.21 5.23 9.06l77.79 44.91-26.93 15.55c-.27.18-.61.21-.91.08l-64.42-37.22c-28.63-16.58-38.45-53.21-21.95-81.89zm221.26 51.49-77.79-44.92 26.93-15.54c.27-.18.61-.21.91-.08l64.42 37.19c28.68 16.57 38.51 53.26 21.94 81.94-7.01 12.14-18.05 21.44-31.2 26.28v-75.81c.03-3.74-1.96-7.2-5.2-9.06zm26.8-40.34c-.47-.29-1.3-.79-1.89-1.13l-63.72-36.8c-3.23-1.89-7.23-1.89-10.47 0l-77.79 44.92v-31.1c-.02-.32.13-.63.38-.83l64.41-37.16c28.69-16.55 65.37-6.7 81.91 22 6.99 12.12 9.52 26.31 7.15 40.1zm-168.51 55.43-26.94-15.55c-.29-.14-.48-.42-.52-.74v-74.39c.02-33.12 26.89-59.96 60.01-59.94 14.01 0 27.57 4.92 38.34 13.88-.49.26-1.33.73-1.89 1.07l-63.72 36.8c-3.26 1.85-5.26 5.31-5.24 9.06l-.04 89.79zm14.63-31.54 34.65-20.01 34.65 20v40.01l-34.65 20-34.65-20z"
			/>
		</svg>
	);
}
