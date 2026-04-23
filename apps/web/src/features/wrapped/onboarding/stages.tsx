import { cn } from "@/lib/utils";
import type { WrappedStep } from "./config";
import type { WrappedStepContentLine } from "./helpers";
import {
	buildScaleRainBalls,
	buildStepContent,
	getScaleRainBallCoreStyle,
	getScaleRainBallStyle,
} from "./models";
import { WrappedOnboardingIntroStage } from "./stages/intro";
import {
	WrappedOnboardingLockInStage,
	WrappedOnboardingQualityStage,
	WrappedOnboardingRepoPulseStage,
	WrappedOnboardingScaleStage,
} from "./stages/metrics";
import { WrappedOnboardingModelStage } from "./stages/model";
import { WrappedOnboardingSkillsStage } from "./stages/skills";
import { WrappedOnboardingToolsStage } from "./stages/tools";
import { WrappedOnboardingUploadStage } from "./stages/upload";
import { WrappedStageCopy, WrappedStageFrame } from "../stage-frame";
import type { WrappedOnboardingMetrics } from "./types";

interface WrappedOnboardingStageProps {
	displayName: string;
	isExiting: boolean;
	onboardingMetrics: WrappedOnboardingMetrics;
	previewState: string;
	step: WrappedStep;
	totalSessions: number;
}

interface WrappedOnboardingScaleRainBackdropProps {
	reduceMotion: boolean;
	totalTokens: number;
}

export function WrappedOnboardingStage(props: WrappedOnboardingStageProps) {
	const {
		displayName,
		isExiting,
		onboardingMetrics,
		previewState,
		step,
		totalSessions,
	} = props;

	if (step.id === "upload") {
		return <WrappedOnboardingUploadStage previewState={previewState} />;
	}

	if (step.id === "intro") {
		return (
			<WrappedOnboardingIntroStage
				displayName={displayName}
				isExiting={isExiting}
			/>
		);
	}

	if (step.id === "skills") {
		return (
			<WrappedOnboardingSkillsStage
				key={`skills:${previewState}:${onboardingMetrics.topSkills.length}:${onboardingMetrics.skillsAdoptionRate ?? -1}`}
				onboardingMetrics={onboardingMetrics}
				previewState={previewState}
			/>
		);
	}

	if (step.id === "tools") {
		return (
			<WrappedOnboardingToolsStage
				key={`tools:${previewState}:${onboardingMetrics.topSlashCommands.length}:${onboardingMetrics.topSubagents.length}:${onboardingMetrics.topSlashCommandCount ?? -1}:${onboardingMetrics.topSubagentCount ?? -1}:${onboardingMetrics.totalSessions}`}
				onboardingMetrics={onboardingMetrics}
				previewState={previewState}
			/>
		);
	}

	if (step.id === "model") {
		return (
			<WrappedOnboardingModelStage
				onboardingMetrics={onboardingMetrics}
				previewState={previewState}
			/>
		);
	}

	if (step.id === "pulse") {
		return (
			<WrappedOnboardingRepoPulseStage
				onboardingMetrics={onboardingMetrics}
				previewState={previewState}
			/>
		);
	}

	if (step.id === "scale") {
		return (
			<WrappedOnboardingScaleStage
				onboardingMetrics={onboardingMetrics}
				previewState={previewState}
			/>
		);
	}

	if (step.id === "lock-in") {
		return (
			<WrappedOnboardingLockInStage
				onboardingMetrics={onboardingMetrics}
				previewState={previewState}
			/>
		);
	}

	if (step.id === "quality") {
		return (
			<WrappedOnboardingQualityStage
				onboardingMetrics={onboardingMetrics}
				previewState={previewState}
			/>
		);
	}

	const content: WrappedStepContentLine[] = buildStepContent({
		displayName,
		onboardingMetrics,
		previewState,
		stepId: step.id,
		totalSessions,
	});
	const [headlineLine, ...detailLines] = content;

	return (
		<WrappedStageFrame
			className="mymind-wrapped-onboarding-stage"
			copyClassName="mymind-wrapped-onboarding-stage__copy"
			objectClassName="mymind-wrapped-onboarding-stage__object"
			copy={
				headlineLine ? (
					<WrappedStageCopy
						title={headlineLine.text}
						titleClassName={cn(
							headlineLine.tone === "danger"
								? "text-red-700 dark:text-red-400"
								: undefined,
						)}
					/>
				) : null
			}
			object={
				detailLines.length > 0 ? (
					<div className="mymind-wrapped-copy-stage__content">
						{detailLines.map((line) => (
							<p
								key={`${line.tone ?? "default"}:${line.text}`}
								className={cn(
									"mymind-wrapped-copy-stage__line",
									line.tone === "danger"
										? "text-red-700 dark:text-red-400"
										: undefined,
								)}
							>
								{line.text}
							</p>
						))}
					</div>
				) : null
			}
		/>
	);
}

export function WrappedOnboardingScaleRainBackdrop(
	props: WrappedOnboardingScaleRainBackdropProps,
) {
	const { reduceMotion, totalTokens } = props;
	const balls = buildScaleRainBalls(totalTokens);

	return (
		<div
			aria-hidden="true"
			className={cn(
				"mymind-wrapped-scale-rain",
				reduceMotion ? "is-reduced-motion" : undefined,
			)}
		>
			<div className="mymind-wrapped-scale-rain__ambient">
				<div className="mymind-wrapped-scale-rain__glow is-peach" />
				<div className="mymind-wrapped-scale-rain__glow is-blue" />
			</div>
			{balls.map((ball) => (
				<span
					key={ball.id}
					className="mymind-wrapped-scale-rain__ball"
					style={getScaleRainBallStyle(ball)}
				>
					<span
						className="mymind-wrapped-scale-rain__ball-core"
						style={getScaleRainBallCoreStyle(ball)}
					/>
				</span>
			))}
		</div>
	);
}
