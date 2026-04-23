import type { CSSProperties } from "react";
import { useState } from "react";
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

export function WrappedOnboardingToolsStage(props: ToolsStageProps) {
	const { onboardingMetrics, previewState } = props;
	const model = resolveToolsStageModel(
		resolveToolsPreviewInput(
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
		),
	);
	const [activeCardIndex, setActiveCardIndex] = useState(0);
	const cardStyle: ToolsStackStyle = {
		"--tools-stack-height": `${getToolsStackHeightRem(model.entries.length)}rem`,
	};

	return (
		<WrappedOnboardingStageFrame
			className="mymind-wrapped-tools-stage"
			objectClassName="mymind-wrapped-tools-stage__object"
			copy={
				<WrappedOnboardingStageCopy
					eyebrow="Workflow tools"
					title={model.headline}
					description={model.subline}
				/>
			}
			object={
				<article className="mymind-wrapped-tools-stage__card" style={cardStyle}>
					<ul className="mymind-wrapped-tools-stage__list">
						{model.entries.map((entry, entryIndex) => {
							const meterStyle: ToolsMeterStyle = {
								"--tools-stage-meter-value": `${entry.usageRate ?? 0}%`,
							};

							return (
								<li key={entry.id}>
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
								</li>
							);
						})}
					</ul>
				</article>
			}
			support={
				<p className="mymind-wrapped-tools-stage__footnote">{model.footnote}</p>
			}
		/>
	);
}
