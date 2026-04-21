import type { CSSProperties } from "react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import {
	getToolsEntryStyle,
	getToolsStackHeightRem,
	resolveToolsPreviewInput,
	resolveToolsStageModel,
} from "../models";
import type { WalkInOnboardingMetrics } from "../types";

interface ToolsStageProps {
	onboardingMetrics: WalkInOnboardingMetrics;
	previewState: string;
}

interface ToolsStackStyle extends CSSProperties {
	"--tools-stack-height": string;
}

interface ToolsMeterStyle extends CSSProperties {
	"--tools-stage-meter-value": string;
}

export function WalkInOnboardingToolsStage(props: ToolsStageProps) {
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
		<section className="mymind-walk-in-tools-stage">
			<div className="mymind-walk-in-tools-stage__hero">
				<p className="mymind-walk-in-tools-stage__eyebrow">Workflow tools</p>
				<h2 className="mymind-walk-in-tools-stage__headline">
					{model.headline}
				</h2>
				<p className="mymind-walk-in-tools-stage__subline">{model.subline}</p>
			</div>

			<div className="mymind-walk-in-tools-stage__object">
				<article className="mymind-walk-in-tools-stage__card" style={cardStyle}>
					<div className="mymind-walk-in-tools-stage__list">
						{model.entries.map((entry, entryIndex) => {
							const meterStyle: ToolsMeterStyle = {
								"--tools-stage-meter-value": `${entry.usageRate ?? 0}%`,
							};

							return (
								<button
									key={entry.id}
									aria-label={`${entry.name}. ${entry.usageLabel}`}
									aria-pressed={entryIndex === activeCardIndex}
									className={cn(
										"mymind-walk-in-tools-stage__entry",
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
									<div className="mymind-walk-in-tools-stage__entry-top">
										<p className="mymind-walk-in-tools-stage__entry-usage">
											{entry.usageLabel}
										</p>
									</div>
									<p className="mymind-walk-in-tools-stage__entry-name">
										{entry.name}
									</p>
									<div
										aria-hidden="true"
										className="mymind-walk-in-tools-stage__meter"
									>
										<span
											className="mymind-walk-in-tools-stage__meter-fill"
											style={meterStyle}
										/>
									</div>
								</button>
							);
						})}
					</div>
				</article>
			</div>

			<p className="mymind-walk-in-tools-stage__footnote">{model.footnote}</p>
		</section>
	);
}
