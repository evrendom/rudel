import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { CSSProperties } from "react";
import { useState } from "react";
import { useMountEffect } from "@/hooks/useMountEffect";
import { cn } from "@/lib/utils";
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
	onBaseModelSequenceComplete?: () => void;
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

type ToolsStageScenePhase = "sequence" | "handoff" | "final";

const TOOLS_BASE_MODEL_LINES = [
	"You used no slash commands.",
	"No subagents.",
	"Just vibes.",
] as const;
const ANTHROPIC_COMMANDS_DOCS_URL =
	"https://docs.anthropic.com/en/docs/claude-code/commands";
const ANTHROPIC_SUBAGENTS_DOCS_URL =
	"https://docs.anthropic.com/en/docs/claude-code/sub-agents";
const TOOLS_STAGE_SEQUENCE_TRANSITION = {
	duration: 0.26,
	ease: [0.22, 1, 0.36, 1] as const,
};

const TOOLS_STAGE_COPY_TRANSITION = {
	bounce: 0.16,
	duration: 0.52,
	type: "spring" as const,
};

const TOOLS_BASE_MODEL_LINE_STAGGER_MS = 560;
const TOOLS_BASE_MODEL_DOCS_REVEAL_MS = 260;
const TOOLS_BASE_MODEL_ADVANCE_HOLD_MS = 900;
const TOOLS_BASE_MODEL_REDUCED_ADVANCE_MS = 800;
const TOOLS_STAGE_COPY_HANDOFF_MS = 520;
const TOOLS_STAGE_SEQUENCE_HOLD_MS = [2_040, 2_160] as const;

