import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface WrappedStageFrameProps {
	className?: string;
	copy?: ReactNode;
	copyClassName?: string;
	object?: ReactNode;
	objectClassName?: string;
	support?: ReactNode;
	supportClassName?: string;
}

export type WrappedStageCopyEntrancePreset = "none" | "setup" | "story";

interface WrappedStageCopyProps {
	className?: string;
	description?: ReactNode;
	descriptionClassName?: string;
	eyebrow?: ReactNode;
	eyebrowClassName?: string;
	entrancePreset?: WrappedStageCopyEntrancePreset;
	title: ReactNode;
	titleAs?: "h1" | "h2";
	titleClassName?: string;
}

const WRAPPED_STAGE_COPY_SETUP_EASE = [0.22, 1, 0.36, 1] as const;
const WRAPPED_STAGE_COPY_STORY_EASE = [0.22, 1, 0.36, 1] as const;
const WRAPPED_STAGE_COPY_REDUCED_DURATION = 0.14;

export function WrappedStageFrame(props: WrappedStageFrameProps) {
	const {
		className,
		copy,
		copyClassName,
		object,
		objectClassName,
		support,
		supportClassName,
	} = props;
	const hasCopy = copy !== undefined && copy !== null;
	const hasObject = object !== undefined && object !== null;
	const hasSupport = support !== undefined && support !== null;

	return (
		<section
			className={cn(
				"mymind-wrapped-stage",
				hasSupport
					? "mymind-wrapped-stage--with-support"
					: "mymind-wrapped-stage--without-support",
				className,
			)}
		>
			{hasCopy ? (
				<div className={cn("mymind-wrapped-stage__copy", copyClassName)}>
					{copy}
				</div>
			) : null}
			{hasObject ? (
				<div className={cn("mymind-wrapped-stage__object", objectClassName)}>
					{object}
				</div>
			) : null}
			{hasSupport ? (
				<div className={cn("mymind-wrapped-stage__support", supportClassName)}>
					{support}
				</div>
			) : null}
		</section>
	);
}

export function WrappedStageCopy(props: WrappedStageCopyProps) {
	const {
		className,
		description,
		descriptionClassName,
		eyebrow,
		eyebrowClassName,
		entrancePreset = "none",
		title,
		titleAs = "h1",
		titleClassName,
	} = props;
	const TitleTag = titleAs;
	const MotionTitleTag = titleAs === "h2" ? motion.h2 : motion.h1;
	const shouldReduceMotion = useReducedMotion();
	const reduceMotion = shouldReduceMotion ?? false;
	const shouldAnimateSetupEntrance = entrancePreset === "setup";
	const shouldAnimateStoryEntrance = entrancePreset === "story";
	const shouldAnimateEntrance =
		shouldAnimateSetupEntrance || shouldAnimateStoryEntrance;
	const eyebrowDelay = shouldAnimateSetupEntrance ? 0.08 : 0.04;
	const eyebrowDuration = shouldAnimateSetupEntrance ? 0.22 : 0.18;
	const titleDelay = shouldAnimateSetupEntrance ? 0.16 : 0.08;
	const titleDuration = shouldAnimateSetupEntrance ? 0.42 : 0.34;
	const descriptionDelay = shouldAnimateSetupEntrance ? 0.22 : 0.14;
	const descriptionDuration = shouldAnimateSetupEntrance ? 0.26 : 0.24;
	const titleInitial = shouldAnimateSetupEntrance
		? { filter: "blur(14px)", opacity: 0, scale: 0.986, y: 8 }
		: { filter: "blur(12px)", opacity: 0, scale: 0.992, y: 12 };
	const titleAnimate = shouldAnimateSetupEntrance
		? { filter: "blur(0px)", opacity: 1, scale: 1, y: 0 }
		: { filter: "blur(0px)", opacity: 1, scale: 1, y: 0 };
	const descriptionInitial = shouldAnimateSetupEntrance
		? { opacity: 0, y: 12 }
		: { filter: "blur(8px)", opacity: 0, y: 10 };
	const descriptionAnimate = shouldAnimateSetupEntrance
		? { opacity: 1, y: 0 }
		: { filter: "blur(0px)", opacity: 1, y: 0 };

	return (
		<div className={cn("mymind-wrapped-stage-copy", className)}>
			{eyebrow ? (
				shouldAnimateEntrance ? (
					<motion.p
						animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
						className={cn(
							"mymind-wrapped-stage-copy__eyebrow",
							eyebrowClassName,
						)}
						initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
						transition={
							reduceMotion
								? {
										delay: eyebrowDelay,
										duration: WRAPPED_STAGE_COPY_REDUCED_DURATION,
										ease: "linear",
									}
								: {
										delay: eyebrowDelay,
										duration: eyebrowDuration,
										ease: shouldAnimateSetupEntrance
											? WRAPPED_STAGE_COPY_SETUP_EASE
											: WRAPPED_STAGE_COPY_STORY_EASE,
									}
						}
					>
						{eyebrow}
					</motion.p>
				) : (
					<p
						className={cn(
							"mymind-wrapped-stage-copy__eyebrow",
							eyebrowClassName,
						)}
					>
						{eyebrow}
					</p>
				)
			) : null}
			{shouldAnimateEntrance ? (
				<MotionTitleTag
					animate={reduceMotion ? { opacity: 1 } : titleAnimate}
					className={cn("mymind-wrapped-stage-copy__headline", titleClassName)}
					initial={reduceMotion ? { opacity: 0 } : titleInitial}
					transition={
						reduceMotion
							? {
									delay: titleDelay,
									duration: WRAPPED_STAGE_COPY_REDUCED_DURATION,
									ease: "linear",
								}
							: {
									delay: titleDelay,
									duration: titleDuration,
									ease: shouldAnimateSetupEntrance
										? WRAPPED_STAGE_COPY_SETUP_EASE
										: WRAPPED_STAGE_COPY_STORY_EASE,
								}
					}
				>
					{title}
				</MotionTitleTag>
			) : (
				<TitleTag
					className={cn("mymind-wrapped-stage-copy__headline", titleClassName)}
				>
					{title}
				</TitleTag>
			)}
			{description ? (
				shouldAnimateEntrance ? (
					<motion.div
						animate={reduceMotion ? { opacity: 1 } : descriptionAnimate}
						className={cn(
							"mymind-wrapped-stage-copy__description",
							descriptionClassName,
						)}
						initial={reduceMotion ? { opacity: 0 } : descriptionInitial}
						transition={
							reduceMotion
								? {
										delay: descriptionDelay,
										duration: WRAPPED_STAGE_COPY_REDUCED_DURATION,
										ease: "linear",
									}
								: {
										delay: descriptionDelay,
										duration: descriptionDuration,
										ease: shouldAnimateSetupEntrance
											? WRAPPED_STAGE_COPY_SETUP_EASE
											: WRAPPED_STAGE_COPY_STORY_EASE,
									}
						}
					>
						{description}
					</motion.div>
				) : (
					<div
						className={cn(
							"mymind-wrapped-stage-copy__description",
							descriptionClassName,
						)}
					>
						{description}
					</div>
				)
			) : null}
		</div>
	);
}
