import type { WalkInStep } from "./walk-in-onboarding-config";
import {
	buildIntroContent,
	resolveIntroPreviewInput,
	type WalkInStepContentLine,
} from "./walk-in-onboarding-helpers";
import {
	formatModelStageSourceLabel,
	getModelStageTone,
	resolveModelPreviewInput,
	resolveModelStageModel,
} from "./walk-in-onboarding-model-mix";
import { formatCompactNumber } from "./walk-in-onboarding-format";
import {
	resolveLockInPreviewInput,
	resolveLockInStageModel,
} from "./walk-in-onboarding-lock-in";
import {
	resolveQualityPreviewInput,
	resolveQualityStageModel,
} from "./walk-in-onboarding-quality";
import {
	resolveRepoPulsePreviewInput,
	resolveRepoPulseStageModel,
} from "./walk-in-onboarding-repo-pulse";
import {
	buildScaleContent,
	buildScaleRainBalls,
	getScaleRainBallCoreStyle,
	getScaleRainBallStyle,
	resolveScalePreviewTokens,
	resolveScaleStageModel,
	SCALE_STAGE_MIN_BALL_COUNT,
	SCALE_STAGE_TOKENS_PER_BALL,
} from "./walk-in-onboarding-scale";
import {
	clampSkillsCardIndex,
	getSkillsCardStyle,
	resolveSkillsPreviewInput,
	resolveSkillsStageModel,
	SKILLS_STACK,
} from "./walk-in-onboarding-skills";
import {
	getToolsEntryStyle,
	getToolsHeadline,
	getToolsStackHeightRem,
	getToolsSubline,
	resolveToolsPreviewInput,
	resolveToolsStageModel,
} from "./walk-in-onboarding-tools";
import type { WalkInOnboardingMetrics } from "./walk-in-onboarding-types";

export {
	buildScaleRainBalls,
	clampSkillsCardIndex,
	formatCompactNumber,
	formatModelStageSourceLabel,
	getModelStageTone,
	getScaleRainBallCoreStyle,
	getScaleRainBallStyle,
	getSkillsCardStyle,
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
	resolveScalePreviewTokens,
	resolveScaleStageModel,
	resolveSkillsPreviewInput,
	resolveSkillsStageModel,
	resolveToolsPreviewInput,
	resolveToolsStageModel,
	SCALE_STAGE_MIN_BALL_COUNT,
	SCALE_STAGE_TOKENS_PER_BALL,
	SKILLS_STACK,
};

export function buildStepContent(input: {
	displayName: string;
	onboardingMetrics: WalkInOnboardingMetrics;
	previewState: string;
	stepId: WalkInStep["id"];
	totalSessions: number;
}): WalkInStepContentLine[] {
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
