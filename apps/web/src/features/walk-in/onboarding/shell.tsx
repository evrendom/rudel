import { useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMountEffect } from "@/hooks/useMountEffect";
import { cn } from "@/lib/utils";
import {
	STEP_QUERY_PARAM,
	UPLOAD_STEP,
	WALK_IN_STEPS,
	WALK_IN_STEP_PREVIEW_OPTIONS,
	type PreviewableWalkInStepId,
	type WalkInStepId,
} from "./config";
import {
	getSelectedPreviewState,
	getStepPreviewStateParam,
	getVisibleProgressSteps,
	resolveActiveStepIndex,
	resolveUploadStageModel,
} from "./helpers";
import {
	WalkInOnboardingFooter,
	WalkInOnboardingHeader,
} from "./controls";
import { resolveScalePreviewTokens } from "./models";
import {
	WalkInOnboardingScaleRainBackdrop,
	WalkInOnboardingStage,
} from "./stages";
import { type WalkInOnboardingMetrics } from "./types";

/* ─────────────────────────────────────────────────────────
 * INTRO EXIT STORYBOARD
 *
 * Read top-to-bottom. Each `at` value is ms after Next.
 *
 *    0ms   intro copy starts fading
 *   40ms   lines split outward left/right
 *  320ms   intro step is gone, route advances
 * ───────────────────────────────────────────────────────── */

const INTRO_EXIT = {
	distance: 72,
	duration: 0.24,
	lineDelay: 0.04,
	settleMs: 320,
	ease: [0.22, 1, 0.36, 1] as const,
};

export interface TeamCardWalkInOnboardingProps {
	displayName: string;
	finalFooter?: ReactNode;
	finalStage: ReactNode;
	onboardingMetrics: WalkInOnboardingMetrics;
	totalSessions: number;
}

export {
	WALK_IN_BEAT_CONTRACTS,
	type WalkInBeatContract,
} from "./config";
export type {
	WalkInOnboardingMetrics,
	WalkInRepoPulseEntry,
	WalkInRepoPulseMetrics,
	WalkInSkillUsageItem,
} from "./types";

