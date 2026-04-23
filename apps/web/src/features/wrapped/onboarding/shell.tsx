import {
	AnimatePresence,
	LayoutGroup,
	MotionConfig,
	motion,
	useReducedMotion,
} from "motion/react";
import type { ReactNode } from "react";
import { startTransition, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMountEffect } from "@/hooks/useMountEffect";
import { cn } from "@/lib/utils";
import {
	type PreviewableWrappedStepId,
	STEP_QUERY_PARAM,
	WRAPPED_SATURDAY_STEPS,
	WRAPPED_STEP_PREVIEW_OPTIONS,
	type WrappedStepId,
} from "./config";
import { WrappedOnboardingFooter, WrappedOnboardingHeader } from "./controls";
import {
	getSelectedPreviewState,
	getStepPreviewStateParam,
	resolveActiveStepIndex,
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

const STAGE_TRANSITION = {
	duration: 0.24,
	ease: [0.22, 1, 0.36, 1] as const,
};

export interface WrappedTeamCardOnboardingProps {
	displayName: string;
	footerDebugControls?: ReactNode;
	finalFooter?: ReactNode;
	finalStage: ReactNode;
	onboardingMetrics: WrappedOnboardingMetrics;
	onBackFromFirstStep?: () => void;
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
		footerDebugControls,
		finalFooter,
		finalStage,
		onboardingMetrics,
		onBackFromFirstStep,
		totalSessions,
	} = props;
	const navigate = useNavigate();
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
	const [navigationDirection, setNavigationDirection] = useState<-1 | 0 | 1>(0);
	const activeStepIndex = resolveActiveStepIndex(
		searchParams.get(STEP_QUERY_PARAM),
		WRAPPED_SATURDAY_STEPS,
	);
	const activeStep =
		WRAPPED_SATURDAY_STEPS[activeStepIndex] ?? WRAPPED_SATURDAY_STEPS[0];
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
	const isScaleStep = activeStep.id === "scale";
	const scaleRainTotalTokens = isScaleStep
		? resolveScalePreviewTokens(
				onboardingMetrics.totalTokens,
				activePreviewState,
			)
		: 0;
	const isStepTransitioning = pendingStepIndex !== null;
	const showPreviewControls = import.meta.env.DEV;

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
			Math.min(nextStepIndex, WRAPPED_SATURDAY_STEPS.length - 1),
		);

		if (boundedStepIndex !== activeStepIndex) {
			setNavigationDirection(boundedStepIndex > activeStepIndex ? 1 : -1);
		}

		startTransition(() => {
			setSearchParams(
				(previousSearchParams) => {
					const nextSearchParams = new URLSearchParams(previousSearchParams);

					if (boundedStepIndex === 0) {
						nextSearchParams.delete(STEP_QUERY_PARAM);
					} else {
						const nextStep = WRAPPED_SATURDAY_STEPS[boundedStepIndex];

						if (!nextStep) {
							return previousSearchParams;
						}

						nextSearchParams.set(STEP_QUERY_PARAM, nextStep.id);
					}

					return nextSearchParams;
				},
				{ replace: true },
			);
		});
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

		setNavigationDirection(1);
		setExitingStepId(activeStep.id);
		setPendingStepIndex(nextStepIndex);

		exitTimerRef.current = window.setTimeout(() => {
			setExitingStepId(null);
			setPendingStepIndex(null);
			goToStep(nextStepIndex);
		}, INTRO_EXIT.settleMs);
	}

	function setPreviewState(stepId: PreviewableWrappedStepId, value: string) {
		startTransition(() => {
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
		});
	}

	function handleTopChromeBack() {
		if (activeStepIndex === 0 && onBackFromFirstStep) {
			onBackFromFirstStep();
			return;
		}

		const historyIndex =
			typeof window.history.state?.idx === "number"
				? window.history.state.idx
				: 0;

		if (historyIndex > 0) {
			navigate(-1);
		}
	}

	return (
		<MotionConfig reducedMotion="user">
			<LayoutGroup id="wrapped-onboarding-shell">
				<main
					className={cn(
						"mymind-wrapped-route",
						"mymind-wrapped-route--onboarding",
						isScaleStep ? "mymind-wrapped-route--scale-rain" : undefined,
					)}
				>
					{isScaleStep ? (
						<WrappedOnboardingScaleRainBackdrop
							reduceMotion={reduceMotion}
							totalTokens={scaleRainTotalTokens}
						/>
					) : null}
					<motion.div
						layout
						className="mymind-wrapped-shell mymind-wrapped-shell--reference-top-chrome relative z-[1] mx-auto flex w-full flex-1 flex-col text-foreground"
					>
						<motion.div layout className="mymind-wrapped-shell__frame">
							<WrappedOnboardingHeader
								activeStep={activeStep}
								activeStepIndex={activeStepIndex}
								isStepTransitioning={isStepTransitioning}
								onBack={handleTopChromeBack}
								onGoToStep={goToStep}
							/>

							<div className="mymind-wrapped-stage-area">
								<AnimatePresence
									custom={navigationDirection}
									initial={false}
									mode="wait"
								>
									<motion.div
										key={activeStep.id}
										layout
										animate={{ opacity: 1, x: 0 }}
										className="mymind-wrapped-stage-slot"
										custom={navigationDirection}
										exit={{
											opacity: 0,
											x: reduceMotion
												? 0
												: resolveWrappedStageExitOffset(navigationDirection),
										}}
										initial={{
											opacity: 0,
											x: reduceMotion
												? 0
												: resolveWrappedStageEnterOffset(navigationDirection),
										}}
										transition={STAGE_TRANSITION}
									>
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
									</motion.div>
								</AnimatePresence>
							</div>

							<WrappedOnboardingFooter
								activeStep={activeStep}
								activePreviewOptions={activePreviewOptions}
								activePreviewState={activePreviewState}
								activePreviewStepId={activePreviewStepId}
								finalFooter={finalFooter}
								generalDebugControls={footerDebugControls}
								isDebugControlsVisible={showPreviewControls}
								isStepTransitioning={isStepTransitioning}
								onContinue={handleStepAdvance}
								onPreviewStateChange={setPreviewState}
							/>
						</motion.div>
					</motion.div>
				</main>
			</LayoutGroup>
		</MotionConfig>
	);
}

function resolveWrappedStageEnterOffset(direction: -1 | 0 | 1) {
	if (direction === -1) {
		return -32;
	}

	return 32;
}

function resolveWrappedStageExitOffset(direction: -1 | 0 | 1) {
	if (direction === -1) {
		return 24;
	}

	return -24;
}
