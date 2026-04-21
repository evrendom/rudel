import type { CSSProperties, TouchEvent, WheelEvent } from "react";
import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
	clampSkillsCardIndex,
	getSkillsCardStyle,
	resolveSkillsPreviewInput,
	resolveSkillsStageModel,
	SKILLS_STACK,
} from "../models";
import type { WrappedOnboardingMetrics } from "../types";

interface SkillsStageProps {
	onboardingMetrics: WrappedOnboardingMetrics;
	previewState: string;
}

interface SkillsTrackStyle extends CSSProperties {
	"--skills-stack-track-height": string;
}

export function WrappedOnboardingSkillsStage(props: SkillsStageProps) {
	const { onboardingMetrics, previewState } = props;
	const wheelAccumulationRef = useRef(0);
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

	function handleSkillsCardWheel(event: WheelEvent<HTMLDivElement>) {
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
		if (!cardElement || !event.currentTarget.contains(cardElement)) {
			return;
		}

		event.preventDefault();
		handleSkillsCardWheelDelta(event.deltaY);
	}

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
		<section className="mymind-wrapped-skills-stage">
			<div className="mymind-wrapped-skills-stage__hero">
				<p className="mymind-wrapped-skills-stage__eyebrow">Skills board</p>
				<h2 className="mymind-wrapped-skills-stage__headline">
					{model.headline}
				</h2>
				{model.subline ? (
					<p className="mymind-wrapped-skills-stage__subline">
						{model.subline}
					</p>
				) : null}
			</div>

			<div
				className="mymind-wrapped-skills-stage__stack"
				onWheel={handleSkillsCardWheel}
			>
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

			<p className="mymind-wrapped-skills-stage__footnote">{model.footnote}</p>
		</section>
	);
}
