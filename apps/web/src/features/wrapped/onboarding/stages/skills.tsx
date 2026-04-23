import { Frown } from "lucide-react";
import type { CSSProperties, TouchEvent } from "react";
import { useRef, useState } from "react";
import { useMountEffect } from "@/hooks/useMountEffect";
import { cn } from "@/lib/utils";
import {
	clampSkillsCardIndex,
	getSkillsCardStyle,
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
	"--skills-stack-track-height": string;
}

const ANTHROPIC_SKILLS_DOCS_URL =
	"https://docs.anthropic.com/en/docs/claude-code/skills";

export function WrappedOnboardingSkillsStage(props: SkillsStageProps) {
	const { onboardingMetrics, previewState } = props;
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
	const isEmptySkillsBoard = !model.hasRankedSkills;

	function setNextActiveCardIndex(direction: 1 | -1) {
		setActiveCardIndex((previousIndex) =>
			clampSkillsCardIndex(previousIndex + direction, model.cards.length),
		);
	}

	function handleSkillsCardWheelDelta(deltaY: number) {
		if (!model.isScrollable || deltaY === 0) {
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
		if (!model.isScrollable) {
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
		if (!model.isScrollable) {
			return;
		}

		touchStartYRef.current = event.touches[0]?.clientY ?? null;
	}

	function handleSkillsCardTouchEnd(event: TouchEvent<HTMLElement>) {
		if (!model.isScrollable) {
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

	const stackStyle: SkillsTrackStyle = {
		"--skills-stack-track-height": `${model.trackHeightRem}rem`,
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
					<div ref={stackRef} className="mymind-wrapped-skills-stage__stack">
						<div
							className="mymind-wrapped-skills-stage__stack-track"
							style={stackStyle}
						>
							{model.cards.map((card, cardIndex) => (
								<article
									key={card.id}
									className={cn(
										"mymind-wrapped-skills-stage__card",
										cardIndex === activeCardIndex && "is-front",
									)}
									onTouchEnd={handleSkillsCardTouchEnd}
									onTouchStart={handleSkillsCardTouchStart}
									style={getSkillsCardStyle(cardIndex, activeCardIndex)}
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
							))}
						</div>
					</div>
				)
			}
			support={
				isEmptySkillsBoard ? undefined : (
					<p className="mymind-wrapped-skills-stage__footnote">
						{model.footnote}
					</p>
				)
			}
		/>
	);
}