export function TeamCardWalkInOnboarding(props: TeamCardWalkInOnboardingProps) {
	const {
		displayName,
		finalFooter,
		finalStage,
		onboardingMetrics,
		totalSessions,
	} = props;
	const [searchParams, setSearchParams] = useSearchParams();
	const shouldReduceMotion = useReducedMotion();
	const reduceMotion = shouldReduceMotion ?? false;
	const exitTimerRef = useRef<number | null>(null);
	const [pendingStepIndex, setPendingStepIndex] = useState<number | null>(null);
	const [exitingStepId, setExitingStepId] = useState<WalkInStepId | null>(null);
	const activeStepIndex = resolveActiveStepIndex(
		searchParams.get(STEP_QUERY_PARAM),
		WALK_IN_STEPS,
	);
	const activeStep =
		activeStepIndex === 0
			? UPLOAD_STEP
			: (WALK_IN_STEPS[activeStepIndex - 1] ?? WALK_IN_STEPS[0]);
	const visibleProgressSteps = getVisibleProgressSteps(
		activeStepIndex,
		WALK_IN_STEPS,
	);
	const activePreviewStepId =
		activeStep.kind === "final" ? null : activeStep.id;
	const activePreviewOptions = activePreviewStepId
		? WALK_IN_STEP_PREVIEW_OPTIONS[activePreviewStepId]
		: null;
	const activePreviewState = activePreviewStepId
		? getSelectedPreviewState(
				activePreviewStepId,
				searchParams.get(getStepPreviewStateParam(activePreviewStepId)),
			)
		: "auto";
	const activeUploadModel =
		activeStep.id === "upload"
			? resolveUploadStageModel(activePreviewState)
			: null;
	const isScaleStep = activeStep.id === "scale";
	const scaleRainTotalTokens = isScaleStep
		? resolveScalePreviewTokens(onboardingMetrics.totalTokens, activePreviewState)
		: 0;
	const isStepTransitioning = pendingStepIndex !== null;

	useMountEffect(() => {
		return () => {
			if (exitTimerRef.current !== null) {
				window.clearTimeout(exitTimerRef.current);
			}
		};
	});

	function goToStep(nextStepIndex: number) {
		const boundedStepIndex = Math.max(
			0,
			Math.min(nextStepIndex, WALK_IN_STEPS.length),
		);

		setSearchParams(
			(previousSearchParams) => {
				const nextSearchParams = new URLSearchParams(previousSearchParams);

				if (boundedStepIndex === 0) {
					nextSearchParams.delete(STEP_QUERY_PARAM);
				} else {
					const nextStep = WALK_IN_STEPS[boundedStepIndex - 1];

					if (!nextStep) {
						return previousSearchParams;
					}

					nextSearchParams.set(STEP_QUERY_PARAM, nextStep.id);
				}

				return nextSearchParams;
			},
			{ replace: true },
		);
	}

	function handleStepAdvance() {
		if (activeStep.kind === "final" || isStepTransitioning) {
			return;
		}

		const nextStepIndex = activeStepIndex + 1;

		if (activeStep.id !== "intro" || reduceMotion) {
			goToStep(nextStepIndex);
			return;
		}

		setExitingStepId(activeStep.id);
		setPendingStepIndex(nextStepIndex);

		exitTimerRef.current = window.setTimeout(() => {
			setExitingStepId(null);
			setPendingStepIndex(null);
			goToStep(nextStepIndex);
		}, INTRO_EXIT.settleMs);
	}

	function setPreviewState(stepId: PreviewableWalkInStepId, value: string) {
		setSearchParams(
			(previousSearchParams) => {
				const nextSearchParams = new URLSearchParams(previousSearchParams);
				const previewParam = getStepPreviewStateParam(stepId);

				if (value === "auto") {
					nextSearchParams.delete(previewParam);
				} else {
					nextSearchParams.set(previewParam, value);
				}

				return nextSearchParams;
			},
			{ replace: true },
		);
	}

	return (
		<main
			className={cn(
				"mymind-walk-in-route",
				isScaleStep ? "mymind-walk-in-route--scale-rain" : undefined,
			)}
		>
			{isScaleStep ? (
				<WalkInOnboardingScaleRainBackdrop
					reduceMotion={reduceMotion}
					totalTokens={scaleRainTotalTokens}
				/>
			) : null}
			<div className="mymind-walk-in-shell relative z-[1] mx-auto flex w-full max-w-[68rem] flex-1 flex-col text-foreground">
				<WalkInOnboardingHeader
					activePreviewOptions={activePreviewOptions}
					activePreviewState={activePreviewState}
					activePreviewStepId={activePreviewStepId}
					activeStep={activeStep}
					activeStepIndex={activeStepIndex}
					isStepTransitioning={isStepTransitioning}
					onGoToStep={goToStep}
					onPreviewStateChange={setPreviewState}
					visibleProgressSteps={visibleProgressSteps}
				/>

				<div className="flex flex-1 py-6 md:py-8">
					{activeStep.kind === "final" ? (
						<div className="flex w-full flex-1">{finalStage}</div>
					) : (
						<div className="flex w-full flex-1 flex-col">
							<WalkInOnboardingStage
								displayName={displayName}
								isExiting={activeStep.id === exitingStepId}
								onboardingMetrics={onboardingMetrics}
								previewState={activePreviewState}
								step={activeStep}
								totalSessions={totalSessions}
							/>
						</div>
					)}
				</div>

				<WalkInOnboardingFooter
					activeStep={activeStep}
					activeStepIndex={activeStepIndex}
					activeUploadModel={activeUploadModel}
					finalFooter={finalFooter}
					isStepTransitioning={isStepTransitioning}
					onContinue={handleStepAdvance}
					onGoToStep={goToStep}
				/>
			</div>
		</main>
	);
}
