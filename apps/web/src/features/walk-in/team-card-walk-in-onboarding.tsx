import {
	ChevronLeft,
	LoaderCircle,
} from "lucide-react";
import { useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { appRoutes } from "@/app/routes";
import { buttonVariants } from "@/app/ui/button";
import { useMountEffect } from "@/hooks/useMountEffect";
import { cn } from "@/lib/utils";
import {
	STEP_QUERY_PARAM,
	UPLOAD_STEP,
	WALK_IN_STEPS,
	WALK_IN_STEP_PREVIEW_OPTIONS,
	type PreviewableWalkInStepId,
	type WalkInStepId,
} from "./walk-in-onboarding-config";
import {
	getSelectedPreviewState,
	getStepDisplayNumber,
	getStepPreviewStateParam,
	getVisibleProgressSteps,
	resolveActiveStepIndex,
	resolveUploadStageModel,
} from "./walk-in-onboarding-helpers";
import {
	resolveScalePreviewTokens,
} from "./walk-in-onboarding-models";
import {
	WalkInOnboardingScaleRainBackdrop,
	WalkInOnboardingStage,
} from "./walk-in-onboarding-stages";
import { type WalkInOnboardingMetrics } from "./walk-in-onboarding-types";

interface WalkInSecondaryActionProps {
	children: ReactNode;
	disabled?: boolean;
	onClick?: () => void;
}

interface WalkInActionStackProps {
	continueDisabled?: boolean;
	continueIcon?: ReactNode;
	continueLabel: string;
	onContinue?: () => void;
	onSecondaryAction?: () => void;
	secondaryActionDisabled?: boolean;
	secondaryActionLabel?: string;
}

type WalkInPrimaryActionProps =
	| {
			children: ReactNode;
			disabled?: boolean;
			icon?: ReactNode;
			kind: "button";
			onClick?: () => void;
			type?: "button" | "reset" | "submit";
	  }
	| {
			children: ReactNode;
			kind: "link";
			to: string;
	  };

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
} from "./walk-in-onboarding-config";
export type {
	WalkInOnboardingMetrics,
	WalkInRepoPulseEntry,
	WalkInRepoPulseMetrics,
	WalkInSkillUsageItem,
} from "./walk-in-onboarding-types";

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
				<header className="space-y-3">
					<div className="mymind-walk-in-header-row">
						{activeStepIndex > 0 ? (
							<button
								type="button"
								aria-label={`Go back to ${activeStepIndex === 1 ? "step -1" : `step ${getStepDisplayNumber(activeStepIndex - 1)}`}`}
								disabled={isStepTransitioning}
								className="mymind-walk-in-back-button rounded-full border border-border bg-background text-foreground transition-colors hover:text-foreground"
								onClick={() => goToStep(activeStepIndex - 1)}
							>
								<ChevronLeft className="size-4" />
							</button>
						) : null}

						<div className="mymind-walk-in-progress">
							<button
								type="button"
								aria-label={`Go to step -1: ${UPLOAD_STEP.label}`}
								disabled={isStepTransitioning}
								className={cn(
									"mymind-walk-in-progress__button rounded-full border text-[0.72rem] font-medium tabular-nums transition-colors",
									activeStepIndex === 0
										? "border-foreground bg-foreground text-background"
										: "border-border bg-background text-muted-foreground hover:text-foreground",
								)}
								onClick={() => goToStep(0)}
							>
								-1
							</button>
							{visibleProgressSteps.map(({ step, stepIndex }) => {
								const displayStepNumber = getStepDisplayNumber(stepIndex);

								return (
									<button
										key={step.id}
										type="button"
										aria-label={`Go to step ${displayStepNumber}: ${step.label}`}
										disabled={isStepTransitioning}
										className={cn(
											"mymind-walk-in-progress__button rounded-full border text-[0.72rem] font-medium tabular-nums transition-colors",
											stepIndex === activeStepIndex
											? "border-foreground bg-foreground text-background"
											: "border-border bg-background text-muted-foreground hover:text-foreground",
									)}
									onClick={() => goToStep(stepIndex)}
									>
										{displayStepNumber}
									</button>
								);
							})}
						</div>
					</div>

					{activePreviewStepId && activePreviewOptions ? (
						<div className="w-full rounded-full border border-border/50 bg-background/65 px-2 py-1">
							<div className="flex items-center gap-2 overflow-x-auto whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
								<fieldset className="flex flex-nowrap gap-1">
									<legend className="sr-only">{`${activeStep.label} preview states`}</legend>
									{activePreviewOptions.map((option) => {
										const isSelected = option.value === activePreviewState;

										return (
											<button
												key={option.value}
												type="button"
												aria-pressed={isSelected}
												disabled={isStepTransitioning}
												onClick={() =>
													setPreviewState(activePreviewStepId, option.value)
												}
												className={cn(
													"min-h-11 shrink-0 rounded-full border px-2.5 py-1 text-[0.68rem] font-medium transition-colors",
													isSelected
														? "border-foreground bg-foreground text-background"
														: "border-border bg-background text-muted-foreground hover:text-foreground",
												)}
											>
												{option.label}
											</button>
										);
									})}
								</fieldset>
							</div>
						</div>
					) : null}
				</header>

					<div className="flex flex-1 py-6 md:py-8">
						{activeStep?.kind === "final" ? (
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

				<footer className="mymind-walk-in-step-footer mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-border/70 pt-5">
					{activeStep?.kind === "final" ? (
						finalFooter ?? (
							<WalkInPrimaryAction kind="link" to={appRoutes.dashboard()}>
								Done
							</WalkInPrimaryAction>
						)
					) : activeStep.id === "upload" ? (
						<WalkInActionStack
							continueDisabled={activeUploadModel?.isUploading}
							continueIcon={
								activeUploadModel?.isUploading ? (
									<LoaderCircle className="size-4 animate-spin" />
								) : undefined
							}
							continueLabel={activeUploadModel?.isUploading ? "Uploading..." : "Continue"}
							onContinue={() => goToStep(activeStepIndex + 1)}
							secondaryActionLabel={activeUploadModel?.secondaryActionLabel ?? undefined}
						/>
					) : (
						<WalkInActionStack
							continueDisabled={isStepTransitioning}
							continueLabel="Continue"
							onContinue={handleStepAdvance}
						/>
					)}
				</footer>
			</div>
		</main>
	);
}

