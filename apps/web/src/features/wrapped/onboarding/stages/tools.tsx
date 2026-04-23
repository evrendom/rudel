import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { CSSProperties } from "react";
import { useState } from "react";
import { useMountEffect } from "@/hooks/useMountEffect";
import { cn } from "@/lib/utils";
import { formatPercent } from "../format";
import {
	getToolsEntryStyle,
	getToolsStackHeightRem,
	resolveToolsPreviewInput,
	resolveToolsStageModel,
} from "../models";
import type { WrappedOnboardingMetrics } from "../types";
import {
	WrappedOnboardingStageCopy,
	WrappedOnboardingStageFrame,
} from "./frame";

interface ToolsStageProps {
	onboardingMetrics: WrappedOnboardingMetrics;
	previewState: string;
}

interface ToolsStackStyle extends CSSProperties {
	"--tools-stack-height": string;
}

interface ToolsMeterStyle extends CSSProperties {
	"--tools-stage-meter-value": string;
}

type ToolsStageSequenceFrame = {
	key: string;
	title: string;
};

const TOOLS_STAGE_SEQUENCE_TRANSITION = {
	duration: 0.26,
	ease: [0.22, 1, 0.36, 1] as const,
};

const TOOLS_STAGE_COPY_TRANSITION = {
	bounce: 0.16,
	duration: 0.52,
	type: "spring" as const,
};

const TOOLS_STAGE_SEQUENCE_HOLD_MS = [1_420, 1_520] as const;
const TOOLS_STAGE_SCENE_REVEAL_HOLD_MS = 2_160;

export function WrappedOnboardingToolsStage(props: ToolsStageProps) {
	const { onboardingMetrics, previewState } = props;
	const shouldReduceMotion = useReducedMotion();
	const reduceMotion = shouldReduceMotion ?? false;
	const previewInput = resolveToolsPreviewInput(
		{
			slashCommandsAdoptionRate: onboardingMetrics.slashCommandsAdoptionRate,
			subagentsAdoptionRate: onboardingMetrics.subagentsAdoptionRate,
			topSlashCommand: onboardingMetrics.topSlashCommand,
			topSlashCommands: onboardingMetrics.topSlashCommands,
			topSlashCommandCount: onboardingMetrics.topSlashCommandCount,
			topSubagent: onboardingMetrics.topSubagent,
			topSubagents: onboardingMetrics.topSubagents,
			topSubagentCount: onboardingMetrics.topSubagentCount,
			totalSessions: onboardingMetrics.totalSessions,
		},
		previewState,
	);
	const model = resolveToolsStageModel(previewInput);
	const sequenceFrames = resolveToolsStageSequenceFrames(
		onboardingMetrics.skillsAdoptionRate,
		onboardingMetrics.topSkills,
		previewInput.topSlashCommand,
		previewInput.topSubagent,
		model.headline,
	);
	const [activeCardIndex, setActiveCardIndex] = useState(0);
	const [sequenceIndex, setSequenceIndex] = useState(() =>
		reduceMotion ? sequenceFrames.length - 1 : 0,
	);
	const [isSceneVisible, setIsSceneVisible] = useState(reduceMotion);
	const cardStyle: ToolsStackStyle = {
		"--tools-stack-height": `${getToolsStackHeightRem(model.entries.length)}rem`,
	};
	const activeSequenceFrame =
		sequenceFrames[sequenceIndex] ?? sequenceFrames.at(-1);
	const showFinalScene =
		reduceMotion || isSceneVisible || sequenceFrames.length === 1;

	useMountEffect(() => {
		if (reduceMotion || sequenceFrames.length <= 1) {
			setSequenceIndex(sequenceFrames.length - 1);
			setIsSceneVisible(true);
			return;
		}

		setSequenceIndex(0);
		setIsSceneVisible(false);
		let elapsedMs = 0;
		const timeoutIds = sequenceFrames.slice(0, -1).map((_item, itemIndex) => {
			elapsedMs +=
				TOOLS_STAGE_SEQUENCE_HOLD_MS[itemIndex] ??
				TOOLS_STAGE_SEQUENCE_HOLD_MS.at(-1) ??
				1_420;

			return window.setTimeout(() => {
				setSequenceIndex(itemIndex + 1);
			}, elapsedMs);
		});
		timeoutIds.push(
			window.setTimeout(() => {
				setIsSceneVisible(true);
			}, elapsedMs + TOOLS_STAGE_SCENE_REVEAL_HOLD_MS),
		);

		return () => {
			for (const timeoutId of timeoutIds) {
				window.clearTimeout(timeoutId);
			}
		};
	});

	return (
		<WrappedOnboardingStageFrame
			className={cn(
				"mymind-wrapped-tools-stage",
				!showFinalScene && "mymind-wrapped-tools-stage--intro-copy",
			)}
			objectClassName="mymind-wrapped-tools-stage__object"
			copy={
				<motion.div
					layout="position"
					className="mymind-wrapped-tools-stage__copy-shell"
					transition={TOOLS_STAGE_SEQUENCE_TRANSITION}
				>
					<WrappedOnboardingStageCopy
						title={
							<AnimatePresence initial={false} mode="wait">
								<motion.span
									key={activeSequenceFrame?.key ?? "tools-final"}
									animate={{
										filter: "blur(0px)",
										opacity: 1,
										rotate: "0deg",
										scale: 1,
										y: 0,
									}}
									className="mymind-wrapped-tools-stage__title-shell"
									exit={{
										filter: "blur(8px)",
										opacity: 0,
										rotate: "-1.2deg",
										scale: 1.015,
										y: -28,
									}}
									initial={{
										filter: "blur(14px)",
										opacity: 0,
										rotate: "1.4deg",
										scale: 0.965,
										y: 28,
									}}
									transition={TOOLS_STAGE_COPY_TRANSITION}
								>
									{activeSequenceFrame?.title ?? model.headline}
								</motion.span>
							</AnimatePresence>
						}
					/>
				</motion.div>
			}
			object={
				showFinalScene ? (
					<motion.article
						animate={{ filter: "blur(0px)", opacity: 1, scale: 1, y: 0 }}
						initial={
							reduceMotion
								? { filter: "blur(0px)", opacity: 1, scale: 1, y: 0 }
								: {
										filter: "blur(4px)",
										opacity: 0,
										scale: 0.97,
										y: 14,
									}
						}
						className="mymind-wrapped-tools-stage__card"
						style={cardStyle}
						transition={TOOLS_STAGE_SEQUENCE_TRANSITION}
					>
						<ul className="mymind-wrapped-tools-stage__list">
							{model.entries.map((entry, entryIndex) => {
								const meterStyle: ToolsMeterStyle = {
									"--tools-stage-meter-value": `${entry.usageRate ?? 0}%`,
								};
								const entryStyle = getToolsEntryStyle(
									entryIndex,
									model.entries.length,
									activeCardIndex,
								);
								const hiddenPose = resolveToolsCardHiddenPose(entryIndex);

								return (
									<motion.li
										key={entry.id}
										animate={{
											filter: "blur(0px)",
											opacity: 1,
											rotate: "0deg",
											scale: 1,
											x: 0,
											y: 0,
										}}
										className="mymind-wrapped-tools-stage__entry-shell"
										initial={
											reduceMotion
												? {
														filter: "blur(0px)",
														opacity: 1,
														rotate: "0deg",
														scale: 1,
														x: 0,
														y: 0,
													}
												: {
														filter: "blur(10px)",
														opacity: 0,
														rotate: hiddenPose.rotate,
														scale: hiddenPose.scale,
														x: hiddenPose.x,
														y: hiddenPose.y,
													}
										}
										style={{ zIndex: entryStyle.zIndex }}
										transition={
											reduceMotion
												? {
														duration: 0.08,
														ease: TOOLS_STAGE_SEQUENCE_TRANSITION.ease,
													}
												: {
														bounce: 0.24,
														delay: 0.18 + entryIndex * 0.16,
														duration: 0.82,
														type: "spring",
													}
										}
									>
										<button
											aria-label={`${entry.name}. ${entry.usageLabel}`}
											aria-pressed={entryIndex === activeCardIndex}
											className={cn(
												"mymind-wrapped-tools-stage__entry",
												entryIndex === activeCardIndex && "is-front",
												entry.isPlaceholder && "is-placeholder",
											)}
											onClick={() => setActiveCardIndex(entryIndex)}
											onFocus={() => setActiveCardIndex(entryIndex)}
											style={entryStyle}
											type="button"
										>
											<span className="mymind-wrapped-tools-stage__entry-top">
												<span className="mymind-wrapped-tools-stage__entry-usage">
													{entry.usageLabel}
												</span>
											</span>
											<span className="mymind-wrapped-tools-stage__entry-name">
												{entry.name}
											</span>
											<span
												aria-hidden="true"
												className="mymind-wrapped-tools-stage__meter"
											>
												<span
													className="mymind-wrapped-tools-stage__meter-fill"
													style={meterStyle}
												/>
											</span>
										</button>
									</motion.li>
								);
							})}
						</ul>
					</motion.article>
				) : null
			}
		/>
	);
}

