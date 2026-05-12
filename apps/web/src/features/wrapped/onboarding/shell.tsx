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
import { useMountEffect } from "@/app/hooks/useMountEffect";
import { cn } from "@/lib/utils";
import {
	type PreviewableWrappedStepId,
	STEP_QUERY_PARAM,
	WRAPPED_SATURDAY_STEPS,
	WRAPPED_STEP_PREVIEW_OPTIONS,
	type WrappedStepId,
} from "./config";
import {
	WrappedOnboardingDebugControls,
	WrappedOnboardingFooter,
	WrappedOnboardingHeader,
} from "./controls";
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
import { SCALE_STAGE_KEBAB_REVEAL_MS } from "./stages/metrics";
import type {
	WrappedOnboardingMetrics,
	WrappedScaleAdvanceState,
} from "./types";

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

const REDUCED_STAGE_TRANSITION = {
	duration: 0.14,
	ease: "linear" as const,
};

const SCALE_ADVANCE_SEQUENCE = {
	kebabRevealMs: SCALE_STAGE_KEBAB_REVEAL_MS,
};

type WrappedStagePresenceContext = {
	direction: -1 | 0 | 1;
	reduceMotion: boolean;
};

export interface WrappedTeamCardOnboardingProps {
	displayName: string;
	footerDebugControls?: ReactNode;
	finalFooter?: ReactNode;
	finalStage: ReactNode;
	onboardingMetrics: WrappedOnboardingMetrics;
	onBackFromFirstStep?: () => void;
	rewardCardBackground?: string;
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
		rewardCardBackground,
		totalSessions,
	} = props;
	const navigate = useNavigate();
	const [searchParams, setSearchParams] = useSearchParams();
	const shouldReduceMotion = useReducedMotion();
	const reduceMotion = shouldReduceMotion ?? false;
	const exitTimerRef = useRef<number | null>(null);
	const scaleAdvanceTimerRefs = useRef<number[]>([]);
	const [pendingStepIndex, setPendingStepIndex] = useState<number | null>(null);
	const [scaleAdvanceState, setScaleAdvanceState] =
		useState<WrappedScaleAdvanceState>("idle");
	const [scaleDisplayedTokens, setScaleDisplayedTokens] = useState(0);
	const [isScaleRainVisible, setIsScaleRainVisible] = useState(false);
	const [
		isModelComparisonSequenceComplete,
		setIsModelComparisonSequenceComplete,
	] = useState(false);
	const [isToolsSequenceComplete, setIsToolsSequenceComplete] = useState(false);
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
	const isModelStep = activeStep.id === "model";
	const isToolsStep = activeStep.id === "tools";
	const isScaleStep = activeStep.id === "scale";
	const scaleStepTotalTokens = isScaleStep
		? resolveScalePreviewTokens(
				onboardingMetrics.totalTokens,
				activePreviewState,
			)
		: 0;
	const scaleRainTotalTokens =
		isScaleStep && isScaleRainVisible
			? resolveScalePreviewTokens(
					onboardingMetrics.totalTokens,
					activePreviewState,
				)
			: 0;
	const effectiveScaleAdvanceState = isScaleStep ? scaleAdvanceState : "idle";
	const isScaleAdvancePending =
		effectiveScaleAdvanceState === "spend" ||
		effectiveScaleAdvanceState === "kebabs";
	const isScaleStepContinueVisible =
		!isScaleStep ||
		(!isScaleAdvancePending &&
			(reduceMotion ||
				(isScaleRainVisible && scaleDisplayedTokens >= scaleStepTotalTokens)));
	const isModelStepContinueVisible =
		!isModelStep || isModelComparisonSequenceComplete;
	const isToolsStepContinueVisible = !isToolsStep || isToolsSequenceComplete;
	const isContinueVisible = isScaleStep
		? isScaleStepContinueVisible
		: isToolsStepContinueVisible && isModelStepContinueVisible;
	const isStepTransitioning =
		pendingStepIndex !== null || isScaleAdvancePending;
	const showPreviewControls = import.meta.env.DEV;
	const areModelDebugControlsFloating = showPreviewControls && isModelStep;
	const stagePresenceContext = resolveWrappedStagePresenceContext({
		direction: navigationDirection,
		reduceMotion,
	});

	function clearScaleAdvanceTimers() {
		for (const timeoutId of scaleAdvanceTimerRefs.current) {
			window.clearTimeout(timeoutId);
		}

		scaleAdvanceTimerRefs.current = [];
	}

	useMountEffect(() => {
		return () => {
			if (exitTimerRef.current !== null) {
				window.clearTimeout(exitTimerRef.current);
			}

			clearScaleAdvanceTimers();
		};
	});

	function commitStepNavigation(nextStepIndex: number) {
		const boundedStepIndex = Math.max(
			0,
			Math.min(nextStepIndex, WRAPPED_SATURDAY_STEPS.length - 1),
		);

		if (boundedStepIndex !== activeStepIndex) {
			setNavigationDirection(boundedStepIndex > activeStepIndex ? 1 : -1);
		}

		const nextStep = WRAPPED_SATURDAY_STEPS[boundedStepIndex];

		if (activeStep.id === "scale" || nextStep?.id === "scale") {
			setIsScaleRainVisible(false);
			setScaleDisplayedTokens(0);
		}

		if (nextStep?.id === "scale") {
			clearScaleAdvanceTimers();
			setScaleAdvanceState("idle");
		}

		if (activeStep.id === "model" || nextStep?.id === "model") {
			setIsModelComparisonSequenceComplete(false);
		}

		if (activeStep.id === "tools" || nextStep?.id === "tools") {
			setIsToolsSequenceComplete(false);
		}

		startTransition(() => {
			setSearchParams(
				(previousSearchParams) => {
					const nextSearchParams = new URLSearchParams(previousSearchParams);

					if (boundedStepIndex === 0) {
						nextSearchParams.delete(STEP_QUERY_PARAM);
					} else {
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

	function goToStep(nextStepIndex: number) {
		const boundedStepIndex = Math.max(
			0,
			Math.min(nextStepIndex, WRAPPED_SATURDAY_STEPS.length - 1),
		);
		commitStepNavigation(boundedStepIndex);
	}

	function playScaleAdvanceSequence() {
		clearScaleAdvanceTimers();
		setScaleDisplayedTokens(scaleStepTotalTokens);
		setScaleAdvanceState("spend");

		scaleAdvanceTimerRefs.current.push(
			window.setTimeout(() => {
				setScaleAdvanceState("kebabs");
			}, SCALE_ADVANCE_SEQUENCE.kebabRevealMs),
		);
	}

	function handleScaleAdvanceSequenceComplete() {
		clearScaleAdvanceTimers();
		setScaleAdvanceState("complete");
	}

	function handleStepAdvance() {
		if (activeStep.kind === "final" || isStepTransitioning) {
			return;
		}

		const nextStepIndex = activeStepIndex + 1;

		if (activeStep.id === "model") {
			if (!isModelComparisonSequenceComplete) {
				return;
			}

			goToStep(nextStepIndex);
			return;
		}

		if (activeStep.id === "scale") {
			if (scaleAdvanceState === "complete") {
				goToStep(nextStepIndex);
				return;
			}

			if (reduceMotion) {
				goToStep(nextStepIndex);
				return;
			}

			playScaleAdvanceSequence();
			return;
		}

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
		if (stepId === "scale") {
			clearScaleAdvanceTimers();
			setScaleAdvanceState("idle");
			setIsScaleRainVisible(false);
			setScaleDisplayedTokens(0);
		}

		if (stepId === "model") {
			setIsModelComparisonSequenceComplete(false);
		}

		if (stepId === "tools") {
			setIsToolsSequenceComplete(false);
		}

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

	function handleScaleRainRevealChange(isVisible: boolean) {
		setIsScaleRainVisible(isVisible);
		if (!isVisible) {
			clearScaleAdvanceTimers();
			setScaleAdvanceState("idle");
			setScaleDisplayedTokens(0);
		}
	}

	function handleModelComparisonSequenceComplete() {
		setIsModelComparisonSequenceComplete(true);
	}

	function handleToolsSequenceComplete() {
		setIsToolsSequenceComplete(true);
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
			<LayoutGroup>
				<main
					className={cn(
						"rudel-wrapped-route",
						"rudel-wrapped-route--onboarding",
						`rudel-wrapped-route--step-${activeStep.id}`,
						isScaleStep ? "rudel-wrapped-route--scale-rain" : undefined,
					)}
				>
					{isScaleStep ? (
						<WrappedOnboardingScaleRainBackdrop
							onDisplayedTokensChange={setScaleDisplayedTokens}
							reduceMotion={reduceMotion}
							totalTokens={scaleRainTotalTokens}
						/>
					) : null}
					<motion.div
						layout
						className="rudel-wrapped-shell rudel-wrapped-shell--aligned-top-chrome relative z-[1] mx-auto flex w-full flex-1 flex-col text-foreground"
					>
						<motion.div layout className="rudel-wrapped-shell__frame">
							<WrappedOnboardingHeader
								activeStep={activeStep}
								activeStepIndex={activeStepIndex}
								isStepTransitioning={isStepTransitioning}
								onBack={handleTopChromeBack}
								onGoToStep={goToStep}
								rewardCardBackground={rewardCardBackground}
							/>

							<div className="rudel-wrapped-stage-area">
								{areModelDebugControlsFloating ? (
									<WrappedOnboardingDebugControls
										activePreviewOptions={activePreviewOptions}
										activePreviewState={activePreviewState}
										activePreviewStepId={activePreviewStepId}
										activeStep={activeStep}
										className="rudel-wrapped-onboarding-debug-controls rudel-wrapped-onboarding-debug-controls--floating"
										generalDebugControls={footerDebugControls}
										isDebugControlsVisible={showPreviewControls}
										isStepTransitioning={isStepTransitioning}
										onPreviewStateChange={setPreviewState}
									/>
								) : null}

								<AnimatePresence custom={stagePresenceContext} mode="wait">
									<motion.div
										key={activeStep.id}
										layout
										animate="animate"
										className="rudel-wrapped-stage-slot"
										custom={stagePresenceContext}
										exit="exit"
										initial="initial"
										variants={WRAPPED_STAGE_PRESENCE_VARIANTS}
									>
										{activeStep.kind === "final" ? (
											<div className="flex w-full flex-1">{finalStage}</div>
										) : (
											<div className="flex w-full flex-1 flex-col">
												<WrappedOnboardingStage
													displayName={displayName}
													isExiting={activeStep.id === exitingStepId}
													onboardingMetrics={onboardingMetrics}
													onModelComparisonSequenceComplete={
														handleModelComparisonSequenceComplete
													}
													onScaleRainRevealChange={handleScaleRainRevealChange}
													onScaleAdvanceSequenceComplete={
														handleScaleAdvanceSequenceComplete
													}
													onToolsBaseModelSequenceComplete={
														handleToolsSequenceComplete
													}
													previewState={activePreviewState}
													scaleAdvanceState={effectiveScaleAdvanceState}
													scaleDisplayedTokens={scaleDisplayedTokens}
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
								generalDebugControls={
									areModelDebugControlsFloating
										? undefined
										: footerDebugControls
								}
								isContinueVisible={isContinueVisible}
								isDebugControlsVisible={
									showPreviewControls && !areModelDebugControlsFloating
								}
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
	if (direction === 0) {
		return 0;
	}

	if (direction === -1) {
		return -32;
	}

	return 32;
}

function resolveWrappedStageExitOffset(direction: -1 | 0 | 1) {
	if (direction === 0) {
		return 0;
	}

	if (direction === -1) {
		return 24;
	}

	return -24;
}

const WRAPPED_STAGE_PRESENCE_VARIANTS = {
	animate: (custom: WrappedStagePresenceContext) =>
		resolveWrappedStagePresenceState("animate", custom),
	exit: (custom: WrappedStagePresenceContext) =>
		resolveWrappedStagePresenceState("exit", custom),
	initial: (custom: WrappedStagePresenceContext) =>
		resolveWrappedStagePresenceState("initial", custom),
};

function resolveWrappedStagePresenceContext(input: {
	direction: -1 | 0 | 1;
	reduceMotion: boolean;
}): WrappedStagePresenceContext {
	const { direction, reduceMotion } = input;

	return {
		direction,
		reduceMotion,
	};
}

function resolveWrappedStagePresenceState(
	phase: "animate" | "exit" | "initial",
	custom: WrappedStagePresenceContext,
) {
	const transition = resolveWrappedStagePresenceTransition(custom);

	if (phase === "animate") {
		return {
			filter: "blur(0px)",
			opacity: 1,
			scale: 1,
			x: 0,
			y: 0,
			transition,
		};
	}

	if (custom.reduceMotion) {
		return {
			opacity: 0,
			scale: 1,
			x: 0,
			y: 0,
			transition,
		};
	}

	return phase === "initial"
		? {
				filter: "blur(10px)",
				opacity: 0,
				scale: 0.992,
				x: resolveWrappedStageEnterOffset(custom.direction),
				y: 0,
				transition,
			}
		: {
				filter: "blur(10px)",
				opacity: 0,
				scale: 0.992,
				x: resolveWrappedStageExitOffset(custom.direction),
				y: 0,
				transition,
			};
}

function resolveWrappedStagePresenceTransition(
	custom: WrappedStagePresenceContext,
) {
	if (custom.reduceMotion) {
		return REDUCED_STAGE_TRANSITION;
	}

	return STAGE_TRANSITION;
}
