import { useDialKit } from "dialkit";
import { Frown } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { CSSProperties, UIEvent } from "react";
// biome-ignore lint/style/noRestrictedImports: sequence timers are an imperative animation bridge for the preview storyboard.
import { startTransition, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import {
	clampSkillsCardIndex,
	getSkillsCardStyle,
	getSkillsDealCardStyle,
	getSkillsScrollableCardStyle,
	resolveSkillsPreviewInput,
	resolveSkillsStageModel,
	SKILLS_STACK,
} from "../models";
import type { WrappedOnboardingMetrics } from "../types";
import {
	WrappedOnboardingStageCopy,
	WrappedOnboardingStageFrame,
} from "./frame";

interface SkillsStageProps {
	onboardingMetrics: WrappedOnboardingMetrics;
	previewState: string;
}

interface SkillsTrackStyle extends CSSProperties {
	"--skills-stack-bottom-fade-height": string;
	"--skills-stack-fade-inset": string;
	"--skills-stack-focus-top": string;
	"--skills-stack-track-height": string;
	"--skills-stack-top-fade-height": string;
}

interface SkillsCardStyle extends CSSProperties {
	"--skills-card-transform-duration"?: string;
	"--skills-card-visibility-duration"?: string;
}

const ANTHROPIC_SKILLS_DOCS_URL =
	"https://docs.anthropic.com/en/docs/claude-code/skills";

/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD
 *
 * Read top-to-bottom. Each `at` value is ms after mount.
 *
 *    0ms   a single intro line sits alone in the middle of the stage
 * 1400ms   the intro line clears out of the way
 * 1640ms   the last visible card lands at the front
 * 1850ms   the next card lands in front and pushes the first one back
 * 2060ms   the lead card lands in front and completes the stack
 * 2340ms   the deck settles and holds on its own
 * 2980ms   the final title returns without moving the cards
 * ───────────────────────────────────────────────────────── */
type SkillsEntranceStage =
	| "intro"
	| "intro-exit"
	| "deal"
	| "deck-hold"
	| "deck-copy";

const SKILLS_STAGE_COPY_TRANSITION = {
	duration: 0.24,
	ease: [0.22, 1, 0.36, 1] as const,
};

const SKILLS_STAGE_INTRO_TOKEN_TRANSITION = {
	duration: 0.22,
	ease: [0.22, 1, 0.36, 1] as const,
};

const SKILLS_STAGE_OBJECT_TRANSITION = {
	duration: 0.38,
	ease: [0.22, 1, 0.36, 1] as const,
};

const SKILLS_STAGE_INTRO_LINE = "The same skills kept showing up.";
const SKILLS_STAGE_INTRO_TOKENS =
	SKILLS_STAGE_INTRO_LINE.split(/\s+/).filter(Boolean);
const SKILLS_STAGE_DEAL_FINAL_HOLD_MS = 280;
const SKILLS_STAGE_INTRO_TOKEN_STAGGER_S = 0.055;

function getSkillsDebugLayoutClassName() {
	if (typeof window === "undefined") {
		return null;
	}

	const debugValue = new URLSearchParams(window.location.search).get(
		"debugSkillsLayout",
	);

	if (debugValue === "purple" || debugValue === "bottom-gradient") {
		return "mymind-wrapped-skills-stage--debug-purple-gradient";
	}

	if (debugValue === "1" || debugValue === "true") {
		return "mymind-wrapped-skills-stage--debug-layout";
	}

	return null;
}

export function WrappedOnboardingSkillsStage(props: SkillsStageProps) {
	const { onboardingMetrics, previewState } = props;
	const shouldReduceMotion = useReducedMotion();
	const reduceMotion = shouldReduceMotion ?? false;
	const debugLayoutClassName = getSkillsDebugLayoutClassName();
	const [replayNonce, setReplayNonce] = useState(0);
	const model = resolveSkillsStageModel(
		resolveSkillsPreviewInput(
			{
				skillsAdoptionRate: onboardingMetrics.skillsAdoptionRate,
				topSkills: onboardingMetrics.topSkills,
			},
			previewState,
		),
	);
	const [activeCardIndex, setActiveCardIndex] = useState(0);
	const [dealCardCount, setDealCardCount] = useState(() =>
		reduceMotion ? SKILLS_STACK.visibleCards : 0,
	);
	const [skillsEntranceStage, setSkillsEntranceStage] =
		useState<SkillsEntranceStage>(() => (reduceMotion ? "deck-copy" : "intro"));
	const dialValues = useDialKit(
		"Wrapped Skills Stage",
		{
			animation: {
				_collapsed: true,
				deckBreatherMs: [640, 160, 2_000, 10],
				introHoldMs: [1_400, 200, 2_400, 10],
				dealStepMs: [210, 120, 480, 10],
				deckSettleMs: [260, 120, 1000, 10],
			},
			fade: {
				_collapsed: true,
				bottomHeightRem: [3.8, 1.5, 10, 0.1],
				insetRem: [-2.4, -4, 0, 0.1],
				topHeightRem: [3.2, 1.5, 9, 0.1],
			},
			replay: { type: "action", label: "Replay sequence" },
		},
		{
			onAction: (path) => {
				if (path !== "replay") {
					return;
				}

				startTransition(() => {
					setReplayNonce((currentValue) => currentValue + 1);
				});
			},
		},
	);
	const isEmptySkillsBoard = !model.hasRankedSkills;
	const isDeckVisible =
		skillsEntranceStage === "deck-hold" || skillsEntranceStage === "deck-copy";
	const isStackInteractive = skillsEntranceStage === "deck-copy";
	const isIntroCopyVisible =
		skillsEntranceStage === "intro" || skillsEntranceStage === "intro-exit";
	const isComponentOnly =
		skillsEntranceStage === "deal" || skillsEntranceStage === "deck-hold";
	const isOverlayCopyVisible = skillsEntranceStage === "deck-copy";
	const visibleDealCardCount = Math.min(
		SKILLS_STACK.visibleCards,
		model.cards.length,
	);
	const frontDealCardIndex =
		dealCardCount > 0 ? visibleDealCardCount - dealCardCount : null;

	function handleSkillsStackScroll(event: UIEvent<HTMLElement>) {
		if (!model.isScrollable || !isStackInteractive) {
			return;
		}

		const stackElement = event.currentTarget;
		const stackFontSize = Number.parseFloat(
			window.getComputedStyle(stackElement).fontSize,
		);
		if (!Number.isFinite(stackFontSize) || stackFontSize <= 0) {
			return;
		}

		const nextActiveCardIndex = clampSkillsCardIndex(
			Math.round(
				stackElement.scrollTop / (SKILLS_STACK.stepRem * stackFontSize),
			),
			model.cards.length,
		);

		setActiveCardIndex((currentIndex) =>
			currentIndex === nextActiveCardIndex ? currentIndex : nextActiveCardIndex,
		);
	}

	useEffect(() => {
		void replayNonce;

		if (reduceMotion || isEmptySkillsBoard) {
			setDealCardCount(visibleDealCardCount);
			setSkillsEntranceStage("deck-copy");
			return;
		}

		setActiveCardIndex(0);
		setDealCardCount(0);
		setSkillsEntranceStage("intro");
		const timers = [
			window.setTimeout(() => {
				setSkillsEntranceStage("intro-exit");
			}, dialValues.animation.introHoldMs),
		];

		return () => {
			for (const timer of timers) {
				window.clearTimeout(timer);
			}
		};
	}, [
		dialValues.animation.introHoldMs,
		isEmptySkillsBoard,
		reduceMotion,
		replayNonce,
		visibleDealCardCount,
	]);

	useEffect(() => {
		if (skillsEntranceStage !== "deal" || reduceMotion || isEmptySkillsBoard) {
			return;
		}

		const timers = [] as number[];

		for (
			let revealCount = 2;
			revealCount <= visibleDealCardCount;
			revealCount += 1
		) {
			timers.push(
				window.setTimeout(
					() => {
						setSkillsEntranceStage("deal");
						setDealCardCount(revealCount);
					},
					(revealCount - 1) * dialValues.animation.dealStepMs,
				),
			);
		}

		timers.push(
			window.setTimeout(
				() => {
					setSkillsEntranceStage("deck-hold");
					setDealCardCount(visibleDealCardCount);
				},
				Math.max(visibleDealCardCount - 1, 0) *
					dialValues.animation.dealStepMs +
					Math.max(
						dialValues.animation.deckSettleMs,
						SKILLS_STAGE_DEAL_FINAL_HOLD_MS,
					),
			),
		);

		return () => {
			for (const timer of timers) {
				window.clearTimeout(timer);
			}
		};
	}, [
		dialValues.animation.dealStepMs,
		dialValues.animation.deckSettleMs,
		isEmptySkillsBoard,
		reduceMotion,
		skillsEntranceStage,
		visibleDealCardCount,
	]);

	useEffect(() => {
		if (
			skillsEntranceStage !== "deck-hold" ||
			reduceMotion ||
			isEmptySkillsBoard
		) {
			return;
		}

		const timer = window.setTimeout(() => {
			setSkillsEntranceStage("deck-copy");
		}, dialValues.animation.deckBreatherMs);

		return () => {
			window.clearTimeout(timer);
		};
	}, [
		dialValues.animation.deckBreatherMs,
		isEmptySkillsBoard,
		reduceMotion,
		skillsEntranceStage,
	]);

	const stackStyle: SkillsTrackStyle = {
		"--skills-stack-bottom-fade-height": `${dialValues.fade.bottomHeightRem}rem`,
		"--skills-stack-fade-inset": `${dialValues.fade.insetRem}rem`,
		"--skills-stack-focus-top": `${SKILLS_STACK.focusTopRem}rem`,
		"--skills-stack-track-height": `${model.trackHeightRem}rem`,
		"--skills-stack-top-fade-height": `${dialValues.fade.topHeightRem}rem`,
	};

	return (
		<WrappedOnboardingStageFrame
			className={cn(
				"mymind-wrapped-skills-stage",
				isIntroCopyVisible && "mymind-wrapped-skills-stage--intro-copy",
				isComponentOnly && "mymind-wrapped-skills-stage--component-only",
				isOverlayCopyVisible && "mymind-wrapped-skills-stage--overlay-copy",
				debugLayoutClassName,
			)}
			copy={
				isEmptySkillsBoard ? (
					<WrappedOnboardingStageCopy
						title={model.headline}
						description={model.subline}
					/>
				) : isIntroCopyVisible ? (
					<AnimatePresence
						initial={false}
						mode="wait"
						onExitComplete={() => {
							if (skillsEntranceStage !== "intro-exit") {
								return;
							}

							setSkillsEntranceStage("deal");
							setDealCardCount(1);
						}}
					>
						{skillsEntranceStage === "intro" ? (
							<motion.div
								key="skills-intro-copy"
								animate={{ filter: "blur(0px)", opacity: 1, scale: 1, y: 0 }}
								className="mymind-wrapped-skills-stage__debug-copy-shell"
								data-debug-label="intro copy motion"
								exit={{ filter: "blur(6px)", opacity: 0, scale: 0.992, y: -8 }}
								initial={false}
								transition={SKILLS_STAGE_COPY_TRANSITION}
							>
								<WrappedOnboardingStageCopy
									title={<WrappedSkillsIntroLine reduceMotion={reduceMotion} />}
									titleClassName="mymind-wrapped-stage-copy__headline--intro"
								/>
							</motion.div>
						) : null}
					</AnimatePresence>
				) : isOverlayCopyVisible ? (
					<motion.div
						key="skills-final-copy"
						animate={{
							filter: "blur(0px)",
							opacity: 1,
							scale: 1,
							y: 0,
						}}
						className="mymind-wrapped-skills-stage__debug-copy-shell"
						data-debug-label="overlay copy motion"
						initial={{
							filter: "blur(10px)",
							opacity: 0,
							scale: 0.985,
							y: 16,
						}}
						transition={SKILLS_STAGE_COPY_TRANSITION}
					>
						<WrappedOnboardingStageCopy
							title={model.headline}
							description={model.subline}
						/>
					</motion.div>
				) : undefined
			}
			object={
				isEmptySkillsBoard ? (
					<div
						className="mymind-wrapped-skills-stage__empty-state"
						data-debug-label="empty state"
					>
						<div
							aria-hidden="true"
							className="mymind-wrapped-skills-stage__empty-icon-shell"
							data-debug-label="empty icon shell"
						>
							<span className="mymind-wrapped-skills-stage__empty-code">
								404
							</span>
							<span className="mymind-wrapped-skills-stage__empty-icon-badge">
								<Frown
									className="mymind-wrapped-skills-stage__empty-icon"
									strokeWidth={1.9}
								/>
							</span>
						</div>
						{model.emptyState === "no-signal" ? (
							<p className="mymind-wrapped-skills-stage__empty-caption">
								you should try skills out,{" "}
								<a
									className="mymind-wrapped-skills-stage__footnote-link"
									href={ANTHROPIC_SKILLS_DOCS_URL}
									rel="noreferrer"
									target="_blank"
								>
									see here
								</a>
							</p>
						) : null}
					</div>
				) : isIntroCopyVisible ? undefined : (
					<motion.div
						animate={{ filter: "blur(0px)", opacity: 1, y: 0 }}
						className="mymind-wrapped-skills-stage__object-shell"
						data-debug-label="object shell"
						initial={{ filter: "blur(10px)", opacity: 0, y: 14 }}
						transition={SKILLS_STAGE_OBJECT_TRANSITION}
					>
						<div
							className="mymind-wrapped-skills-stage__stack-frame"
							data-debug-label="stack frame"
							data-scrollable={model.isScrollable ? "true" : "false"}
							data-stack-stage={skillsEntranceStage}
						>
							<section
								aria-label="Skill rankings"
								className="mymind-wrapped-skills-stage__stack"
								data-debug-label="scroll stack"
								data-scrollable={model.isScrollable ? "true" : "false"}
								data-stack-stage={skillsEntranceStage}
								onScroll={handleSkillsStackScroll}
								tabIndex={
									model.isScrollable && isStackInteractive ? 0 : undefined
								}
							>
								<div
									className="mymind-wrapped-skills-stage__stack-track"
									data-debug-label="stack track"
									style={stackStyle}
								>
									{model.cards.map((card, cardIndex) => {
										const baseCardStyle =
											skillsEntranceStage === "deal"
												? getSkillsDealCardStyle(cardIndex, dealCardCount)
												: model.isScrollable && isStackInteractive
													? getSkillsScrollableCardStyle(
															cardIndex,
															activeCardIndex,
														)
													: getSkillsCardStyle(cardIndex, activeCardIndex);
										const cardStyle: SkillsCardStyle = {
											...baseCardStyle,
											pointerEvents: isStackInteractive
												? baseCardStyle.pointerEvents
												: "none",
											"--skills-card-transform-duration": `${dialValues.animation.deckSettleMs}ms`,
											"--skills-card-visibility-duration": `${Math.max(
												dialValues.animation.deckSettleMs - 140,
												220,
											)}ms`,
										};

										return (
											<article
												key={card.id}
												className={cn(
													"mymind-wrapped-skills-stage__card",
													((isDeckVisible && cardIndex === activeCardIndex) ||
														(skillsEntranceStage === "deal" &&
															frontDealCardIndex !== null &&
															cardIndex === frontDealCardIndex)) &&
														"is-front",
												)}
												data-debug-label={`card ${card.item.rank}`}
												data-card-stage={skillsEntranceStage}
												style={cardStyle}
											>
												<div
													className={cn(
														"mymind-wrapped-skills-stage__card-item",
														card.item.isPlaceholder && "is-placeholder",
													)}
													data-debug-label={`card ${card.item.rank} item grid`}
												>
													<span
														className="mymind-wrapped-skills-stage__item-rank"
														data-debug-label={`rank ${card.item.rank}`}
													>
														{card.item.rank}
													</span>
													<div
														className="mymind-wrapped-skills-stage__item-copy"
														data-debug-label={`card ${card.item.rank} copy`}
													>
														<p
															className="mymind-wrapped-skills-stage__item-name"
															data-debug-label={`card ${card.item.rank} name`}
														>
															{card.item.name}
														</p>
														<p
															className="mymind-wrapped-skills-stage__item-meta"
															data-debug-label={`card ${card.item.rank} meta`}
														>
															{card.item.meta}
														</p>
													</div>
												</div>
											</article>
										);
									})}
								</div>
							</section>
						</div>
					</motion.div>
				)
			}
		/>
	);
}

function WrappedSkillsIntroLine(props: { reduceMotion: boolean }) {
	const { reduceMotion } = props;

	return (
		<span
			className="mymind-wrapped-skills-stage__intro-line"
			data-debug-label="intro line"
		>
			{SKILLS_STAGE_INTRO_TOKENS.map((token, tokenIndex) => (
				<motion.span
					key={token}
					animate={
						reduceMotion
							? { opacity: 1 }
							: { filter: "blur(0px)", opacity: 1, y: 0 }
					}
					className="mymind-wrapped-skills-stage__intro-token"
					data-debug-label={`intro token: ${token}`}
					initial={
						reduceMotion
							? { opacity: 0 }
							: { filter: "blur(10px)", opacity: 0, y: 12 }
					}
					transition={
						reduceMotion
							? {
									delay: tokenIndex * 0.03,
									duration: 0.1,
									ease: "linear",
								}
							: {
									delay: tokenIndex * SKILLS_STAGE_INTRO_TOKEN_STAGGER_S,
									...SKILLS_STAGE_INTRO_TOKEN_TRANSITION,
								}
					}
				>
					{token}
				</motion.span>
			))}
		</span>
	);
}