export function WrappedOnboardingToolsStage(props: ToolsStageProps) {
	const { onboardingMetrics, onBaseModelSequenceComplete, previewState } =
		props;
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
	const isBaseModelStage =
		previewInput.topSlashCommand === null && previewInput.topSubagent === null;

	if (isBaseModelStage) {
		return (
			<WrappedOnboardingToolsBaseModelStage
				onSequenceComplete={onBaseModelSequenceComplete}
				reduceMotion={reduceMotion}
			/>
		);
	}

	const sequenceFrames = resolveToolsStageSequenceFrames(
		previewInput.topSlashCommand,
		previewInput.topSubagent,
	);
	const [activeCardIndex, setActiveCardIndex] = useState(0);
	const [sequenceIndex, setSequenceIndex] = useState(() =>
		reduceMotion ? sequenceFrames.length - 1 : 0,
	);
	const [scenePhase, setScenePhase] = useState<ToolsStageScenePhase>(() =>
		reduceMotion ? "final" : "sequence",
	);
	const cardStyle: ToolsStackStyle = {
		"--tools-stack-height": `${getToolsStackHeightRem(model.entries.length)}rem`,
	};
	const activeSequenceFrame =
		sequenceFrames[sequenceIndex] ?? sequenceFrames.at(-1);
	const showFinalScene = scenePhase === "final";

	useMountEffect(() => {
		if (reduceMotion) {
			setSequenceIndex(sequenceFrames.length - 1);
			setScenePhase("final");
			return;
		}

		setSequenceIndex(0);
		setScenePhase("sequence");
		let elapsedMs = 0;
		const timeoutIds = sequenceFrames.slice(1).map((_item, itemIndex) => {
			elapsedMs += resolveToolsStageSequenceHoldMs(itemIndex);

			return window.setTimeout(() => {
				setSequenceIndex(itemIndex + 1);
			}, elapsedMs);
		});
		timeoutIds.push(
			window.setTimeout(() => {
				setScenePhase("handoff");
			}, elapsedMs + resolveToolsStageSequenceHoldMs(sequenceFrames.length - 1)),
		);
		timeoutIds.push(
			window.setTimeout(() => {
				setScenePhase("final");
			}, elapsedMs +
				resolveToolsStageSequenceHoldMs(sequenceFrames.length - 1) +
				TOOLS_STAGE_COPY_HANDOFF_MS),
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
				scenePhase !== "final" && "mymind-wrapped-tools-stage--intro-copy",
				showFinalScene && "mymind-wrapped-tools-stage--overlay-copy",
			)}
			objectClassName="mymind-wrapped-tools-stage__object"
			copy={
				showFinalScene ? (
					<motion.div
						animate={{ opacity: 1, scale: 1, y: 0 }}
						initial={
							reduceMotion
								? { opacity: 1, scale: 1, y: 0 }
								: { opacity: 0, scale: 0.99, y: 14 }
						}
						transition={TOOLS_STAGE_COPY_TRANSITION}
					>
						<WrappedOnboardingStageCopy
							title={model.headline}
							titleClassName="mymind-wrapped-tools-stage__headline"
						/>
					</motion.div>
				) : (
					<motion.div
						animate={
							scenePhase === "handoff"
								? { opacity: 0, scale: 0.985, y: -18 }
								: { opacity: 1, scale: 1, y: 0 }
						}
						initial={false}
						transition={TOOLS_STAGE_COPY_TRANSITION}
					>
						<WrappedOnboardingStageCopy
							title={
								<AnimatePresence initial={false} mode="wait">
									<motion.span
										key={activeSequenceFrame?.key ?? "tools-sequence"}
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
							titleClassName={cn(
								"mymind-wrapped-stage-copy__headline--intro",
								"mymind-wrapped-tools-stage__headline",
								"mymind-wrapped-tools-stage__headline--sequence",
							)}
						/>
					</motion.div>
				)
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
												<span className="mymind-wrapped-tools-stage__entry-kind">
													{entry.kindLabel}
												</span>
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

function WrappedOnboardingToolsBaseModelStage(props: {
	onSequenceComplete?: () => void;
	reduceMotion: boolean;
}) {
	const { onSequenceComplete, reduceMotion } = props;
	const [visibleLineCount, setVisibleLineCount] = useState(() =>
		reduceMotion ? TOOLS_BASE_MODEL_LINES.length : 0,
	);
	const [isDocsVisible, setIsDocsVisible] = useState(reduceMotion);

	useMountEffect(() => {
		if (reduceMotion) {
			setVisibleLineCount(TOOLS_BASE_MODEL_LINES.length);
			setIsDocsVisible(true);
			const timeoutId = window.setTimeout(() => {
				onSequenceComplete?.();
			}, TOOLS_BASE_MODEL_REDUCED_ADVANCE_MS);

			return () => {
				window.clearTimeout(timeoutId);
			};
		}

		setVisibleLineCount(0);
		setIsDocsVisible(false);
		const timeoutIds = TOOLS_BASE_MODEL_LINES.map((_line, lineIndex) =>
			window.setTimeout(() => {
				setVisibleLineCount(lineIndex + 1);
			}, lineIndex * TOOLS_BASE_MODEL_LINE_STAGGER_MS),
		);
		const docsTimerId = window.setTimeout(() => {
			setIsDocsVisible(true);
		}, TOOLS_BASE_MODEL_LINES.length * TOOLS_BASE_MODEL_LINE_STAGGER_MS);
		const completeTimerId = window.setTimeout(
			() => {
				onSequenceComplete?.();
			},
			TOOLS_BASE_MODEL_LINES.length * TOOLS_BASE_MODEL_LINE_STAGGER_MS +
				TOOLS_BASE_MODEL_DOCS_REVEAL_MS +
				TOOLS_BASE_MODEL_ADVANCE_HOLD_MS,
		);

		return () => {
			for (const timeoutId of timeoutIds) {
				window.clearTimeout(timeoutId);
			}

			window.clearTimeout(docsTimerId);
			window.clearTimeout(completeTimerId);
		};
	});

	return (
		<WrappedOnboardingStageFrame
			className={cn(
				"mymind-wrapped-tools-stage",
				"mymind-wrapped-tools-stage--text-only",
			)}
			copy={
				<WrappedOnboardingStageCopy
					description={
						<motion.span
							animate={
								isDocsVisible
									? { filter: "blur(0px)", opacity: 1, y: 0 }
									: { filter: "blur(8px)", opacity: 0, y: 10 }
							}
							className="mymind-wrapped-tools-stage__docs"
							initial={false}
							transition={TOOLS_STAGE_SEQUENCE_TRANSITION}
						>
							You should try them out tho:{" "}
							<a
								className="mymind-wrapped-tools-stage__footnote-link"
								href={ANTHROPIC_COMMANDS_DOCS_URL}
								rel="noreferrer"
								target="_blank"
							>
								slash commands
							</a>{" "}
							and{" "}
							<a
								className="mymind-wrapped-tools-stage__footnote-link"
								href={ANTHROPIC_SUBAGENTS_DOCS_URL}
								rel="noreferrer"
								target="_blank"
							>
								subagents
							</a>
							.
						</motion.span>
					}
					descriptionClassName="mymind-wrapped-tools-stage__description-shell"
					title={
						<span className="mymind-wrapped-tools-stage__line-stack">
							{TOOLS_BASE_MODEL_LINES.map((line, lineIndex) => {
								const isLineVisible = lineIndex < visibleLineCount;

								return (
									<motion.span
										key={line}
										animate={
											isLineVisible
												? { filter: "blur(0px)", opacity: 1, y: 0 }
												: { filter: "blur(8px)", opacity: 0, y: 10 }
										}
										className="mymind-wrapped-tools-stage__line"
										initial={false}
										transition={TOOLS_STAGE_SEQUENCE_TRANSITION}
									>
										{line}
									</motion.span>
								);
							})}
						</span>
					}
					titleClassName="mymind-wrapped-tools-stage__headline mymind-wrapped-tools-stage__headline--text-only"
				/>
			}
		/>
	);
}

function resolveToolsStageSequenceFrames(
	topSlashCommand: string | null,
	topSubagent: string | null,
): ToolsStageSequenceFrame[] {
	return [
		{
			key: "intro",
			title: resolveToolsIntroLine(topSlashCommand, topSubagent),
		},
		{
			key: "tools",
			title: resolveToolsTransitionLine(topSlashCommand, topSubagent),
		},
	];
}

function resolveToolsStageSequenceHoldMs(frameIndex: number) {
	return (
		TOOLS_STAGE_SEQUENCE_HOLD_MS[frameIndex] ??
		TOOLS_STAGE_SEQUENCE_HOLD_MS.at(-1) ??
		1_420
	);
}

function resolveToolsIntroLine(
	topSlashCommand: string | null,
	topSubagent: string | null,
) {
	if (topSlashCommand && topSubagent) {
		return "Your workflow grew beyond the base model.";
	}

	if (topSlashCommand) {
		return "Slash commands became part of the routine.";
	}

	if (topSubagent) {
		return "Subagents became part of the routine.";
	}

	return "You mostly stayed close to the base model.";
}

function resolveToolsTransitionLine(
	topSlashCommand: string | null,
	topSubagent: string | null,
) {
	if (topSlashCommand && topSubagent) {
		return "Commands led. Subagents backed them up.";
	}

	if (topSlashCommand) {
		return "One slash command stood out.";
	}

	if (topSubagent) {
		return "One subagent stood out.";
	}

	return "No tool side quests made the recap.";
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
