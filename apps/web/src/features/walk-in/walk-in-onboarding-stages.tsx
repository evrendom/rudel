import { cn } from "@/lib/utils";
import type { WalkInStep } from "./walk-in-onboarding-config";
import {
	type WalkInStepContentLine,
} from "./walk-in-onboarding-helpers";
import {
	buildScaleRainBalls,
	buildStepContent,
	getScaleRainBallCoreStyle,
	getScaleRainBallStyle,
} from "./walk-in-onboarding-models";
import { WalkInOnboardingIntroStage } from "./walk-in-onboarding-stage-intro";
import {
	WalkInOnboardingLockInStage,
	WalkInOnboardingQualityStage,
	WalkInOnboardingRepoPulseStage,
	WalkInOnboardingScaleStage,
} from "./walk-in-onboarding-stage-metrics";
import { WalkInOnboardingModelStage } from "./walk-in-onboarding-stage-model";
import { WalkInOnboardingSkillsStage } from "./walk-in-onboarding-stage-skills";
import { WalkInOnboardingToolsStage } from "./walk-in-onboarding-stage-tools";
import { WalkInOnboardingUploadStage } from "./walk-in-onboarding-stage-upload";
import type { WalkInOnboardingMetrics } from "./walk-in-onboarding-types";

interface WalkInOnboardingStageProps {
	displayName: string;
	isExiting: boolean;
	onboardingMetrics: WalkInOnboardingMetrics;
	previewState: string;
	step: WalkInStep;
	totalSessions: number;
}

interface WalkInOnboardingScaleRainBackdropProps {
	reduceMotion: boolean;
	totalTokens: number;
}

export function WalkInOnboardingStage(props: WalkInOnboardingStageProps) {
	const {
		displayName,
		isExiting,
		onboardingMetrics,
		previewState,
		step,
		totalSessions,
	} = props;

	if (step.id === "upload") {
		return <WalkInOnboardingUploadStage previewState={previewState} />;
	}

	if (step.id === "intro") {
		return (
			<WalkInOnboardingIntroStage
				displayName={displayName}
				isExiting={isExiting}
				isSparse={totalSessions < 10}
				onboardingMetrics={onboardingMetrics}
				previewState={previewState}
				totalSessions={totalSessions}
			/>
		);
	}

	if (step.id === "skills") {
		return (
			<WalkInOnboardingSkillsStage
				key={`skills:${previewState}:${onboardingMetrics.topSkills.length}:${onboardingMetrics.skillsAdoptionRate ?? -1}`}
				onboardingMetrics={onboardingMetrics}
				previewState={previewState}
			/>
		);
	}

	if (step.id === "tools") {
		return (
			<WalkInOnboardingToolsStage
				key={`tools:${previewState}:${onboardingMetrics.topSlashCommands.length}:${onboardingMetrics.topSubagents.length}:${onboardingMetrics.topSlashCommandCount ?? -1}:${onboardingMetrics.topSubagentCount ?? -1}:${onboardingMetrics.totalSessions}`}
				onboardingMetrics={onboardingMetrics}
				previewState={previewState}
			/>
		);
	}

	if (step.id === "model") {
		return (
			<WalkInOnboardingModelStage
				onboardingMetrics={onboardingMetrics}
				previewState={previewState}
			/>
		);
	}

	if (step.id === "pulse") {
		return (
			<WalkInOnboardingRepoPulseStage
				onboardingMetrics={onboardingMetrics}
				previewState={previewState}
			/>
		);
	}

	if (step.id === "scale") {
		return (
			<WalkInOnboardingScaleStage
				onboardingMetrics={onboardingMetrics}
				previewState={previewState}
			/>
		);
	}

	if (step.id === "lock-in") {
		return (
			<WalkInOnboardingLockInStage
				onboardingMetrics={onboardingMetrics}
				previewState={previewState}
			/>
		);
	}

	if (step.id === "quality") {
		return (
			<WalkInOnboardingQualityStage
				onboardingMetrics={onboardingMetrics}
				previewState={previewState}
			/>
		);
	}

	const content: WalkInStepContentLine[] = buildStepContent({
		displayName,
		onboardingMetrics,
		previewState,
		stepId: step.id,
		totalSessions,
	});

	return (
		<section className="mymind-walk-in-copy-stage">
			<div className="mymind-walk-in-copy-stage__content">
				{content.map((line) => (
					<p
						key={`${line.tone ?? "default"}:${line.text}`}
						className={cn(
							"mymind-walk-in-copy-stage__line",
							line.tone === "danger"
								? "text-red-700 dark:text-red-400"
								: undefined,
						)}
					>
						{line.text}
					</p>
				))}
			</div>
		</section>
	);
}

export function WalkInOnboardingScaleRainBackdrop(
	props: WalkInOnboardingScaleRainBackdropProps,
) {
	const { reduceMotion, totalTokens } = props;
	const balls = buildScaleRainBalls(totalTokens);

	return (
		<div
			aria-hidden="true"
			className={cn(
				"mymind-walk-in-scale-rain",
				reduceMotion ? "is-reduced-motion" : undefined,
			)}
		>
			<div className="mymind-walk-in-scale-rain__ambient">
				<div className="mymind-walk-in-scale-rain__glow is-peach" />
				<div className="mymind-walk-in-scale-rain__glow is-blue" />
			</div>
			{balls.map((ball) => (
				<span
					key={ball.id}
					className="mymind-walk-in-scale-rain__ball"
					style={getScaleRainBallStyle(ball)}
				>
					<span
						className="mymind-walk-in-scale-rain__ball-core"
						style={getScaleRainBallCoreStyle(ball)}
					/>
				</span>
			))}
		</div>
	);
}
