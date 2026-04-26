import type { WrappedStep } from "./config";
import { formatCompactNumber } from "./format";
import {
	buildIntroContent,
	resolveIntroPreviewInput,
	type WrappedStepContentLine,
} from "./helpers";
import {
	resolveLockInPreviewInput,
	resolveLockInStageModel,
} from "./models/lock-in";
import {
	formatModelStageSourceLabel,
	getModelStageTone,
	resolveModelPreviewInput,
	resolveModelStageModel,
} from "./models/model-mix";
import {
	resolveQualityPreviewInput,
	resolveQualityStageModel,
} from "./models/quality";
import {
	resolveRepoPulsePreviewInput,
	resolveRepoPulseStageModel,
} from "./models/repo-pulse";
import {
	buildScaleContent,
	buildScaleRainBalls,
	resolveScaleEstimatedSpendUsd,
	resolveScalePreviewTokens,
	resolveScaleRainBallCount,
	resolveScaleRainDisplayedTokens,
	resolveScaleStageModel,
	type ScaleRainBall,
} from "./models/scale";
import {
	clampSkillsCardIndex,
	getSkillsCardStyle,
	getSkillsCollapsedCardStyle,
	getSkillsColumnCardStyle,
	getSkillsDealCardStyle,
	getSkillsScrollableCardStyle,
	resolveSkillsPreviewInput,
	resolveSkillsStageModel,
	SKILLS_STACK,
} from "./models/skills";
import {
	getToolsEntryStyle,
	getToolsHeadline,
	getToolsStackHeightRem,
	getToolsSubline,
	resolveToolsPreviewInput,
	resolveToolsStageModel,
} from "./models/tools";
import type { WrappedOnboardingMetrics } from "./types";

export {
	buildScaleRainBalls,
	clampSkillsCardIndex,
	formatCompactNumber,
	formatModelStageSourceLabel,
	getModelStageTone,
	getSkillsCollapsedCardStyle,
	getSkillsCardStyle,
	getSkillsDealCardStyle,
	getSkillsColumnCardStyle,
	getSkillsScrollableCardStyle,
	getToolsEntryStyle,
	getToolsStackHeightRem,
	resolveLockInPreviewInput,
	resolveLockInStageModel,
	resolveModelPreviewInput,
	resolveModelStageModel,
	resolveQualityPreviewInput,
	resolveQualityStageModel,
	resolveRepoPulsePreviewInput,
	resolveRepoPulseStageModel,
	resolveScaleEstimatedSpendUsd,
	resolveScalePreviewTokens,
	resolveScaleRainBallCount,
	resolveScaleRainDisplayedTokens,
	resolveScaleStageModel,
	resolveSkillsPreviewInput,
	resolveSkillsStageModel,
	resolveToolsPreviewInput,
	resolveToolsStageModel,
	SKILLS_STACK,
	type ScaleRainBall,
};

export function buildStepContent(input: {
	displayName: string;
	onboardingMetrics: WrappedOnboardingMetrics;
	previewState: string;
	stepId: WrappedStep["id"];
	totalSessions: number;
}): WrappedStepContentLine[] {
	const {
		displayName,
		onboardingMetrics,
		previewState,
		stepId,
		totalSessions,
	} = input;

	switch (stepId) {
		case "intro":
			return buildIntroContent(
				resolveIntroPreviewInput(
					{
						activeDays: onboardingMetrics.activeDays,
						daysSinceFirst: onboardingMetrics.daysSinceFirst,
						displayName,
						totalSessions,
					},
					previewState,
				),
			);
		case "model": {
			const modelStage = resolveModelStageModel(
				resolveModelPreviewInput(
					{
						modelByMonth: onboardingMetrics.modelByMonth,
						sourceSplit: onboardingMetrics.sourceSplit,
					},
					previewState,
				),
			);
			return [{ text: modelStage.headline }, { text: modelStage.subline }];
		}
		case "scale":
			return buildScaleContent(
				resolveScalePreviewTokens(onboardingMetrics.totalTokens, previewState),
			);
		case "tools": {
			const toolsPreview = resolveToolsPreviewInput(
				{
					slashCommandsAdoptionRate:
						onboardingMetrics.slashCommandsAdoptionRate,
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

			return [
				{
					text: getToolsHeadline({
						topSlashCommand: toolsPreview.topSlashCommand,
						topSubagent: toolsPreview.topSubagent,
					}),
				},
				{
					text: getToolsSubline({
						slashCommandsAdoptionRate: toolsPreview.slashCommandsAdoptionRate,
						subagentsAdoptionRate: toolsPreview.subagentsAdoptionRate,
					}),
				},
			];
		}
		case "lock-in": {
			const lockInStage = resolveLockInStageModel(
				resolveLockInPreviewInput(
					{
						avgSessionMin: onboardingMetrics.avgSessionMin,
						longestSessionMin: onboardingMetrics.longestSessionMin,
					},
					previewState,
				),
			);

			return [{ text: lockInStage.headline }, { text: lockInStage.subline }];
		}
		default:
			return [{ text: "" }];
	}
}
