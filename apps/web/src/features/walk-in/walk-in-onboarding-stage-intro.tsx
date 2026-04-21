import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import {
	buildIntroCommitGraph,
	resolveIntroPreviewInput,
	resolveIntroStageModel,
} from "./walk-in-onboarding-helpers";
import type { WalkInOnboardingMetrics } from "./walk-in-onboarding-types";

const INTRO_EXIT = {
	distance: 72,
	duration: 0.24,
	lineDelay: 0.04,
	ease: [0.22, 1, 0.36, 1] as const,
};

interface IntroStageProps {
	displayName: string;
	isExiting: boolean;
	isSparse: boolean;
	onboardingMetrics: WalkInOnboardingMetrics;
	previewState: string;
	totalSessions: number;
}

export function WalkInOnboardingIntroStage(props: IntroStageProps) {
	const {
		displayName,
		isExiting,
		isSparse,
		onboardingMetrics,
		previewState,
		totalSessions,
	} = props;
	const introInput = resolveIntroPreviewInput(
		{
			activeDays: onboardingMetrics.activeDays,
			daysSinceFirst: onboardingMetrics.daysSinceFirst,
			displayName,
			totalSessions,
		},
		previewState,
	);
	const model = resolveIntroStageModel(introInput);
	const commitGraph = buildIntroCommitGraph(introInput);

	return (
		<section className="mymind-walk-in-intro-stage">
			<motion.div
				animate={
					isExiting
						? {
								opacity: 0,
								x: -INTRO_EXIT.distance,
							}
						: { opacity: 1, x: 0 }
				}
				className="mymind-walk-in-intro-stage__hero"
				initial={false}
				transition={
					isExiting
						? {
								duration: INTRO_EXIT.duration,
								ease: INTRO_EXIT.ease,
							}
						: { duration: 0 }
				}
			>
				<h2 className="mymind-walk-in-intro-stage__headline">{model.headline}</h2>
			</motion.div>

			<motion.div
				animate={
					isExiting
						? {
								opacity: 0,
								y: 14,
							}
						: { opacity: 1, y: 0 }
				}
				aria-hidden="true"
				className="mymind-walk-in-intro-stage__commit-graph"
				initial={false}
				transition={
					isExiting
						? {
								duration: INTRO_EXIT.duration,
								ease: INTRO_EXIT.ease,
								delay: INTRO_EXIT.lineDelay * 2,
							}
						: { duration: 0 }
				}
			>
				{commitGraph.map((dot) => (
					<span
						key={dot.id}
						className={cn(
							"mymind-walk-in-intro-stage__commit-dot",
							`is-level-${dot.level}`,
						)}
					/>
				))}
			</motion.div>

			<motion.div
				animate={
					isExiting
						? {
								opacity: 0,
								x: INTRO_EXIT.distance,
							}
						: { opacity: 1, x: 0 }
				}
				className={cn(
					"mymind-walk-in-intro-stage__signal-card",
					isSparse && "is-sparse",
				)}
				initial={false}
				transition={
					isExiting
						? {
								duration: INTRO_EXIT.duration,
								ease: INTRO_EXIT.ease,
								delay: INTRO_EXIT.lineDelay,
							}
						: { duration: 0 }
				}
			>
				<div className="mymind-walk-in-intro-stage__signal-main">
					<p className="mymind-walk-in-intro-stage__signal-value">
						{model.cardValue}
					</p>
					<p className="mymind-walk-in-intro-stage__signal-detail">
						{model.cardDetail}
					</p>
					<p className="mymind-walk-in-intro-stage__signal-meta">
						{model.cardMeta}
					</p>
				</div>
			</motion.div>

			<motion.p
				animate={
					isExiting
						? {
								opacity: 0,
								y: 12,
							}
						: { opacity: 1, y: 0 }
				}
				className="mymind-walk-in-intro-stage__footnote"
				initial={false}
				transition={
					isExiting
						? {
								duration: INTRO_EXIT.duration,
								ease: INTRO_EXIT.ease,
								delay: INTRO_EXIT.lineDelay * 3,
							}
						: { duration: 0 }
				}
			>
				{model.footnote}
			</motion.p>
		</section>
	);
}
