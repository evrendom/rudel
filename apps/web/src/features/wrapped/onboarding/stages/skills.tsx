import { useDialKit } from "dialkit";
import { useReducedMotion } from "motion/react";
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
 *    0ms   one lead card is visible with the rest tucked behind it
 *  140ms   the stack opens into a full in-stage column
 * 1140ms   the full column holds for a beat
 * 1140ms   cards settle into the final deck
 * 1700ms   deck motion ends and swipe / scroll controls unlock
 * ───────────────────────────────────────────────────────── */
type SkillsEntranceStage = "collapsed" | "column" | "settling" | "deck";

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
		useState<SkillsEntranceStage>(() => (reduceMotion ? "deck" : "collapsed"));
	const dialValues = useDialKit(
		"Wrapped Skills Stage",
		{
			animation: {
				_collapsed: true,
				collapsedHoldMs: [140, 0, 700, 10],
				columnHoldMs: [1000, 150, 2200, 10],
				deckSettleMs: [560, 180, 1400, 10],
			},
			collapsed: {
				_collapsed: true,
				scaleStep: [0.004, 0, 0.02, 0.001],
				stepRem: [1.02, 0.2, 1.6, 0.01],
				topRem: [0.72, 0, 2.4, 0.01],
				widthPercent: [100, 96, 100, 0.5],
			},
			column: {
				_collapsed: true,
				insetRem: [0.6, 0, 1.8, 0.01],
			},
			fade: {
				_collapsed: true,
				bottomHeightRem: [5.2, 1.5, 9, 0.1],
				insetRem: [-2, -4, 0, 0.1],
				topHeightRem: [4.6, 1.5, 8, 0.1],
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
		setSkillsEntranceStage("collapsed");
		const timers = [
			window.setTimeout(() => {
				setSkillsEntranceStage("column");
			}, dialValues.animation.collapsedHoldMs),
			window.setTimeout(() => {
				setSkillsEntranceStage("settling");
			}, dialValues.animation.collapsedHoldMs + dialValues.animation.columnHoldMs),
			window.setTimeout(() => {
				setSkillsEntranceStage("deck");
			}, dialValues.animation.collapsedHoldMs +
				dialValues.animation.columnHoldMs +
				dialValues.animation.deckSettleMs),
		];

		return () => {
			for (const timer of timers) {
				window.clearTimeout(timer);
			}
		};
	}, [
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
			className="mymind-wrapped-skills-stage"
			copy={
				<WrappedOnboardingStageCopy
					title={model.headline}
					description={isEmptySkillsBoard ? undefined : model.subline}
				/>
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
				) : (
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
											? getSkillsColumnCardStyle(
													cardIndex,
													model.cards.length,
													dialValues.column.insetRem,
												)
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
				)
			}
		/>
	);
}