function WalkInActionStack(props: WalkInActionStackProps) {
	return (
		<div className="mymind-walk-in-action-stack">
			<WalkInPrimaryAction
				kind="button"
				disabled={props.continueDisabled}
				onClick={props.onContinue}
				icon={props.continueIcon}
			>
				{props.continueLabel}
			</WalkInPrimaryAction>

			{props.secondaryActionLabel ? (
				<WalkInSecondaryAction
					disabled={props.secondaryActionDisabled}
					onClick={props.onSecondaryAction}
				>
					{props.secondaryActionLabel}
				</WalkInSecondaryAction>
			) : null}
		</div>
	);
}

function WalkInPrimaryAction(props: WalkInPrimaryActionProps) {
	const className = cn(
		buttonVariants({}),
		"mymind-walk-in-primary-action h-11 rounded-full px-7 [font-family:'Nunito',var(--font-sans)] text-[19px] font-bold",
	);

	if (props.kind === "link") {
		return (
			<Link to={props.to} className={className}>
				{props.children}
			</Link>
		);
	}

	return (
		<button
			type={props.type ?? "button"}
			disabled={props.disabled}
			onClick={props.onClick}
			className={className}
		>
			<span>{props.children}</span>
			{props.icon ? (
				<span className="mymind-walk-in-primary-action__icon">{props.icon}</span>
			) : null}
		</button>
	);
}

function WalkInSecondaryAction(props: WalkInSecondaryActionProps) {
	return (
		<button
			type="button"
			disabled={props.disabled}
			onClick={props.onClick}
			className="mymind-walk-in-secondary-action [font-family:'Nunito',var(--font-sans)] text-[19px] font-bold"
		>
			{props.children}
		</button>
	);
}