function resolveToolsStageSequenceFrames(
	skillsAdoptionRate: number | null,
	topSkills: readonly { count: number; name: string }[],
	topSlashCommand: string | null,
	topSubagent: string | null,
	finalTitle: string,
): ToolsStageSequenceFrame[] {
	return [
		{
			key: "skills",
			title: resolveToolsSkillsBridgeLine(skillsAdoptionRate, topSkills),
		},
		{
			key: "tools",
			title: resolveToolsTransitionLine(topSlashCommand, topSubagent),
		},
		{
			key: "final",
			title: finalTitle,
		},
	];
}

function resolveToolsSkillsBridgeLine(
	skillsAdoptionRate: number | null,
	topSkills: readonly { count: number; name: string }[],
) {
	if (skillsAdoptionRate !== null) {
		return `Skills showed up in ${formatPercent(skillsAdoptionRate)} of sessions.`;
	}

	const leadSkill = topSkills.find(
		(skill) => skill.name.trim().length > 0 && skill.count > 0,
	);
	if (leadSkill) {
		return `${leadSkill.name} was your clearest skill signal.`;
	}

	return "Skills were the first extra layer to show up.";
}

function resolveToolsTransitionLine(
	topSlashCommand: string | null,
	topSubagent: string | null,
) {
	if (topSlashCommand && topSubagent) {
		return "Then tools split into commands and helpers.";
	}

	if (topSlashCommand) {
		return "Then one command started to stand out.";
	}

	if (topSubagent) {
		return "Then one helper started to stand out.";
	}

	return "Then the tool layer stayed quiet.";
}

function resolveToolsCardHiddenPose(entryIndex: number) {
	if (entryIndex === 0) {
		return { rotate: "-12deg", scale: 0.84, x: -22, y: 44 };
	}

	if (entryIndex === 1) {
		return { rotate: "14deg", scale: 0.88, x: 22, y: 54 };
	}

	return { rotate: "-16deg", scale: 0.9, x: -12, y: 64 };
}
