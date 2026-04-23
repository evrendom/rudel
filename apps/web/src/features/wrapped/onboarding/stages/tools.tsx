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
	previewState: string;
}

interface ToolsStackStyle extends CSSProperties {
	"--tools-stack-height": string;
}

interface ToolsMeterStyle extends CSSProperties {
	"--tools-stage-meter-value": string;
}

type ToolsStageSequenceFrame = {
	description?: string;
	key: string;
	title: string;
};

const TOOLS_STAGE_SEQUENCE_TRANSITION = {
	duration: 0.26,
	ease: [0.22, 1, 0.36, 1] as const,
};

const TOOLS_STAGE_SEQUENCE_HOLD_MS = 920;

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
		previewInput.topSlashCommand,
		previewInput.topSubagent,
		model.headline,
		model.subline,
	);
	const [activeCardIndex, setActiveCardIndex] = useState(0);
	const [sequenceIndex, setSequenceIndex] = useState(() =>
		reduceMotion ? sequenceFrames.length - 1 : 0,
	);
	const cardStyle: ToolsStackStyle = {
		"--tools-stack-height": `${getToolsStackHeightRem(model.entries.length)}rem`,
	};
	const activeSequenceFrame =
		sequenceFrames[sequenceIndex] ?? sequenceFrames.at(-1);
	const areCardsVisible =
		reduceMotion ||
		activeSequenceFrame?.key === "final" ||
		sequenceFrames.length === 1;

	useMountEffect(() => {
		if (reduceMotion || sequenceFrames.length <= 1) {
			setSequenceIndex(sequenceFrames.length - 1);
			return;
		}

		setSequenceIndex(0);
		const timeoutIds = sequenceFrames.slice(0, -1).map((_item, itemIndex) =>
			window.setTimeout(
				() => {
					setSequenceIndex(itemIndex + 1);
				},
				TOOLS_STAGE_SEQUENCE_HOLD_MS * (itemIndex + 1),
			),
		);

		return () => {
			for (const timeoutId of timeoutIds) {
				window.clearTimeout(timeoutId);
			}
		};
	});

	return (
		<WrappedOnboardingStageFrame
			className="mymind-wrapped-tools-stage"
			objectClassName="mymind-wrapped-tools-stage__object"
			copy={
				<WrappedOnboardingStageCopy
					title={
						<AnimatePresence initial={false} mode="wait">
							<motion.span
								key={activeSequenceFrame?.key ?? "tools-final"}
								animate={{ opacity: 1, scale: 1, y: 0 }}
								className="mymind-wrapped-tools-stage__title-shell"
								exit={{ opacity: 0, scale: 0.985, y: -18 }}
								initial={{ opacity: 0, scale: 0.985, y: 18 }}
								transition={TOOLS_STAGE_SEQUENCE_TRANSITION}
							>
								{activeSequenceFrame?.title ?? model.headline}
							</motion.span>
						</AnimatePresence>
					}
					description={
						<AnimatePresence initial={false} mode="wait">
							{activeSequenceFrame?.description ? (
								<motion.span
									key={`description:${activeSequenceFrame.key}`}
									animate={{ opacity: 1, y: 0 }}
									className="mymind-wrapped-tools-stage__description-shell"
									exit={{ opacity: 0, y: -10 }}
									initial={{ opacity: 0, y: 10 }}
									transition={TOOLS_STAGE_SEQUENCE_TRANSITION}
								>
									{activeSequenceFrame.description}
								</motion.span>
							) : null}
						</AnimatePresence>
					}
				/>
			}
			object={
				<motion.article
					animate={
						areCardsVisible
							? { opacity: 1, y: 0 }
							: { opacity: reduceMotion ? 1 : 0, y: reduceMotion ? 0 : 10 }
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

							return (
								<motion.li
									key={entry.id}
									animate={
										areCardsVisible
											? {
													filter: "blur(0px)",
													opacity: 1,
													scale: 1,
													y: 0,
												}
											: {
													filter: reduceMotion ? "blur(0px)" : "blur(6px)",
													opacity: reduceMotion ? 1 : 0,
													scale: reduceMotion ? 1 : 0.94,
													y: reduceMotion ? 0 : 20 + entryIndex * 5,
												}
									}
									className="mymind-wrapped-tools-stage__entry-shell"
									initial={false}
									transition={
										reduceMotion
											? {
													duration: 0.08,
													ease: TOOLS_STAGE_SEQUENCE_TRANSITION.ease,
												}
											: {
													bounce: 0.24,
													delay: 0.05 + entryIndex * 0.055,
													duration: 0.56,
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
										style={getToolsEntryStyle(
											entryIndex,
											model.entries.length,
											activeCardIndex,
										)}
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
			}
			support={
				<p className="mymind-wrapped-tools-stage__footnote">{model.footnote}</p>
			}
		/>
	);
}

function resolveToolsStageSequenceFrames(
	topSlashCommand: string | null,
	topSubagent: string | null,
	finalTitle: string,
	finalDescription: string,
): ToolsStageSequenceFrame[] {
	if (topSlashCommand && topSubagent) {
		return [
			{
				key: "direct",
				title: "One thing you reached for directly.",
			},
			{
				key: "delegated",
				title: "One thing you handed work off to.",
			},
			{
				description: finalDescription,
				key: "final",
				title: finalTitle,
			},
		];
	}

	if (topSlashCommand) {
		return [
			{
				key: "direct",
				title: "One command pattern kept showing up.",
			},
			{
				description: finalDescription,
				key: "final",
				title: finalTitle,
			},
		];
	}

	if (topSubagent) {
		return [
			{
				key: "delegated",
				title: "One helper kept taking the extra work.",
			},
			{
				description: finalDescription,
				key: "final",
				title: finalTitle,
			},
		];
	}

	return [
		{
			description: finalDescription,
			key: "final",
			title: finalTitle,
		},
	];
}
