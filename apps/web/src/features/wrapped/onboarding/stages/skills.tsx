import { useDialKit } from "dialkit";
import { motion, useReducedMotion } from "motion/react";
import { Frown } from "lucide-react";
import type { CSSProperties, TouchEvent } from "react";
import { startTransition, useEffect, useRef, useState } from "react";
import { useMountEffect } from "@/hooks/useMountEffect";
import { cn } from "@/lib/utils";
import {
	clampSkillsCardIndex,
	getSkillsCollapsedCardStyle,
	getSkillsCardStyle,
	getSkillsColumnCardStyle,
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
 *  920ms   one lead card is visible with the rest tucked behind it
 * 1060ms   the stack opens into a full in-stage column
 * 2060ms   the full column holds for a beat
 * 2060ms   cards settle into the final deck
 * 2620ms   deck motion ends, title/subtitle arrive, and controls unlock
 * ───────────────────────────────────────────────────────── */
type SkillsEntranceStage =
	| "intro"
	| "collapsed"
	| "column"
	| "settling"
	| "deck";

const SKILLS_STAGE_COPY_TRANSITION = {
	duration: 0.24,
	ease: [0.22, 1, 0.36, 1] as const,
};

const SKILLS_STAGE_OBJECT_TRANSITION = {
	duration: 0.42,
	ease: [0.22, 1, 0.36, 1] as const,
};

const SKILLS_STAGE_INTRO_LINE = "The same skills kept showing up.";

export function WrappedOnboardingSkillsStage(props: SkillsStageProps) {
	const { onboardingMetrics, previewState } = props;
	const shouldReduceMotion = useReducedMotion();
	const reduceMotion = shouldReduceMotion ?? false;
	const [replayNonce, setReplayNonce] = useState(0);
	const stackRef = useRef<HTMLDivElement | null>(null);
	const wheelAccumulationRef = useRef(0);
	const wheelHandlerRef = useRef<(event: WheelEvent) => void>(() => {});
	const lastWheelTimestampRef = useRef(0);
	const lockedUntilTimestampRef = useRef(0);
	const touchStartYRef = useRef<number | null>(null);
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
	const [skillsEntranceStage, setSkillsEntranceStage] =
		useState<SkillsEntranceStage>(() => (reduceMotion ? "deck" : "intro"));
	const dialValues = useDialKit(
		"Wrapped Skills Stage",
		{
			animation: {
				_collapsed: true,
				introHoldMs: [920, 200, 1800, 10],
				collapsedHoldMs: [60, 0, 500, 10],
				columnHoldMs: [1000, 150, 2200, 10],
				deckSettleMs: [560, 180, 1400, 10],
			},
			collapsed: {
				_collapsed: true,
				scaleStep: [0.002, 0, 0.02, 0.001],
				stepRem: [1.48, 0.2, 2.2, 0.01],
				topRem: [0.1, 0, 2.4, 0.01],
				widthPercent: [100, 96, 100, 0.5],
			},
			column: {
				_collapsed: true,
				scale: [1, 0.6, 1.2, 0.01],
				stepRem: [5.15, 3.8, 6.6, 0.01],
				topRem: [0.15, -6, 4, 0.01],
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
	const isStackInteractive = skillsEntranceStage === "deck";
	const isIntroCopyVisible = skillsEntranceStage === "intro";
	const isComponentOnlyVisible =
		skillsEntranceStage === "collapsed" ||
		skillsEntranceStage === "column" ||
		skillsEntranceStage === "settling";
	const isFinalCopyVisible = skillsEntranceStage === "deck";
	const resolvedStackStage =
		skillsEntranceStage === "collapsed"
			? "collapsed"
			: skillsEntranceStage === "column"
				? "column"
				: "deck";

	function setNextActiveCardIndex(direction: 1 | -1) {
		setActiveCardIndex((previousIndex) =>
			clampSkillsCardIndex(previousIndex + direction, model.cards.length),
		);
	}

	function handleSkillsCardWheelDelta(deltaY: number) {
		if (!model.isScrollable || !isStackInteractive || deltaY === 0) {
			return;
		}

		const now = performance.now();
		if (now < lockedUntilTimestampRef.current) {
			return;
		}

		if (now - lastWheelTimestampRef.current > SKILLS_STACK.wheelResetMs) {
			wheelAccumulationRef.current = 0;
		}

		lastWheelTimestampRef.current = now;
		wheelAccumulationRef.current += deltaY;

		if (
			Math.abs(wheelAccumulationRef.current) < SKILLS_STACK.wheelThresholdPx
		) {
			return;
		}

		const direction = wheelAccumulationRef.current > 0 ? 1 : -1;
		wheelAccumulationRef.current = 0;
		lockedUntilTimestampRef.current = now + SKILLS_STACK.interactionLockMs;
		setNextActiveCardIndex(direction);
	}

	wheelHandlerRef.current = (event: WheelEvent) => {
		if (!model.isScrollable || !isStackInteractive) {
			return;
		}

		const eventTarget = event.target;
		if (!(eventTarget instanceof Element)) {
			return;
		}

		const cardElement = eventTarget.closest(
			".mymind-wrapped-skills-stage__card",
		);
		if (!cardElement || !stackRef.current?.contains(cardElement)) {
			return;
		}

		event.preventDefault();
		handleSkillsCardWheelDelta(event.deltaY);
	};

	useMountEffect(() => {
		const stackElement = stackRef.current;
		if (!stackElement) {
			return;
		}

		function handleWheelEvent(event: WheelEvent) {
			wheelHandlerRef.current(event);
		}

		stackElement.addEventListener("wheel", handleWheelEvent, {
			passive: false,
		});

		return () => {
			stackElement.removeEventListener("wheel", handleWheelEvent);
		};
	});

	function handleSkillsCardTouchStart(event: TouchEvent<HTMLElement>) {
		if (!model.isScrollable || !isStackInteractive) {
			return;
		}

		touchStartYRef.current = event.touches[0]?.clientY ?? null;
	}

	function handleSkillsCardTouchEnd(event: TouchEvent<HTMLElement>) {
		if (!model.isScrollable || !isStackInteractive) {
			return;
		}

		const touchStartY = touchStartYRef.current;
		const touchEndY = event.changedTouches[0]?.clientY ?? null;
		touchStartYRef.current = null;

		if (touchStartY === null || touchEndY === null) {
			return;
		}

		const now = performance.now();
		if (now < lockedUntilTimestampRef.current) {
			return;
		}

		const deltaY = touchStartY - touchEndY;
		if (Math.abs(deltaY) < SKILLS_STACK.touchThresholdPx) {
			return;
		}

		lockedUntilTimestampRef.current = now + SKILLS_STACK.interactionLockMs;
		setNextActiveCardIndex(deltaY > 0 ? 1 : -1);
	}

	useEffect(() => {
		if (reduceMotion || isEmptySkillsBoard) {
			setSkillsEntranceStage("deck");
			return;
		}

		setActiveCardIndex(0);
		setSkillsEntranceStage("intro");
		const timers = [
			window.setTimeout(() => {
				setSkillsEntranceStage("collapsed");
			}, dialValues.animation.introHoldMs),
			window.setTimeout(() => {
				setSkillsEntranceStage("column");
			}, dialValues.animation.introHoldMs +
				dialValues.animation.collapsedHoldMs),
			window.setTimeout(() => {
				setSkillsEntranceStage("settling");
			}, dialValues.animation.introHoldMs +
				dialValues.animation.collapsedHoldMs +
				dialValues.animation.columnHoldMs),
			window.setTimeout(() => {
				setSkillsEntranceStage("deck");
			}, dialValues.animation.introHoldMs +
				dialValues.animation.collapsedHoldMs +
				dialValues.animation.columnHoldMs +
				dialValues.animation.deckSettleMs),
		];

		return () => {
			for (const timer of timers) {
				window.clearTimeout(timer);
			}
		};
	}, [
		dialValues.animation.introHoldMs,
		dialValues.animation.collapsedHoldMs,
		dialValues.animation.columnHoldMs,
		dialValues.animation.deckSettleMs,
		isEmptySkillsBoard,
		reduceMotion,
		replayNonce,
	]);

	const stackStyle: SkillsTrackStyle = {
		"--skills-stack-bottom-fade-height": `${dialValues.fade.bottomHeightRem}rem`,
		"--skills-stack-fade-inset": `${dialValues.fade.insetRem}rem`,
		"--skills-stack-track-height": `${model.trackHeightRem}rem`,
		"--skills-stack-top-fade-height": `${dialValues.fade.topHeightRem}rem`,
	};

	return (
		<WrappedOnboardingStageFrame
			className={cn(
				"mymind-wrapped-skills-stage",
				isIntroCopyVisible && "mymind-wrapped-skills-stage--intro-copy",
				isComponentOnlyVisible &&
					"mymind-wrapped-skills-stage--component-only",
			)}
			copy={
				isEmptySkillsBoard ? (
					<WrappedOnboardingStageCopy
						title={model.headline}
						description={model.subline}
					/>
				) : isIntroCopyVisible ? (
					<motion.div
						animate={{ opacity: 1, scale: 1, y: 0 }}
						initial={{ opacity: 0, scale: 0.985, y: 16 }}
						transition={SKILLS_STAGE_COPY_TRANSITION}
					>
						<WrappedOnboardingStageCopy
							title={SKILLS_STAGE_INTRO_LINE}
							titleClassName="mymind-wrapped-stage-copy__headline--intro"
						/>
					</motion.div>
				) : isFinalCopyVisible ? (
					<motion.div
						animate={{ opacity: 1, scale: 1, y: 0 }}
						initial={{ opacity: 0, scale: 0.985, y: 16 }}
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
					<div className="mymind-wrapped-skills-stage__empty-state">
						<div
							aria-hidden="true"
							className="mymind-wrapped-skills-stage__empty-icon-shell"
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
					</div>
				) : isIntroCopyVisible ? undefined : (
					<motion.div
						animate={{ opacity: 1, scale: 1, y: 0 }}
						className="mymind-wrapped-skills-stage__object-shell"
						initial={{ opacity: 0, scale: 0.99, y: 18 }}
						transition={SKILLS_STAGE_OBJECT_TRANSITION}
					>
						<div
							ref={stackRef}
							className="mymind-wrapped-skills-stage__stack"
							data-stack-stage={resolvedStackStage}
						>
							<div
								className="mymind-wrapped-skills-stage__stack-track"
								style={stackStyle}
							>
								{model.cards.map((card, cardIndex) => {
									const baseCardStyle =
										skillsEntranceStage === "collapsed"
											? getSkillsCollapsedCardStyle({
													cardIndex,
													collapsedScaleStep:
														dialValues.collapsed.scaleStep,
													collapsedStepRem:
														dialValues.collapsed.stepRem,
													totalCards: model.cards.length,
													topRem: dialValues.collapsed.topRem,
													widthPercent:
														dialValues.collapsed.widthPercent,
												})
											: skillsEntranceStage === "column"
												? getSkillsColumnCardStyle(cardIndex, {
														scale: dialValues.column.scale,
														stepRem: dialValues.column.stepRem,
														topRem: dialValues.column.topRem,
													})
												: getSkillsCardStyle(cardIndex, activeCardIndex);
									const cardStyle: SkillsCardStyle = {
										...baseCardStyle,
										pointerEvents: isStackInteractive
											? baseCardStyle.pointerEvents
											: "none",
										"--skills-card-transform-duration":
											`${dialValues.animation.deckSettleMs}ms`,
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
												cardIndex === activeCardIndex &&
													skillsEntranceStage !== "column" &&
													"is-front",
											)}
											onTouchEnd={handleSkillsCardTouchEnd}
											onTouchStart={handleSkillsCardTouchStart}
											style={cardStyle}
										>
											<div
												className={cn(
													"mymind-wrapped-skills-stage__card-item",
													card.item.isPlaceholder && "is-placeholder",
												)}
											>
												<span className="mymind-wrapped-skills-stage__item-rank">
													{card.item.rank}
												</span>
												<div className="mymind-wrapped-skills-stage__item-copy">
													<p className="mymind-wrapped-skills-stage__item-name">
														{card.item.name}
													</p>
													<p className="mymind-wrapped-skills-stage__item-meta">
														{card.item.meta}
													</p>
												</div>
											</div>
										</article>
									);
								})}
							</div>
						</div>
					</motion.div>
				)
			}
		/>
	);
}
