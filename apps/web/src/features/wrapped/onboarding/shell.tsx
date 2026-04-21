import { useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMountEffect } from "@/hooks/useMountEffect";
import { cn } from "@/lib/utils";
import {
	type PreviewableWrappedStepId,
	STEP_QUERY_PARAM,
	UPLOAD_STEP,
	WRAPPED_SATURDAY_STEPS,
	WRAPPED_STEP_PREVIEW_OPTIONS,
	type WrappedStepId,
} from "./config";
import { WrappedOnboardingFooter, WrappedOnboardingHeader } from "./controls";
import {
	getSelectedPreviewState,
	getStepPreviewStateParam,
	getVisibleProgressSteps,
	resolveActiveStepIndex,
	resolveUploadStageModel,
} from "./helpers";
import { resolveScalePreviewTokens } from "./models";
import {
	WrappedOnboardingScaleRainBackdrop,
	WrappedOnboardingStage,
} from "./stages";
import type { WrappedOnboardingMetrics } from "./types";

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

export interface WrappedTeamCardOnboardingProps {
	displayName: string;
	finalFooter?: ReactNode;
	finalStage: ReactNode;
	onboardingMetrics: WrappedOnboardingMetrics;
	totalSessions: number;
}

export {
	WRAPPED_BEAT_CONTRACTS,
	type WrappedBeatContract,
} from "./config";
export type {
	WrappedOnboardingMetrics,
	WrappedRepoPulseEntry,
	WrappedRepoPulseMetrics,
	WrappedSkillUsageItem,
} from "./types";

export function WrappedTeamCardOnboarding(
	props: WrappedTeamCardOnboardingProps,
) {
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
	const [exitingStepId, setExitingStepId] = useState<WrappedStepId | null>(
		null,
	);
	// Saturday launch intentionally runs a smaller story deck than the full
	// preview surface. The visibility decision lives in config.ts so product,
	// design, and engineering all point to the same ship list.
	const activeStepIndex = resolveActiveStepIndex(
		searchParams.get(STEP_QUERY_PARAM),
		WRAPPED_SATURDAY_STEPS,
	);
	const activeStep =
		activeStepIndex === 0
			? UPLOAD_STEP
			: (WRAPPED_SATURDAY_STEPS[activeStepIndex - 1] ??
				WRAPPED_SATURDAY_STEPS[0]);
	const visibleProgressSteps = getVisibleProgressSteps(
		activeStepIndex,
		WRAPPED_SATURDAY_STEPS,
	);
	const activePreviewStepId =
		activeStep.kind === "final" ? null : activeStep.id;
	const activePreviewOptions = activePreviewStepId
		? WRAPPED_STEP_PREVIEW_OPTIONS[activePreviewStepId]
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
		? resolveScalePreviewTokens(
				onboardingMetrics.totalTokens,
				activePreviewState,
			)
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
			Math.min(nextStepIndex, WRAPPED_SATURDAY_STEPS.length),
		);

		setSearchParams(
			(previousSearchParams) => {
				const nextSearchParams = new URLSearchParams(previousSearchParams);

				if (boundedStepIndex === 0) {
					nextSearchParams.delete(STEP_QUERY_PARAM);
				} else {
					const nextStep = WRAPPED_SATURDAY_STEPS[boundedStepIndex - 1];

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

	function setPreviewState(stepId: PreviewableWrappedStepId, value: string) {
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
				"mymind-wrapped-route",
				isScaleStep ? "mymind-wrapped-route--scale-rain" : undefined,
			)}
		>
			{isScaleStep ? (
				<WrappedOnboardingScaleRainBackdrop
					reduceMotion={reduceMotion}
					totalTokens={scaleRainTotalTokens}
				/>
			) : null}
			<div className="mymind-wrapped-shell relative z-[1] mx-auto flex w-full max-w-[68rem] flex-1 flex-col text-foreground">
				<WrappedOnboardingHeader
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
							<WrappedOnboardingStage
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

				<WrappedOnboardingFooter
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
