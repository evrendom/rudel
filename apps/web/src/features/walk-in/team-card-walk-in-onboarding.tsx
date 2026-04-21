import type { MonthlyModelUsage, WrappedSourceSplit } from "@rudel/api-routes";
import {
	BadgeCheck,
	ChevronLeft,
	LoaderCircle,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import type {
	CSSProperties,
	ReactNode,
	TouchEvent,
	UIEvent,
} from "react";
import { useEffect, useRef, useState } from "react";
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
	type WalkInStep,
	type WalkInStepId,
} from "./walk-in-onboarding-config";
import {
	buildIntroCommitGraph,
	buildIntroContent,
	getSelectedPreviewState,
	getStepDisplayNumber,
	getStepPreviewStateParam,
	getVisibleProgressSteps,
	resolveActiveStepIndex,
	resolveIntroPreviewInput,
	resolveIntroStageModel,
	resolveUploadStageModel,
	type UploadStageRollItem,
	type WalkInStepContentLine,
} from "./walk-in-onboarding-helpers";

const COMPACT_NUMBER_FORMATTER = new Intl.NumberFormat("en", {
	maximumFractionDigits: 1,
	notation: "compact",
});

export interface WalkInRepoPulseEntry {
	id: string;
	meta: string;
	proof: string;
	repoName: string;
	workType: string;
}

export interface WalkInRepoPulseMetrics {
	entries: readonly WalkInRepoPulseEntry[];
	leadRepoName: string | null;
	totalRepos: number;
	totalSessions: number;
}

interface RepoPulseStageModel {
	entries: readonly WalkInRepoPulseEntry[];
	footnote: string;
	headline: string;
	subline: string;
	totalReposLabel: string;
	totalSessionsLabel: string;
}

interface ToolsStageEntry {
	id: string;
	isPlaceholder: boolean;
	name: string;
	usageLabel: string;
	usageRate: number | null;
}

interface ToolsStageModel {
	entries: readonly ToolsStageEntry[];
	footnote: string;
	headline: string;
	subline: string;
}

export interface WalkInSkillUsageItem {
	count: number;
	name: string;
}

interface WalkInModelShareSegment {
	id: string;
	label: string;
	sessionCount: number;
	share: number;
	source: WrappedSourceSplit["source"];
}

interface WalkInModelShareMonth {
	id: string;
	label: string;
	leaderLabel: string;
	leaderShare: number;
	segments: readonly WalkInModelShareSegment[];
	totalSessions: number;
}

interface ModelStageModel {
	footnote: string;
	headline: string;
	months: readonly WalkInModelShareMonth[];
	monthsLabel: string;
	subline: string;
	summary: readonly WalkInModelShareSegment[];
	totalSessionsLabel: string;
}

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

interface ScaleRainBall {
	delayMs: number;
	driftPx: number;
	durationMs: number;
	endRotationDeg: number;
	hue: number;
	id: string;
	leftPercent: number;
	sizePx: number;
	startRotationDeg: number;
	startYOffsetPx: number;
	staticTopSvh: number;
	zIndex: number;
}

interface ScaleStageModel {
	displayBallCount: number;
	footnote: string;
	headline: string;
	showsMinimumFloor: boolean;
	subline: string;
	totalTokens: number;
}

type LockInStageState =
	| "missing"
	| "settled"
	| "stretched"
	| "got-away"
	| "didnt-end";

interface LockInStageModel {
	averageDurationLabel: string;
	averageShare: number;
	comparisonLabel: string;
	footnote: string;
	headline: string;
	longestDurationLabel: string;
	longestShare: number;
	state: LockInStageState;
	stateLabel: string;
	subline: string;
}

type QualityStageState =
	| "missing"
	| "strong"
	| "delivery-led"
	| "commit-led"
	| "iterating"
	| "success-only"
	| "commit-only";

interface QualityStageModel {
	comparisonLabel: string;
	commitRateLabel: string;
	commitShare: number;
	footnote: string;
	hasCommitRate: boolean;
	hasSuccessRate: boolean;
	headline: string;
	state: QualityStageState;
	stateLabel: string;
	subline: string;
	successRateLabel: string;
	successShare: number;
}

/* ─────────────────────────────────────────────────────────
 * UPLOAD REEL STORYBOARD
 *
 * Read top-to-bottom. Each `at` value is ms after trigger.
 *
 *    0ms   current upload item is centered
 * 1800ms   next item rolls up into focus
 * 1800ms   previous item scales down above
 * 1800ms   upcoming item scales down below
 * ───────────────────────────────────────────────────────── */

const UPLOAD_REEL_TIMING = {
	advance: 1800, // advance to the next upload item
};

const UPLOAD_REEL = {
	itemHeight: 52, // px height of each upload row in the scroll reel
	activeScale: 1,
	adjacentScale: 0.88,
	farScale: 0.76,
	activeOpacity: 1,
	adjacentOpacity: 0.52,
	farOpacity: 0,
	spring: {
		type: "spring" as const,
		stiffness: 360,
		damping: 30,
	},
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

const SCALE_STAGE_TOKENS_PER_BALL = 2_000_000;
const SCALE_STAGE_MIN_BALL_COUNT = 50;

export interface WalkInOnboardingMetrics {
	activeDays: number;
	avgSessionMin: number | null;
	commitRate: number | null;
	daysSinceFirst: number;
	favoriteModel: string | null;
	longestSessionMin: number | null;
	modelByMonth: readonly MonthlyModelUsage[];
	sourceSplit: readonly WrappedSourceSplit[];
	skillsAdoptionRate: number | null;
	slashCommandsAdoptionRate: number | null;
	subagentsAdoptionRate: number | null;
	successRate: number | null;
	repoPulse: WalkInRepoPulseMetrics;
	topProjectName: string | null;
	topProjectSessions: number;
	topProjectTokens: number;
	topSkills: readonly WalkInSkillUsageItem[];
	topSlashCommand: string | null;
	topSlashCommands: readonly WalkInSkillUsageItem[];
	topSlashCommandCount: number | null;
	topSubagent: string | null;
	topSubagents: readonly WalkInSkillUsageItem[];
	topSubagentCount: number | null;
	totalSessions: number;
	totalTokens: number;
}

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
				<ScaleRainBackdrop
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
								<PlaceholderStage
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

function PlaceholderStage(props: {
	displayName: string;
	isExiting: boolean;
	onboardingMetrics: WalkInOnboardingMetrics;
	previewState: string;
	step: WalkInStep;
	totalSessions: number;
}) {
	const {
		displayName,
		isExiting,
		onboardingMetrics,
		previewState,
		step,
		totalSessions,
	} = props;

	if (step.id === "upload") {
		return <UploadStage previewState={previewState} />;
	}

	if (step.id === "intro") {
		return (
			<IntroStage
				displayName={displayName}
				isSparse={totalSessions < 10}
				isExiting={isExiting}
				previewState={previewState}
				totalSessions={totalSessions}
				onboardingMetrics={onboardingMetrics}
			/>
		);
	}

	if (step.id === "skills") {
		return (
			<SkillsStage
				key={`skills:${previewState}:${onboardingMetrics.topSkills.length}:${onboardingMetrics.skillsAdoptionRate ?? -1}`}
				onboardingMetrics={onboardingMetrics}
				previewState={previewState}
			/>
		);
	}

	if (step.id === "tools") {
		return (
			<ToolsStage
				key={`tools:${previewState}:${onboardingMetrics.topSlashCommands.length}:${onboardingMetrics.topSubagents.length}:${onboardingMetrics.topSlashCommandCount ?? -1}:${onboardingMetrics.topSubagentCount ?? -1}:${onboardingMetrics.totalSessions}`}
				onboardingMetrics={onboardingMetrics}
				previewState={previewState}
			/>
		);
	}

	if (step.id === "model") {
		return (
			<ModelStage
				onboardingMetrics={onboardingMetrics}
				previewState={previewState}
			/>
		);
	}

	if (step.id === "pulse") {
		return (
			<RepoPulseStage
				onboardingMetrics={onboardingMetrics}
				previewState={previewState}
			/>
		);
	}

	if (step.id === "scale") {
		return (
			<ScaleStage
				onboardingMetrics={onboardingMetrics}
				previewState={previewState}
			/>
		);
	}

	if (step.id === "lock-in") {
		return (
			<LockInStage
				onboardingMetrics={onboardingMetrics}
				previewState={previewState}
			/>
		);
	}

	if (step.id === "quality") {
		return (
			<QualityStage
				onboardingMetrics={onboardingMetrics}
				previewState={previewState}
			/>
		);
	}

	const content = buildStepContent({
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

function ScaleStage(props: {
	onboardingMetrics: WalkInOnboardingMetrics;
	previewState: string;
}) {
	const { onboardingMetrics, previewState } = props;
	const totalTokens = resolveScalePreviewTokens(
		onboardingMetrics.totalTokens,
		previewState,
	);
	const model = resolveScaleStageModel(totalTokens);

	return (
		<section className="mymind-walk-in-scale-stage">
			<div className="mymind-walk-in-scale-stage__hero">
				<p className="mymind-walk-in-scale-stage__eyebrow">Token scale</p>
				<h2 className="mymind-walk-in-scale-stage__headline">
					{model.headline}
				</h2>
				<p className="mymind-walk-in-scale-stage__subline">{model.subline}</p>
			</div>

			<div className="mymind-walk-in-scale-stage__object">
				<article className="mymind-walk-in-scale-stage__card">
					<div className="mymind-walk-in-scale-stage__stats">
						<div className="mymind-walk-in-scale-stage__stat">
							<p className="mymind-walk-in-scale-stage__stat-label">
								Tokens logged
							</p>
							<p className="mymind-walk-in-scale-stage__stat-value">
								{formatCompactNumber(model.totalTokens)}
							</p>
						</div>
						<div className="mymind-walk-in-scale-stage__stat">
							<p className="mymind-walk-in-scale-stage__stat-label">
								Balls dropping
							</p>
							<p className="mymind-walk-in-scale-stage__stat-value">
								{model.displayBallCount.toLocaleString()}
							</p>
						</div>
					</div>

					<div className="mymind-walk-in-scale-stage__chips">
						<span className="mymind-walk-in-scale-stage__chip">
							{`1 ball = ${formatCompactNumber(SCALE_STAGE_TOKENS_PER_BALL)} tokens`}
						</span>
						{model.showsMinimumFloor ? (
							<span className="mymind-walk-in-scale-stage__chip is-highlight">
								{`${SCALE_STAGE_MIN_BALL_COUNT}-ball floor active`}
							</span>
						) : null}
					</div>
				</article>
			</div>

			<p className="mymind-walk-in-scale-stage__footnote">{model.footnote}</p>
		</section>
	);
}

function ScaleRainBackdrop(props: {
	reduceMotion: boolean;
	totalTokens: number;
}) {
	const { reduceMotion, totalTokens } = props;
	const balls = buildScaleRainBalls(totalTokens);

	return (
		<div
			className={cn(
				"mymind-walk-in-scale-rain",
				reduceMotion ? "is-reduced-motion" : undefined,
			)}
			aria-hidden="true"
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

function LockInStage(props: {
	onboardingMetrics: WalkInOnboardingMetrics;
	previewState: string;
}) {
	const { onboardingMetrics, previewState } = props;
	const model = resolveLockInStageModel(
		resolveLockInPreviewInput(
			{
				avgSessionMin: onboardingMetrics.avgSessionMin,
				longestSessionMin: onboardingMetrics.longestSessionMin,
			},
			previewState,
		),
	);

	return (
		<section className="mymind-walk-in-lock-in-stage">
			<div className="mymind-walk-in-lock-in-stage__hero">
				<p className="mymind-walk-in-lock-in-stage__eyebrow">Session length</p>
				<h2 className="mymind-walk-in-lock-in-stage__headline">
					{model.headline}
				</h2>
				<p className="mymind-walk-in-lock-in-stage__subline">{model.subline}</p>
			</div>

			<div className="mymind-walk-in-lock-in-stage__object">
				<article
					className={cn(
						"mymind-walk-in-lock-in-stage__card",
						`is-${model.state}`,
					)}
				>
					<div className="mymind-walk-in-lock-in-stage__stats">
						<div className="mymind-walk-in-lock-in-stage__stat">
							<p className="mymind-walk-in-lock-in-stage__stat-label">
								Longest recorded
							</p>
							<p className="mymind-walk-in-lock-in-stage__stat-value">
								{model.longestDurationLabel}
							</p>
						</div>
						<div className="mymind-walk-in-lock-in-stage__stat">
							<p className="mymind-walk-in-lock-in-stage__stat-label">
								Usual session
							</p>
							<p className="mymind-walk-in-lock-in-stage__stat-value">
								{model.averageDurationLabel}
							</p>
						</div>
					</div>

					<div className="mymind-walk-in-lock-in-stage__chips">
						<span className="mymind-walk-in-lock-in-stage__chip is-state">
							{model.stateLabel}
						</span>
						<span className="mymind-walk-in-lock-in-stage__chip">
							{model.comparisonLabel}
						</span>
					</div>

					<div className="mymind-walk-in-lock-in-stage__compare">
						<div className="mymind-walk-in-lock-in-stage__row">
							<div className="mymind-walk-in-lock-in-stage__row-head">
								<p className="mymind-walk-in-lock-in-stage__row-label">
									Usual session
								</p>
								<p className="mymind-walk-in-lock-in-stage__row-value">
									{model.averageDurationLabel}
								</p>
							</div>
							<div
								className="mymind-walk-in-lock-in-stage__track"
								aria-hidden="true"
							>
								<span
									className="mymind-walk-in-lock-in-stage__fill is-average"
									style={
										{
											"--lock-in-stage-meter-value": `${model.averageShare}%`,
										} as CSSProperties
									}
								/>
							</div>
						</div>

						<div className="mymind-walk-in-lock-in-stage__row">
							<div className="mymind-walk-in-lock-in-stage__row-head">
								<p className="mymind-walk-in-lock-in-stage__row-label">
									Longest recorded
								</p>
								<p className="mymind-walk-in-lock-in-stage__row-value">
									{model.longestDurationLabel}
								</p>
							</div>
							<div
								className="mymind-walk-in-lock-in-stage__track"
								aria-hidden="true"
							>
								<span
									className="mymind-walk-in-lock-in-stage__fill is-longest"
									style={
										{
											"--lock-in-stage-meter-value": `${model.longestShare}%`,
										} as CSSProperties
									}
								/>
							</div>
						</div>
					</div>
				</article>
			</div>

			<p className="mymind-walk-in-lock-in-stage__footnote">{model.footnote}</p>
		</section>
	);
}

function QualityStage(props: {
	onboardingMetrics: WalkInOnboardingMetrics;
	previewState: string;
}) {
	const { onboardingMetrics, previewState } = props;
	const model = resolveQualityStageModel(
		resolveQualityPreviewInput(
			{
				commitRate: onboardingMetrics.commitRate,
				successRate: onboardingMetrics.successRate,
			},
			previewState,
		),
	);

	return (
		<section className="mymind-walk-in-quality-stage">
			<div className="mymind-walk-in-quality-stage__hero">
				<p className="mymind-walk-in-quality-stage__eyebrow">Finish quality</p>
				<h2 className="mymind-walk-in-quality-stage__headline">
					{model.headline}
				</h2>
				<p className="mymind-walk-in-quality-stage__subline">{model.subline}</p>
			</div>

			<div className="mymind-walk-in-quality-stage__object">
				<article
					className={cn(
						"mymind-walk-in-quality-stage__card",
						`is-${model.state}`,
					)}
				>
					<div className="mymind-walk-in-quality-stage__stats">
						<div className="mymind-walk-in-quality-stage__stat">
							<p className="mymind-walk-in-quality-stage__stat-label">
								Commit rate
							</p>
							<p className="mymind-walk-in-quality-stage__stat-value">
								{model.commitRateLabel}
							</p>
						</div>
						<div className="mymind-walk-in-quality-stage__stat">
							<p className="mymind-walk-in-quality-stage__stat-label">
								Success rate
							</p>
							<p className="mymind-walk-in-quality-stage__stat-value">
								{model.successRateLabel}
							</p>
						</div>
					</div>

					<div className="mymind-walk-in-quality-stage__chips">
						<span className="mymind-walk-in-quality-stage__chip is-state">
							{model.stateLabel}
						</span>
						<span className="mymind-walk-in-quality-stage__chip">
							{model.comparisonLabel}
						</span>
					</div>

					<div className="mymind-walk-in-quality-stage__compare">
						<div
							className={cn(
								"mymind-walk-in-quality-stage__row",
								!model.hasCommitRate ? "is-pending" : undefined,
							)}
						>
							<div className="mymind-walk-in-quality-stage__row-head">
								<p className="mymind-walk-in-quality-stage__row-label">
									Sessions with commits
								</p>
								<p className="mymind-walk-in-quality-stage__row-value">
									{model.commitRateLabel}
								</p>
							</div>
							<div
								className="mymind-walk-in-quality-stage__track"
								aria-hidden="true"
							>
								<span
									className="mymind-walk-in-quality-stage__fill is-commit"
									style={
										{
											"--quality-stage-meter-value": `${model.commitShare}%`,
										} as CSSProperties
									}
								/>
							</div>
						</div>

						<div
							className={cn(
								"mymind-walk-in-quality-stage__row",
								!model.hasSuccessRate ? "is-pending" : undefined,
							)}
						>
							<div className="mymind-walk-in-quality-stage__row-head">
								<p className="mymind-walk-in-quality-stage__row-label">
									Successful sessions
								</p>
								<p className="mymind-walk-in-quality-stage__row-value">
									{model.successRateLabel}
								</p>
							</div>
							<div
								className="mymind-walk-in-quality-stage__track"
								aria-hidden="true"
							>
								<span
									className="mymind-walk-in-quality-stage__fill is-success"
									style={
										{
											"--quality-stage-meter-value": `${model.successShare}%`,
										} as CSSProperties
									}
								/>
							</div>
						</div>
					</div>
				</article>
			</div>

			<p className="mymind-walk-in-quality-stage__footnote">
				{model.footnote}
			</p>
		</section>
	);
}

function ToolsStage(props: {
	onboardingMetrics: WalkInOnboardingMetrics;
	previewState: string;
}) {
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
				<article
					className="mymind-walk-in-tools-stage__card"
					style={
						{
							"--tools-stack-height": `${getToolsStackHeightRem(
								model.entries.length,
							)}rem`,
						} as CSSProperties
					}
				>
					<div className="mymind-walk-in-tools-stage__list">
						{model.entries.map((entry, entryIndex) => (
							<button
								key={entry.id}
								type="button"
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
									className="mymind-walk-in-tools-stage__meter"
									aria-hidden="true"
								>
									<span
										className="mymind-walk-in-tools-stage__meter-fill"
										style={
											{
												"--tools-stage-meter-value": `${entry.usageRate ?? 0}%`,
											} as CSSProperties
										}
									/>
								</div>
							</button>
						))}
					</div>
				</article>
			</div>

			<p className="mymind-walk-in-tools-stage__footnote">{model.footnote}</p>
		</section>
	);
}

function ModelStage(props: {
	onboardingMetrics: WalkInOnboardingMetrics;
	previewState: string;
}) {
	const { onboardingMetrics, previewState } = props;
	const model = resolveModelStageModel(
		resolveModelPreviewInput(
			{
				modelByMonth: onboardingMetrics.modelByMonth,
				sourceSplit: onboardingMetrics.sourceSplit,
			},
			previewState,
		),
	);

	return (
		<section className="mymind-walk-in-model-stage">
			<div className="mymind-walk-in-model-stage__hero">
				<p className="mymind-walk-in-model-stage__eyebrow">Model mix</p>
				<h2 className="mymind-walk-in-model-stage__headline">{model.headline}</h2>
				<p className="mymind-walk-in-model-stage__subline">{model.subline}</p>
			</div>

			<div className="mymind-walk-in-model-stage__object">
				<article className="mymind-walk-in-model-stage__card">
					<div className="mymind-walk-in-model-stage__summary-card">
						<div className="mymind-walk-in-model-stage__section-head">
							<p className="mymind-walk-in-model-stage__section-label">
								Entire period
							</p>
							<p className="mymind-walk-in-model-stage__section-value">
								{model.totalSessionsLabel}
							</p>
						</div>

						{model.summary.length === 0 ? (
							<p className="mymind-walk-in-model-stage__empty">
								The all-time split shows up once session history lands.
							</p>
						) : (
							<>
								<div
									className="mymind-walk-in-model-stage__summary-track"
									aria-hidden="true"
								>
									{model.summary.map((segment) => (
										<span
											key={segment.id}
											className="mymind-walk-in-model-stage__summary-segment"
											style={
												{
													"--model-stage-segment-color": getModelStageTone(
														segment.source,
													),
													"--model-stage-segment-share": `${segment.share}%`,
												} as CSSProperties
											}
											title={`${segment.label}: ${Math.round(segment.share)}%`}
										/>
									))}
								</div>

								<div className="mymind-walk-in-model-stage__legend">
									{model.summary.map((segment) => (
										<div
											key={segment.id}
											className="mymind-walk-in-model-stage__legend-row"
										>
											<span
												className="mymind-walk-in-model-stage__legend-dot"
												style={{
													backgroundColor: getModelStageTone(segment.source),
												}}
												aria-hidden="true"
											/>
											<p className="mymind-walk-in-model-stage__legend-name">
												{segment.label}
											</p>
											<p className="mymind-walk-in-model-stage__legend-value">
												{Math.round(segment.share)}%
											</p>
										</div>
									))}
								</div>
							</>
						)}
					</div>

					<div className="mymind-walk-in-model-stage__months-card">
						<div className="mymind-walk-in-model-stage__section-head">
							<p className="mymind-walk-in-model-stage__section-label">
								Last 6 months
							</p>
							<p className="mymind-walk-in-model-stage__section-value">
								{model.monthsLabel}
							</p>
						</div>

						{model.months.length === 0 ? (
							<p className="mymind-walk-in-model-stage__empty">
								The monthly stacks fill in once model history spans a few sessions.
							</p>
						) : (
							<div className="mymind-walk-in-model-stage__month-grid">
								{model.months.map((month) => (
									<div
										key={month.id}
										className="mymind-walk-in-model-stage__month-column"
										title={
											month.totalSessions > 0
												? `${month.label}: ${month.leaderLabel} led with ${month.leaderShare}%`
												: `${month.label}: no model activity`
										}
									>
										<div
											className={cn(
												"mymind-walk-in-model-stage__month-bar",
												month.totalSessions === 0 ? "is-empty" : null,
											)}
											aria-hidden="true"
										>
											{month.segments.map((segment) => (
												<span
													key={segment.id}
													className="mymind-walk-in-model-stage__month-segment"
													style={
														{
															"--model-stage-segment-color": getModelStageTone(
																segment.source,
															),
															"--model-stage-segment-share": `${segment.share}%`,
														} as CSSProperties
													}
												/>
											))}
										</div>
										<p className="mymind-walk-in-model-stage__month-label">
											{month.label}
										</p>
									</div>
								))}
							</div>
						)}
					</div>
				</article>
			</div>

			<p className="mymind-walk-in-model-stage__footnote">{model.footnote}</p>
		</section>
	);
}

function IntroStage(props: {
	displayName: string;
	isSparse: boolean;
	isExiting: boolean;
	onboardingMetrics: WalkInOnboardingMetrics;
	previewState: string;
	totalSessions: number;
}) {
	const {
		displayName,
		isExiting,
		isSparse,
		onboardingMetrics,
		previewState,
		totalSessions,
	} = props;
	const introInput = resolveIntroPreviewInput(
		{
			activeDays: onboardingMetrics.activeDays,
			daysSinceFirst: onboardingMetrics.daysSinceFirst,
			displayName,
			totalSessions,
		},
		previewState,
	);
	const model = resolveIntroStageModel(introInput);
	const commitGraph = buildIntroCommitGraph(introInput);

	return (
		<section className="mymind-walk-in-intro-stage">
			<motion.div
				initial={false}
				animate={
					isExiting
						? {
								opacity: 0,
								x: -INTRO_EXIT.distance,
							}
						: { opacity: 1, x: 0 }
				}
				transition={
					isExiting
						? {
								duration: INTRO_EXIT.duration,
								ease: INTRO_EXIT.ease,
							}
						: { duration: 0 }
				}
				className="mymind-walk-in-intro-stage__hero"
			>
				<h2 className="mymind-walk-in-intro-stage__headline">{model.headline}</h2>
			</motion.div>

			<motion.div
				initial={false}
				animate={
					isExiting
						? {
								opacity: 0,
								y: 14,
							}
						: { opacity: 1, y: 0 }
				}
				transition={
					isExiting
						? {
								duration: INTRO_EXIT.duration,
								ease: INTRO_EXIT.ease,
								delay: INTRO_EXIT.lineDelay * 2,
							}
						: { duration: 0 }
				}
				className="mymind-walk-in-intro-stage__commit-graph"
				aria-hidden="true"
			>
				{commitGraph.map((dot) => (
					<span
						key={dot.id}
						className={cn(
							"mymind-walk-in-intro-stage__commit-dot",
							`is-level-${dot.level}`,
						)}
					/>
				))}
			</motion.div>

			<motion.div
				initial={false}
				animate={
					isExiting
						? {
								opacity: 0,
								x: INTRO_EXIT.distance,
							}
						: { opacity: 1, x: 0 }
				}
				transition={
					isExiting
						? {
								duration: INTRO_EXIT.duration,
								ease: INTRO_EXIT.ease,
								delay: INTRO_EXIT.lineDelay,
							}
						: { duration: 0 }
				}
				className={cn(
					"mymind-walk-in-intro-stage__signal-card",
					isSparse && "is-sparse",
				)}
			>
				<div className="mymind-walk-in-intro-stage__signal-main">
					<p className="mymind-walk-in-intro-stage__signal-value">
						{model.cardValue}
					</p>
					<p className="mymind-walk-in-intro-stage__signal-detail">
						{model.cardDetail}
					</p>
					<p className="mymind-walk-in-intro-stage__signal-meta">
						{model.cardMeta}
					</p>
				</div>
			</motion.div>

			<motion.p
				initial={false}
				animate={
					isExiting
						? {
								opacity: 0,
								y: 12,
							}
						: { opacity: 1, y: 0 }
				}
				transition={
					isExiting
						? {
								duration: INTRO_EXIT.duration,
								ease: INTRO_EXIT.ease,
								delay: INTRO_EXIT.lineDelay * 3,
							}
						: { duration: 0 }
				}
				className="mymind-walk-in-intro-stage__footnote"
			>
				{model.footnote}
			</motion.p>
		</section>
	);
}

function SkillsStage(props: {
	onboardingMetrics: WalkInOnboardingMetrics;
	previewState: string;
}) {
	const { onboardingMetrics, previewState } = props;
	const stackRef = useRef<HTMLDivElement | null>(null);
	const wheelAccumulationRef = useRef(0);
	const lastWheelTimestampRef = useRef(0);
	const lockedUntilTimestampRef = useRef(0);
	const touchStartYRef = useRef<number | null>(null);
	const model = resolveSkillsStageModel(
		resolveSkillsPreviewInput(
			{
				skillsAdoptionRate: onboardingMetrics.skillsAdoptionRate,
				topSkills: onboardingMetrics.topSkills,
			},
			previewState,
		),
	);
	const [activeCardIndex, setActiveCardIndex] = useState(0);

	function setNextActiveCardIndex(direction: 1 | -1) {
		setActiveCardIndex((previousIndex) =>
			clampSkillsCardIndex(previousIndex + direction, model.cards.length),
		);
	}

	function handleSkillsCardWheelDelta(deltaY: number) {
		if (!model.isScrollable || deltaY === 0) {
			return;
		}

		const now = performance.now();
		if (now < lockedUntilTimestampRef.current) {
			return;
		}

		if (now - lastWheelTimestampRef.current > SKILLS_STACK.wheelResetMs) {
			wheelAccumulationRef.current = 0;
		}

		lastWheelTimestampRef.current = now;
		wheelAccumulationRef.current += deltaY;

		if (Math.abs(wheelAccumulationRef.current) < SKILLS_STACK.wheelThresholdPx) {
			return;
		}

		const direction = wheelAccumulationRef.current > 0 ? 1 : -1;
		wheelAccumulationRef.current = 0;
		lockedUntilTimestampRef.current = now + SKILLS_STACK.interactionLockMs;
		setNextActiveCardIndex(direction);
	}

	useEffect(() => {
		const stackNode = stackRef.current;
		if (!stackNode || !model.isScrollable) {
			return;
		}
		const interactiveStackNode: HTMLDivElement = stackNode;

		function handleNativeWheel(event: WheelEvent) {
			const eventTarget = event.target;
			if (!(eventTarget instanceof Element)) {
				return;
			}

			const cardElement = eventTarget.closest(".mymind-walk-in-skills-stage__card");
			if (!cardElement || !interactiveStackNode.contains(cardElement)) {
				return;
			}

			event.preventDefault();
			handleSkillsCardWheelDelta(event.deltaY);
		}

		interactiveStackNode.addEventListener("wheel", handleNativeWheel, { passive: false });
		return () => {
			interactiveStackNode.removeEventListener("wheel", handleNativeWheel);
		};
	}, [model.isScrollable, model.cards.length]);

	function handleSkillsCardTouchStart(event: TouchEvent<HTMLElement>) {
		if (!model.isScrollable) {
			return;
		}

		touchStartYRef.current = event.touches[0]?.clientY ?? null;
	}

	function handleSkillsCardTouchEnd(event: TouchEvent<HTMLElement>) {
		if (!model.isScrollable) {
			return;
		}

		const touchStartY = touchStartYRef.current;
		const touchEndY = event.changedTouches[0]?.clientY ?? null;
		touchStartYRef.current = null;

		if (touchStartY === null || touchEndY === null) {
			return;
		}

		const now = performance.now();
		if (now < lockedUntilTimestampRef.current) {
			return;
		}

		const deltaY = touchStartY - touchEndY;
		if (Math.abs(deltaY) < SKILLS_STACK.touchThresholdPx) {
			return;
		}

		lockedUntilTimestampRef.current = now + SKILLS_STACK.interactionLockMs;
		setNextActiveCardIndex(deltaY > 0 ? 1 : -1);
	}

	return (
		<section className="mymind-walk-in-skills-stage">
			<div className="mymind-walk-in-skills-stage__hero">
				<p className="mymind-walk-in-skills-stage__eyebrow">Skills board</p>
				<h2 className="mymind-walk-in-skills-stage__headline">
					{model.headline}
				</h2>
				{model.subline ? (
					<p className="mymind-walk-in-skills-stage__subline">{model.subline}</p>
				) : null}
			</div>

			<div ref={stackRef} className="mymind-walk-in-skills-stage__stack">
				<div
					className="mymind-walk-in-skills-stage__stack-track"
					style={
						{
							"--skills-stack-track-height": `${model.trackHeightRem}rem`,
						} as CSSProperties
					}
				>
					{model.cards.map((card, cardIndex) => (
						<article
							key={card.id}
							className={cn(
								"mymind-walk-in-skills-stage__card",
								cardIndex === activeCardIndex && "is-front",
							)}
							onTouchEnd={handleSkillsCardTouchEnd}
							onTouchStart={handleSkillsCardTouchStart}
							style={getSkillsCardStyle(cardIndex, activeCardIndex)}
						>
							<div
								className={cn(
									"mymind-walk-in-skills-stage__card-item",
									card.item.isPlaceholder && "is-placeholder",
								)}
							>
								<span className="mymind-walk-in-skills-stage__item-rank">
									{card.item.rank}
								</span>
								<div className="mymind-walk-in-skills-stage__item-copy">
									<p className="mymind-walk-in-skills-stage__item-name">
										{card.item.name}
									</p>
									<p className="mymind-walk-in-skills-stage__item-meta">
										{card.item.meta}
									</p>
								</div>
							</div>
						</article>
					))}
				</div>
			</div>

			<p className="mymind-walk-in-skills-stage__footnote">{model.footnote}</p>
		</section>
	);
}

function RepoPulseStage(props: {
	onboardingMetrics: WalkInOnboardingMetrics;
	previewState: string;
}) {
	const { onboardingMetrics, previewState } = props;
	const model = resolveRepoPulseStageModel(
		resolveRepoPulsePreviewInput(onboardingMetrics.repoPulse, previewState),
	);

	return (
		<section className="mymind-walk-in-repo-pulse-stage">
			<div className="mymind-walk-in-repo-pulse-stage__hero">
				<p className="mymind-walk-in-repo-pulse-stage__eyebrow">Repo pulse</p>
				<h2 className="mymind-walk-in-repo-pulse-stage__headline">
					{model.headline}
				</h2>
				<p className="mymind-walk-in-repo-pulse-stage__subline">
					{model.subline}
				</p>
			</div>

			<div className="mymind-walk-in-repo-pulse-stage__object">
				<article className="mymind-walk-in-repo-pulse-stage__card">
					<div className="mymind-walk-in-repo-pulse-stage__card-top">
						<div
							className="mymind-walk-in-repo-pulse-stage__card-dots"
							aria-hidden="true"
						>
							<span />
							<span />
							<span />
						</div>
						<div className="mymind-walk-in-repo-pulse-stage__card-chip">
							Where the work happened
						</div>
					</div>

					<div className="mymind-walk-in-repo-pulse-stage__section-head">
						<p className="mymind-walk-in-repo-pulse-stage__section-label">
							Top repos
						</p>
						<p className="mymind-walk-in-repo-pulse-stage__section-value">
							{model.totalSessionsLabel}
						</p>
					</div>

					<div className="mymind-walk-in-repo-pulse-stage__stack">
						{model.entries.map((entry) => (
							<article
								key={entry.id}
								className="mymind-walk-in-repo-pulse-stage__row"
							>
								<p className="mymind-walk-in-repo-pulse-stage__role">
									{entry.workType}
								</p>
								<div className="mymind-walk-in-repo-pulse-stage__row-copy">
									<p className="mymind-walk-in-repo-pulse-stage__repo">
										{entry.repoName}
									</p>
									<p className="mymind-walk-in-repo-pulse-stage__proof">
										{entry.proof}
									</p>
									<p className="mymind-walk-in-repo-pulse-stage__meta">
										{entry.meta}
									</p>
								</div>
							</article>
						))}

						{model.entries.length === 0 ? (
							<article className="mymind-walk-in-repo-pulse-stage__empty">
								Repo work types show up once a few project sessions land.
							</article>
						) : null}
					</div>
				</article>
			</div>

			<p className="mymind-walk-in-repo-pulse-stage__footnote">
				{model.footnote}
			</p>
		</section>
	);
}

function UploadStage(props: { previewState: string }) {
	const { previewState } = props;
	const model = resolveUploadStageModel(previewState);

	return (
		<section className="mymind-walk-in-upload-stage">
			<div className="mymind-walk-in-upload-card">
				<div className="mymind-walk-in-upload-card__summary">
					<p className="mymind-walk-in-upload-card__body">{model.cardBody}</p>
					{model.cardMeta ? (
						<p className="mymind-walk-in-upload-card__meta">{model.cardMeta}</p>
					) : null}
				</div>

				<UploadStageReel
					isUploading={model.isUploading}
					items={model.rollItems}
				/>

				<div
					className={cn(
						"mymind-walk-in-upload-card__tag",
						model.isUploading ? "is-uploading" : "is-ready",
					)}
				>
					{model.isUploading ? (
						<LoaderCircle className="size-4 animate-spin" />
					) : (
						<BadgeCheck className="size-4" />
					)}
					<span>{model.cardEyebrow}</span>
				</div>
			</div>
		</section>
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

function UploadStageReel(props: {
	isUploading: boolean;
	items: readonly UploadStageRollItem[];
}) {
	const { isUploading, items } = props;
	const shouldReduceMotion = useReducedMotion();
	const reduceMotion = shouldReduceMotion ?? false;
	const viewportRef = useRef<HTMLDivElement | null>(null);
	const [activeIndex, setActiveIndex] = useState(() =>
		getDefaultUploadReelIndex(items.length, isUploading),
	);

	useEffect(() => {
		const nextIndex = getDefaultUploadReelIndex(items.length, isUploading);
		setActiveIndex(nextIndex);
		scrollUploadReelToIndex({
			index: nextIndex,
			shouldReduceMotion: true,
			viewport: viewportRef.current,
		});
	}, [isUploading, items.length]);

	useEffect(() => {
		if (reduceMotion || !isUploading || items.length < 2) {
			return;
		}

		const intervalId = window.setInterval(() => {
			setActiveIndex((previousIndex) => {
				const nextIndex = (previousIndex + 1) % items.length;
				scrollUploadReelToIndex({
					index: nextIndex,
					shouldReduceMotion: reduceMotion,
					viewport: viewportRef.current,
				});
				return nextIndex;
			});
		}, UPLOAD_REEL_TIMING.advance);

		return () => {
			window.clearInterval(intervalId);
		};
	}, [isUploading, items.length, reduceMotion]);

	if (items.length === 0) {
		return null;
	}

	return (
		<div className="mymind-walk-in-upload-reel">
			<div
				ref={viewportRef}
				className="mymind-walk-in-upload-reel__viewport"
				onScroll={(event) => {
					handleUploadReelScroll({
						event,
						itemCount: items.length,
						onIndexChange: setActiveIndex,
					});
				}}
			>
				<div className="mymind-walk-in-upload-reel__list">
					{items.map((item, index) => {
						const relativePosition = getUploadReelRelativePosition({
							activeIndex,
							index,
							total: items.length,
						});
						const motionState = getUploadReelMotionState(relativePosition);

						return (
							<motion.div
								key={item.id}
								initial={false}
								animate={motionState}
								transition={UPLOAD_REEL.spring}
								className="mymind-walk-in-upload-reel__item"
								data-active={relativePosition === 0 ? "true" : "false"}
							>
								<p className="mymind-walk-in-upload-reel__label">
									{item.label}
								</p>
								<p className="mymind-walk-in-upload-reel__meta">{item.meta}</p>
							</motion.div>
						);
					})}
				</div>
			</div>
		</div>
	);
}

function handleUploadReelScroll(input: {
	event: UIEvent<HTMLDivElement>;
	itemCount: number;
	onIndexChange: (value: number | ((previousValue: number) => number)) => void;
}) {
	const { event, itemCount, onIndexChange } = input;

	if (itemCount <= 1) {
		return;
	}

	const nextIndex = Math.max(
		0,
		Math.min(
			itemCount - 1,
			Math.round(event.currentTarget.scrollTop / UPLOAD_REEL.itemHeight),
		),
	);

	onIndexChange((previousIndex) =>
		previousIndex === nextIndex ? previousIndex : nextIndex,
	);
}

function scrollUploadReelToIndex(input: {
	index: number;
	shouldReduceMotion: boolean;
	viewport: HTMLDivElement | null;
}) {
	const { index, shouldReduceMotion, viewport } = input;

	if (!viewport) {
		return;
	}

	viewport.scrollTo({
		top: index * UPLOAD_REEL.itemHeight,
		behavior: shouldReduceMotion ? "auto" : "smooth",
	});
}

function getDefaultUploadReelIndex(total: number, isUploading: boolean) {
	if (total <= 1 || isUploading) {
		return 0;
	}

	return total - 1;
}

function getUploadReelRelativePosition(input: {
	activeIndex: number;
	index: number;
	total: number;
}) {
	const { activeIndex, index, total } = input;

	if (total <= 1) {
		return 0;
	}

	const forwardDistance = (index - activeIndex + total) % total;

	if (forwardDistance === 0) {
		return 0;
	}

	if (forwardDistance === 1) {
		return 1;
	}

	if (forwardDistance === total - 1) {
		return -1;
	}

	return forwardDistance < total / 2 ? 2 : -2;
}

function getUploadReelMotionState(relativePosition: number) {
	switch (relativePosition) {
		case 0:
			return {
				opacity: UPLOAD_REEL.activeOpacity,
				scale: UPLOAD_REEL.activeScale,
				zIndex: 3,
			};
		case -1:
			return {
				opacity: UPLOAD_REEL.adjacentOpacity,
				scale: UPLOAD_REEL.adjacentScale,
				zIndex: 2,
			};
		case 1:
			return {
				opacity: UPLOAD_REEL.adjacentOpacity,
				scale: UPLOAD_REEL.adjacentScale,
				zIndex: 2,
			};
		default:
			return {
				opacity: UPLOAD_REEL.farOpacity,
				scale: UPLOAD_REEL.farScale,
				zIndex: 1,
			};
	}
}

function buildStepContent(input: {
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
			case "model":
				return (() => {
					const modelStage = resolveModelStageModel(
						resolveModelPreviewInput(
							{
								modelByMonth: onboardingMetrics.modelByMonth,
								sourceSplit: onboardingMetrics.sourceSplit,
							},
							previewState,
						),
					);
					return [
						{ text: modelStage.headline },
						{ text: modelStage.subline },
					];
				})();
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
		case "lock-in":
			return (() => {
				const lockInStage = resolveLockInStageModel(
					resolveLockInPreviewInput(
						{
							avgSessionMin: onboardingMetrics.avgSessionMin,
							longestSessionMin: onboardingMetrics.longestSessionMin,
						},
						previewState,
					),
				);
				return [
					{ text: lockInStage.headline },
					{ text: lockInStage.subline },
				];
			})();
		default:
			return [{ text: "" }];
	}
}


function resolveSkillsPreviewInput(
	input: {
		skillsAdoptionRate: number | null;
		topSkills: readonly WalkInSkillUsageItem[];
	},
	previewState: string,
) {
	switch (previewState) {
		case "dominant":
			return {
				topSkills: [
					{ name: "Refactor", count: 42 },
					{ name: "Plan", count: 27 },
					{ name: "Test", count: 18 },
					{ name: "Review", count: 15 },
					{ name: "Explain", count: 14 },
					{ name: "Research", count: 12 },
					{ name: "Extract", count: 10 },
					{ name: "Debug", count: 8 },
					{ name: "Write Docs", count: 7 },
					{ name: "Migrate", count: 5 },
				],
				skillsAdoptionRate: 68,
			};
		case "dominant-no-rate":
			return {
				topSkills: [
					{ name: "Refactor", count: 33 },
					{ name: "Plan", count: 19 },
					{ name: "Explain", count: 14 },
					{ name: "Review", count: 12 },
					{ name: "Research", count: 10 },
					{ name: "Test", count: 8 },
					{ name: "Extract", count: 6 },
					{ name: "Summarize", count: 5 },
					{ name: "Migrate", count: 4 },
				],
				skillsAdoptionRate: null,
			};
		case "usage-no-winner":
			return {
				topSkills: [
					{ name: "Plan", count: 14 },
					{ name: "Refactor", count: 13 },
					{ name: "Research", count: 12 },
					{ name: "Review", count: 11 },
					{ name: "Test", count: 11 },
					{ name: "Explain", count: 10 },
					{ name: "Debug", count: 9 },
					{ name: "Extract", count: 9 },
					{ name: "Summarize", count: 8 },
				],
				skillsAdoptionRate: 24,
			};
		case "single-skill":
			return {
				topSkills: [{ name: "Refactor", count: 11 }],
				skillsAdoptionRate: 18,
			};
		case "no-signal":
			return { topSkills: [], skillsAdoptionRate: null };
		default:
			return input;
	}
}

function resolveSkillsStageModel(input: {
	skillsAdoptionRate: number | null;
	topSkills: readonly WalkInSkillUsageItem[];
}) {
	const rankedSkills = input.topSkills.filter(
		(skill) => skill.name.trim().length > 0 && skill.count > 0,
	);
	const displayItems = rankedSkills.length > 0 ? [...rankedSkills] : [];

	const minimumVisibleItems = 3;
	while (displayItems.length < minimumVisibleItems) {
		displayItems.push(getSkillsPlaceholderItem(displayItems.length + 1));
	}

	const cardItems = displayItems.map((skill, index) => {
		const rank = index + 1;
		const isPlaceholder = skill.count === 0;

		return {
			id: `skill-rank-${rank}`,
			isPlaceholder,
			meta: isPlaceholder
				? getSkillsPlaceholderMeta(rank)
				: `${skill.count.toLocaleString()} use${skill.count === 1 ? "" : "s"}`,
			name: isPlaceholder ? getSkillsPlaceholderName(rank) : skill.name,
			rank,
		};
	});

	const cards = cardItems.map((item) => ({
		id: `skills-card-${item.rank}`,
		item,
	}));
	const visibleCardCount = Math.max(cards.length, SKILLS_STACK.visibleCards);
	const trackHeightRem =
		SKILLS_STACK.viewportHeightRem +
		(visibleCardCount - 1) * SKILLS_STACK.stepRem;
	const visibleSkillsCount = rankedSkills.length;
	const isScrollable = visibleSkillsCount > SKILLS_STACK.visibleCards;

	if (rankedSkills.length === 0) {
		return {
			cards,
			footnote:
				"No ranked skills yet. The board fills once the same skills start showing up more than once.",
			headline: "Your skill board is warming up",
			isScrollable,
			subline: "The first three repeat skills will stack here once the pattern settles.",
			trackHeightRem,
		};
	}

	if (rankedSkills.length === 1) {
		return {
			cards,
			footnote:
				input.skillsAdoptionRate === null
					? "Only one skill has enough signal to make the board so far."
					: `${formatPercent(input.skillsAdoptionRate)} of sessions pulled in a skill.`,
			headline: `${rankedSkills[0]?.name} took the lead`,
			isScrollable,
			subline: "The board has a leader now. The next two spots are still taking shape.",
			trackHeightRem,
		};
	}

	const leaderName = rankedSkills[0]?.name ?? "One skill";
	const footnote =
		isScrollable
			? `${visibleSkillsCount.toLocaleString()} skills ranked. Scroll or swipe the cards to see the full board.`
			: input.skillsAdoptionRate === null
			? "Skill adoption is still settling."
			: `${formatPercent(input.skillsAdoptionRate)} of sessions pulled in a skill.`;

	return {
		cards,
		footnote,
		headline: `${leaderName} leads the board`,
		isScrollable,
		subline: "A playful read on the skills that kept showing up.",
		trackHeightRem,
	};
}

function getSkillsPlaceholderName(rank: number) {
	if (rank <= 3) {
		return `Future pick ${rank}`;
	}
	if (rank <= 6) {
		return "Next contender";
	}
	return "Still forming";
}

function getSkillsPlaceholderMeta(rank: number) {
	if (rank <= 3) {
		return "Still warming up";
	}
	if (rank <= 6) {
		return "Waiting for repeat use";
	}
	return "One more run to get there";
}

function getSkillsPlaceholderItem(rank: number): WalkInSkillUsageItem {
	return {
		count: 0,
		name: `placeholder-${rank}`,
	};
}

const SKILLS_STACK = {
	focusTopRem: 5.35,
	interactionLockMs: 220,
	shadowBleedRem: 0.65,
	stepRem: 2.95,
	touchThresholdPx: 34,
	viewportHeightRem: 16.2,
	visibleCards: 3,
	wheelResetMs: 140,
	wheelThresholdPx: 36,
} as const;

function clampSkillsCardIndex(index: number, totalCards: number) {
	if (totalCards <= 0) {
		return 0;
	}

	return Math.min(Math.max(index, 0), totalCards - 1);
}

function getSkillsCardStyle(
	cardIndex: number,
	activeCardIndex: number,
): CSSProperties {
	const relativeDepth = cardIndex - activeCardIndex;
	const isVisibleDepth =
		relativeDepth >= -1 && relativeDepth < SKILLS_STACK.visibleCards - 1;
	const zIndex =
		relativeDepth === 0
			? 40
			: relativeDepth === -1
				? 30
				: relativeDepth === 1
					? 20
					: 10;

	const depthStyles =
		relativeDepth === -1
			? { rotateDeg: -7, scale: 0.968, translateZ: 16, widthPercent: 96 }
			: relativeDepth === 0
			? { rotateDeg: 0, scale: 1, translateZ: 52, widthPercent: 100 }
			: relativeDepth === 1
				? { rotateDeg: 8, scale: 0.962, translateZ: 16, widthPercent: 96 }
				: { rotateDeg: 12, scale: 0.93, translateZ: -4, widthPercent: 92 };

	return {
		"--skills-card-y": `${relativeDepth * SKILLS_STACK.stepRem}rem`,
		"--skills-card-scale": depthStyles.scale,
		"--skills-card-rotate": `${depthStyles.rotateDeg}deg`,
		"--skills-card-z": `${depthStyles.translateZ}px`,
		filter: isVisibleDepth ? "blur(0px)" : "blur(2px)",
		opacity: isVisibleDepth ? 1 : 0,
		pointerEvents: isVisibleDepth ? "auto" : "none",
		top: `${SKILLS_STACK.focusTopRem}rem`,
		width: `calc(${depthStyles.widthPercent}% - ${SKILLS_STACK.shadowBleedRem * 2}rem)`,
		zIndex,
	} as CSSProperties;
}

function resolveRepoPulsePreviewInput(
	input: WalkInRepoPulseMetrics,
	previewState: string,
) {
	switch (previewState) {
		case "single-home":
			return {
				entries: [
					{
						id: "repo-preview-geneva",
						meta: "84 sessions · 42h total",
						proof: "52m avg session",
						repoName: "geneva",
						workType: "Deep work",
					},
				],
				leadRepoName: "geneva",
				totalRepos: 1,
				totalSessions: 84,
			} satisfies WalkInRepoPulseMetrics;
		case "split-across":
			return {
				entries: [
					{
						id: "repo-preview-geneva",
						meta: "61 sessions · 31h total",
						proof: "48m avg session",
						repoName: "geneva",
						workType: "Deep work",
					},
					{
						id: "repo-preview-rudel-web",
						meta: "28 sessions · 17h total",
						proof: "43% used skills",
						repoName: "rudel-web",
						workType: "Skills-heavy",
					},
					{
						id: "repo-preview-api-routes",
						meta: "19 sessions · 1.8M tokens",
						proof: "94K tokens / session",
						repoName: "api-routes",
						workType: "Heavy lift",
					},
				],
				leadRepoName: "geneva",
				totalRepos: 6,
				totalSessions: 108,
			} satisfies WalkInRepoPulseMetrics;
		case "quiet":
			return {
				entries: [],
				leadRepoName: null,
				totalRepos: 0,
				totalSessions: 0,
			} satisfies WalkInRepoPulseMetrics;
		default:
			return input;
	}
}

function resolveRepoPulseStageModel(
	input: WalkInRepoPulseMetrics,
): RepoPulseStageModel {
	if (input.entries.length === 0) {
		return {
			entries: [],
			footnote: "A little more repo history and the pulse will settle into view.",
			headline: "Your repo pulse is still landing",
			subline:
				"When the work settles into projects, this view turns into repo-by-repo work types.",
			totalReposLabel: "No repo signal yet",
			totalSessionsLabel: "No sessions yet",
		};
	}

	if (input.entries.length === 1) {
		return {
			entries: input.entries,
			footnote:
				"Each label comes from the strongest signal inside that repo: tool adoption, depth, token load, or delivery.",
			headline: "One repo held onto the run",
			subline: "There was a clear home base before the final card reveal.",
			totalReposLabel: `${input.totalRepos} repo${input.totalRepos === 1 ? "" : "s"} in play`,
			totalSessionsLabel: `${input.totalSessions.toLocaleString()} sessions`,
		};
	}

	return {
		entries: input.entries,
		footnote:
			"Each label comes from the strongest signal inside that repo: tool adoption, depth, token load, or delivery.",
		headline:
			input.entries.length >= 3
				? "Each repo had its own rhythm"
				: "The work split across a couple repos",
		subline:
			input.entries.length >= 3
				? "The top repos were not interchangeable. Each one carried a different kind of work."
				: "Even the busiest repos ended up with different patterns of work.",
		totalReposLabel: `${input.totalRepos} repo${input.totalRepos === 1 ? "" : "s"} in play`,
		totalSessionsLabel: `${input.totalSessions.toLocaleString()} sessions`,
	};
}

function resolveToolsStageModel(input: {
	slashCommandsAdoptionRate: number | null;
	subagentsAdoptionRate: number | null;
	topSlashCommand: string | null;
	topSlashCommands: readonly WalkInSkillUsageItem[];
	topSlashCommandCount: number | null;
	topSubagent: string | null;
	topSubagents: readonly WalkInSkillUsageItem[];
	topSubagentCount: number | null;
	totalSessions: number;
}): ToolsStageModel {
	const liveEntries = buildToolsStageEntries(input);

	if (input.topSlashCommand === null && input.topSubagent === null) {
		return {
			entries: buildToolsPlaceholderEntries(),
			footnote:
				"These numbers are the share of sessions where each layer showed up, not raw invocation counts.",
			headline: "You stayed close to the base model",
			subline: "The extension layer is still quiet, so the readout stays intentionally spare.",
		};
	}

	if (input.topSlashCommand !== null && input.topSubagent !== null) {
		return {
			entries: liveEntries,
			footnote:
				"These are session-share numbers: how often that layer appeared in a session at least once.",
			headline: getToolsHeadline(input),
			subline:
				"One thing you reached for directly, one thing you handed work off to.",
		};
	}

	if (input.topSlashCommand !== null) {
		return {
			entries: liveEntries,
			footnote:
				"Session share is based on whether the layer appeared in the session, not how many times it fired.",
			headline: getToolsHeadline(input),
			subline:
				"One command pattern showed up clearly. The rest of the extension layer is still settling.",
		};
	}

	return {
		entries: liveEntries,
		footnote:
			"Session share is based on whether the layer appeared in the session, not how many times it fired.",
		headline: getToolsHeadline(input),
		subline:
			"The helper layer is visible already. Slash-command usage can stay quiet and that still tells a story.",
	};
}

function resolveToolsPreviewInput(
	input: {
		slashCommandsAdoptionRate: number | null;
		subagentsAdoptionRate: number | null;
		topSlashCommand: string | null;
		topSlashCommands: readonly WalkInSkillUsageItem[];
		topSlashCommandCount: number | null;
		topSubagent: string | null;
		topSubagents: readonly WalkInSkillUsageItem[];
		topSubagentCount: number | null;
		totalSessions: number;
	},
	previewState: string,
) {
	switch (previewState) {
		case "both":
			return {
				topSlashCommand: "/fix",
				topSlashCommands: [
					{ name: "/fix", count: 74 },
					{ name: "/plan", count: 29 },
				],
				topSlashCommandCount: 74,
				topSubagent: "Reviewer",
				topSubagents: [{ name: "Reviewer", count: 40 }],
				topSubagentCount: 40,
				slashCommandsAdoptionRate: 58,
				subagentsAdoptionRate: 31,
				totalSessions: 128,
			};
		case "slash-only":
			return {
				topSlashCommand: "/plan",
				topSlashCommands: [
					{ name: "/plan", count: 79 },
					{ name: "/test", count: 28 },
					{ name: "/review", count: 17 },
				],
				topSlashCommandCount: 79,
				topSubagent: null,
				topSubagents: [],
				topSubagentCount: null,
				slashCommandsAdoptionRate: 62,
				subagentsAdoptionRate: null,
				totalSessions: 127,
			};
		case "subagent-only":
			return {
				topSlashCommand: null,
				topSlashCommands: [],
				topSlashCommandCount: null,
				topSubagent: "Researcher",
				topSubagents: [
					{ name: "Researcher", count: 37 },
					{ name: "Reviewer", count: 22 },
				],
				topSubagentCount: 37,
				slashCommandsAdoptionRate: null,
				subagentsAdoptionRate: 29,
				totalSessions: 128,
			};
		case "base-model":
			return {
				topSlashCommand: null,
				topSlashCommands: [],
				topSlashCommandCount: null,
				topSubagent: null,
				topSubagents: [],
				topSubagentCount: null,
				slashCommandsAdoptionRate: null,
				subagentsAdoptionRate: null,
				totalSessions: input.totalSessions,
			};
		default:
			return input;
	}
}

function getToolsUsageLabel(rate: number, count: number | null) {
	if (count === null) {
		return `Used in ${formatPercent(rate)} of sessions`;
	}

	return `Used in ${formatPercent(rate)} of sessions (${count.toLocaleString()} ${
		count === 1 ? "time" : "times"
	})`;
}

function buildToolsStageEntries(input: {
	topSlashCommands: readonly WalkInSkillUsageItem[];
	topSubagents: readonly WalkInSkillUsageItem[];
	totalSessions: number;
}): readonly ToolsStageEntry[] {
	const totalSessions = Math.max(input.totalSessions, 0);
	const slashEntries = input.topSlashCommands.map((item, index) => ({
		count: item.count,
		id: `slash-command-${index}`,
		name: item.name,
	}));
	const subagentEntries = input.topSubagents.map((item, index) => ({
		count: item.count,
		id: `subagent-${index}`,
		name: item.name,
	}));

	return [...slashEntries, ...subagentEntries]
		.filter((item) => item.name.trim().length > 0 && item.count > 0)
		.sort(
			(leftItem, rightItem) =>
				rightItem.count - leftItem.count ||
				leftItem.name.localeCompare(rightItem.name),
		)
		.slice(0, 3)
		.map((item) => ({
			id: item.id,
			isPlaceholder: false,
			name: item.name,
			usageLabel: getToolsUsageLabel(
				totalSessions > 0 ? (item.count / totalSessions) * 100 : 0,
				item.count,
			),
			usageRate: totalSessions > 0 ? (item.count / totalSessions) * 100 : 0,
		}));
}

function buildToolsPlaceholderEntries(): readonly ToolsStageEntry[] {
	return [
		{
			id: "tools-placeholder-1",
			isPlaceholder: true,
			name: "Waiting for a repeat winner",
			usageLabel: "Session share still landing",
			usageRate: null,
		},
		{
			id: "tools-placeholder-2",
			isPlaceholder: true,
			name: "Still forming",
			usageLabel: "Nothing ranked yet",
			usageRate: null,
		},
	] as const;
}

function getToolsStackHeightRem(entryCount: number) {
	if (entryCount >= 3) {
		return 17.4;
	}

	if (entryCount === 2) {
		return 11.4;
	}

	return 6.9;
}

function getToolsEntryStyle(
	entryIndex: number,
	totalEntries: number,
	activeCardIndex: number,
): CSSProperties {
	const stackOrder = [
		activeCardIndex,
		...Array.from({ length: totalEntries }, (_, index) => index).filter(
			(index) => index !== activeCardIndex,
		),
	];
	const stackLayer = Math.max(0, stackOrder.indexOf(entryIndex));
	const styles =
		totalEntries <= 1
			? {
					rotate: "-1deg",
					scale: 1,
					translateX: "-50%",
					translateY: "0rem",
					zIndex: 30,
				}
			: totalEntries === 2
				? stackLayer === 0
					? {
							rotate: "-1.25deg",
							scale: 1,
							translateX: "-50%",
							translateY: "0rem",
							zIndex: 20,
						}
					: {
							rotate: "3deg",
							scale: 0.985,
							translateX: "-49.5%",
							translateY: "4rem",
							zIndex: 10,
						}
				: stackLayer === 0
					? {
							rotate: "-1.25deg",
							scale: 1,
							translateX: "-50%",
							translateY: "0rem",
							zIndex: 30,
						}
					: stackLayer === 1
						? {
								rotate: "3deg",
								scale: 0.988,
								translateX: "-49.2%",
								translateY: "4.2rem",
								zIndex: 20,
							}
						: {
								rotate: "-3.25deg",
								scale: 0.976,
								translateX: "-50.8%",
								translateY: "8.2rem",
								zIndex: 10,
							};

	return {
		"--tools-card-rotate": styles.rotate,
		"--tools-card-scale": styles.scale,
		"--tools-card-translate-x": styles.translateX,
		"--tools-card-translate-y": styles.translateY,
		zIndex: styles.zIndex,
	} as CSSProperties;
}

function resolveModelPreviewInput(
	input: {
		modelByMonth: readonly MonthlyModelUsage[];
		sourceSplit: readonly WrappedSourceSplit[];
	},
	previewState: string,
) {
	switch (previewState) {
		case "favorite":
			return {
				modelByMonth: buildPreviewMonthlyModelUsage([
					["2026-01", "Claude Sonnet 4", 28],
					["2026-01", "GPT-4.1", 8],
					["2026-02", "Claude Sonnet 4", 25],
					["2026-02", "GPT-4.1", 6],
					["2026-03", "Claude Sonnet 4", 24],
					["2026-03", "GPT-4.1", 7],
					["2026-04", "Claude Sonnet 4", 29],
					["2026-04", "GPT-4.1", 8],
					["2026-05", "Claude Sonnet 4", 27],
					["2026-05", "GPT-4.1", 7],
					["2026-06", "Claude Sonnet 4", 31],
					["2026-06", "GPT-4.1", 9],
				]),
				sourceSplit: buildPreviewSourceSplit([
					["claude_code", 78],
					["codex", 22],
				]),
			};
		case "played-field":
			return {
				modelByMonth: buildPreviewMonthlyModelUsage([
					["2026-01", "Claude Sonnet 4", 14],
					["2026-01", "GPT-4.1", 13],
					["2026-01", "Gemini 2.5 Pro", 11],
					["2026-02", "GPT-4.1", 15],
					["2026-02", "Claude Sonnet 4", 14],
					["2026-02", "Gemini 2.5 Pro", 12],
					["2026-03", "Gemini 2.5 Pro", 13],
					["2026-03", "Claude Sonnet 4", 12],
					["2026-03", "GPT-4.1", 12],
					["2026-04", "Claude Sonnet 4", 16],
					["2026-04", "GPT-4.1", 15],
					["2026-04", "Gemini 2.5 Pro", 12],
					["2026-05", "GPT-4.1", 14],
					["2026-05", "Claude Sonnet 4", 13],
					["2026-05", "Gemini 2.5 Pro", 13],
					["2026-06", "Claude Sonnet 4", 15],
					["2026-06", "GPT-4.1", 15],
					["2026-06", "Gemini 2.5 Pro", 11],
				]),
				sourceSplit: buildPreviewSourceSplit([
					["claude_code", 51],
					["codex", 49],
				]),
			};
		case "single-switch":
			return {
				modelByMonth: buildPreviewMonthlyModelUsage([
					["2026-01", "Claude Sonnet 4", 22],
					["2026-01", "GPT-4.1", 8],
					["2026-02", "Claude Sonnet 4", 18],
					["2026-02", "GPT-4.1", 7],
					["2026-03", "GPT-4.1", 25],
					["2026-03", "Claude Sonnet 4", 11],
					["2026-04", "GPT-4.1", 29],
					["2026-04", "Claude Sonnet 4", 9],
				]),
				sourceSplit: buildPreviewSourceSplit([
					["claude_code", 42],
					["codex", 58],
				]),
			};
		case "exploring":
			return {
				modelByMonth: buildPreviewMonthlyModelUsage([
					["2026-01", "Claude Sonnet 4", 18],
					["2026-01", "GPT-4.1", 12],
					["2026-02", "GPT-4.1", 17],
					["2026-02", "Claude Sonnet 4", 14],
					["2026-03", "Gemini 2.5 Pro", 15],
					["2026-03", "Claude Sonnet 4", 11],
					["2026-04", "Claude Sonnet 4", 19],
					["2026-04", "GPT-4.1", 14],
					["2026-05", "GPT-4.1", 16],
					["2026-05", "Gemini 2.5 Pro", 13],
				]),
				sourceSplit: buildPreviewSourceSplit([
					["claude_code", 55],
					["codex", 45],
				]),
			};
		case "settled":
			return {
				modelByMonth: buildPreviewMonthlyModelUsage([
					["2026-01", "Claude Sonnet 4", 18],
					["2026-01", "GPT-4.1", 11],
					["2026-02", "Claude Sonnet 4", 19],
					["2026-02", "GPT-4.1", 12],
					["2026-03", "GPT-4.1", 21],
					["2026-03", "Claude Sonnet 4", 14],
					["2026-04", "GPT-4.1", 22],
					["2026-04", "Claude Sonnet 4", 13],
					["2026-05", "Claude Sonnet 4", 17],
					["2026-05", "GPT-4.1", 18],
					["2026-06", "GPT-4.1", 24],
					["2026-06", "Claude Sonnet 4", 14],
					["2026-07", "GPT-4.1", 26],
					["2026-07", "Claude Sonnet 4", 11],
				]),
				sourceSplit: buildPreviewSourceSplit([
					["claude_code", 39],
					["codex", 61],
				]),
			};
		case "rotation":
			return {
				modelByMonth: buildPreviewMonthlyModelUsage([
					["2026-01", "Claude Sonnet 4", 18],
					["2026-01", "GPT-4.1", 12],
					["2026-02", "Claude Sonnet 4", 21],
					["2026-02", "GPT-4.1", 9],
					["2026-03", "GPT-4.1", 19],
					["2026-03", "Claude Sonnet 4", 16],
					["2026-04", "GPT-4.1", 17],
					["2026-04", "Claude Sonnet 4", 15],
					["2026-05", "Claude Sonnet 4", 22],
					["2026-05", "GPT-4.1", 11],
					["2026-06", "Claude Sonnet 4", 24],
					["2026-06", "GPT-4.1", 10],
				]),
				sourceSplit: buildPreviewSourceSplit([
					["claude_code", 57],
					["codex", 43],
				]),
			};
		default:
			return input;
	}
}

function buildPreviewMonthlyModelUsage(
	entries: readonly [string, string, number][],
): MonthlyModelUsage[] {
	return entries.map(([month, model, sessionCount]) => ({
		month,
		model,
		session_count: sessionCount,
	}));
}

function buildPreviewSourceSplit(
	entries: readonly [WrappedSourceSplit["source"], number][],
): WrappedSourceSplit[] {
	return entries.map(([source, sessionSharePercent]) => ({
		source,
		session_count: Math.round(sessionSharePercent),
		session_share_percent: sessionSharePercent,
	}));
}

function resolveModelStageModel(input: {
	modelByMonth: readonly MonthlyModelUsage[];
	sourceSplit: readonly WrappedSourceSplit[];
}): ModelStageModel {
	const months = buildModelShareMonths(input.modelByMonth);
	const summary = buildModelShareSummary(input.sourceSplit);
	const sourceSplit = summarizeModelSourceSplit(summary);
	const activeMonths = months.filter((month) => month.totalSessions > 0);
	const distinctLeaders = new Set(
		activeMonths.map((month) => month.leaderLabel),
	).size;
	const latestLeader = activeMonths[activeMonths.length - 1]?.leaderLabel ?? null;
	const earliestLeader = activeMonths[0]?.leaderLabel ?? null;
	const overallLeader = sourceSplit.leadingLabel ?? latestLeader;
	const headline =
		summary.length === 0 && activeMonths.length === 0
			? "Your Claude vs Codex split is warming up"
			: sourceSplit.isBalanced
				? "You kept both tools in play"
				: distinctLeaders <= 1 && overallLeader
					? `${overallLeader} held the line`
					: earliestLeader && latestLeader && earliestLeader !== latestLeader
						? `${latestLeader} took the latest stretch`
						: overallLeader
							? `${overallLeader} led the run`
							: "Your tool split kept moving";
	const subline =
		summary.length === 0 && activeMonths.length === 0
			? "We will chart Claude and Codex once enough history lands."
			: activeMonths.length === 0
				? "The full-run split is ready. The month-by-month view needs a little more history."
				: sourceSplit.isBalanced
					? "The all-time bar stayed close, and the monthly stacks kept both tools in rotation."
					: earliestLeader && latestLeader && earliestLeader !== latestLeader
						? `${earliestLeader} led early, then ${latestLeader} took the latest month.`
						: overallLeader
							? `The full-run bar and the monthly stacks both leaned ${overallLeader}.`
							: "The top bar shows the full-run split. The six stacks show how it moved month to month.";
	const totalSessions = summary.reduce(
		(sum, segment) => sum + segment.sessionCount,
		0,
	);

	return {
		footnote:
			"Top bar uses the entire run. The six monthly stacks collapse model history into Claude vs Codex.",
		headline,
		months,
		monthsLabel: `${activeMonths.length} active month${activeMonths.length === 1 ? "" : "s"}`,
		subline,
		summary,
		totalSessionsLabel:
			totalSessions > 0
				? `${totalSessions.toLocaleString()} sessions`
				: "No sessions yet",
	};
}

function buildModelShareMonths(
	modelByMonth: readonly MonthlyModelUsage[],
): WalkInModelShareMonth[] {
	const rowsByMonth = buildModelSourceCountsByMonth(modelByMonth);
	const months = getLatestModelStageMonthKeys([...rowsByMonth.keys()]);

	if (months.length === 0) {
		return [];
	}

	return months.map((month) => {
		const monthCounts = rowsByMonth.get(month) ?? new Map();
		const sourceCounts = MODEL_STAGE_SOURCE_ORDER.map((source) => ({
			label: formatModelStageSourceLabel(source),
			sessionCount: monthCounts.get(source) ?? 0,
			source,
		}));
		const totalSessions = sourceCounts.reduce(
			(sum, sourceEntry) => sum + sourceEntry.sessionCount,
			0,
		);
		const leader = [...sourceCounts].sort(
			(leftEntry, rightEntry) =>
				rightEntry.sessionCount - leftEntry.sessionCount ||
				leftEntry.label.localeCompare(rightEntry.label),
		)[0];
		const segments = sourceCounts.flatMap((sourceEntry) =>
			sourceEntry.sessionCount > 0
				? [
						{
							id: `${month}:${sourceEntry.source}`,
							label: sourceEntry.label,
							sessionCount: sourceEntry.sessionCount,
							share: (sourceEntry.sessionCount / totalSessions) * 100,
							source: sourceEntry.source,
						},
					]
				: [],
		);

		if (totalSessions <= 0) {
			return {
				id: `model-month-${month}`,
				label: formatMonthTickLabel(month),
				leaderLabel: "No activity",
				leaderShare: 0,
				segments: [],
				totalSessions: 0,
			};
		}

		return {
			id: `model-month-${month}`,
			label: formatMonthTickLabel(month),
			leaderLabel: leader?.label ?? "No activity",
			leaderShare: Math.round(
				((leader?.sessionCount ?? 0) / totalSessions) * 100,
			),
			segments,
			totalSessions,
		};
	});
}

function buildModelShareSummary(
	sourceSplit: readonly WrappedSourceSplit[],
): WalkInModelShareSegment[] {
	const summaryRows = MODEL_STAGE_SOURCE_ORDER.map((source) => ({
		label: formatModelStageSourceLabel(source),
		sessionCount:
			sourceSplit.find((sourceEntry) => sourceEntry.source === source)
				?.session_count ?? 0,
		sessionShare:
			sourceSplit.find((sourceEntry) => sourceEntry.source === source)
				?.session_share_percent ?? 0,
		source,
	})).filter(
		(sourceEntry) =>
			sourceEntry.sessionCount > 0 || sourceEntry.sessionShare > 0,
	);

	if (summaryRows.length === 0) {
		return [];
	}

	const totalSessions = summaryRows.reduce(
		(sum, sourceEntry) => sum + sourceEntry.sessionCount,
		0,
	);

	return summaryRows.map((sourceEntry) => ({
		id: `model-summary-${sourceEntry.source}`,
		label: sourceEntry.label,
		sessionCount: sourceEntry.sessionCount,
		share:
			totalSessions > 0
				? (sourceEntry.sessionCount / totalSessions) * 100
				: sourceEntry.sessionShare,
		source: sourceEntry.source,
	}));
}

function buildModelSourceCountsByMonth(modelByMonth: readonly MonthlyModelUsage[]) {
	const rowsByMonth = new Map<string, Map<WrappedSourceSplit["source"], number>>();

	for (const row of modelByMonth) {
		const source = resolveModelStageSource(row.model);
		if (!source || row.session_count <= 0) {
			continue;
		}

		const monthCounts = rowsByMonth.get(row.month) ?? new Map();
		monthCounts.set(source, (monthCounts.get(source) ?? 0) + row.session_count);
		rowsByMonth.set(row.month, monthCounts);
	}

	return rowsByMonth;
}

function getLatestModelStageMonthKeys(months: readonly string[]) {
	const uniqueMonths = [...new Set(months)].sort();
	const latestMonth = uniqueMonths[uniqueMonths.length - 1];
	if (!latestMonth) {
		return [];
	}

	const [yearPart, monthPart] = latestMonth.split("-");
	const monthIndex = Number(monthPart) - 1;
	if (!yearPart || !monthPart || Number.isNaN(monthIndex)) {
		return uniqueMonths.slice(-6);
	}

	const latestDate = new Date(Date.UTC(Number(yearPart), monthIndex, 1));
	if (Number.isNaN(latestDate.getTime())) {
		return uniqueMonths.slice(-6);
	}

	return Array.from({ length: 6 }, (_, index) => {
		const date = new Date(latestDate);
		date.setUTCMonth(date.getUTCMonth() - (5 - index));
		return [
			date.getUTCFullYear().toString(),
			String(date.getUTCMonth() + 1).padStart(2, "0"),
		].join("-");
	});
}

function summarizeModelSourceSplit(summary: readonly WalkInModelShareSegment[]) {
	const claudeShare = Math.round(
		summary.find((segment) => segment.source === "claude_code")?.share ?? 0,
	);
	const codexShare = Math.round(
		summary.find((segment) => segment.source === "codex")?.share ?? 0,
	);
	const rankedSegments = [...summary].sort(
		(leftSegment, rightSegment) =>
			rightSegment.share - leftSegment.share ||
			leftSegment.label.localeCompare(rightSegment.label),
	);

	return {
		claudeShare,
		codexShare,
		hasSignal: claudeShare > 0 || codexShare > 0,
		isBalanced: Math.abs(claudeShare - codexShare) <= 8,
		leadingLabel: rankedSegments[0]?.label ?? null,
	};
}

function resolveModelStageSource(
	model: string | null | undefined,
): WrappedSourceSplit["source"] | null {
	const modelLabel = formatModelLabel(model)?.toLowerCase();
	if (!modelLabel) {
		return null;
	}

	// This beat is intentionally framed as Claude vs Codex, so non-Claude rows roll into Codex.
	return modelLabel.includes("claude") ? "claude_code" : "codex";
}

const MODEL_STAGE_SOURCE_ORDER = ["claude_code", "codex"] as const;

const MODEL_STAGE_TONES: Record<WrappedSourceSplit["source"], string> = {
	claude_code: "#ff9a2f",
	codex: "#2d6df6",
};

function formatModelStageSourceLabel(source: WrappedSourceSplit["source"]) {
	return source === "claude_code" ? "Claude" : "Codex";
}

function getModelStageTone(source: WrappedSourceSplit["source"]) {
	return MODEL_STAGE_TONES[source];
}

function formatMonthTickLabel(month: string) {
	const [year, monthPart] = month.split("-");
	if (!year || !monthPart) {
		return month;
	}

	const monthIndex = Number(monthPart) - 1;
	if (!Number.isInteger(monthIndex) || monthIndex < 0 || monthIndex > 11) {
		return month;
	}

	const date = new Date(Date.UTC(Number(year), monthIndex, 1));
	return date.toLocaleString("en", { month: "short" });
}

function resolveScalePreviewTokens(totalTokens: number, previewState: string) {
	switch (previewState) {
		case "missing":
			return 0;
		case "essay":
			return 60_000;
		case "novella":
			return 220_000;
		case "novels":
			return 2_400_000;
		case "war-and-peace":
			return 12_400_000;
		default:
			return totalTokens;
	}
}

function resolveScaleStageModel(totalTokens: number): ScaleStageModel {
	if (totalTokens <= 0) {
		return {
			displayBallCount: 0,
			footnote:
				"The rain uses a compressed visual scale so large token totals still fit inside one phone-sized story page.",
			headline: "Your token pile is still warming up",
			showsMinimumFloor: false,
			subline:
				"Once tokens land, the whole page turns into a token shower instead of another raw metric card.",
			totalTokens,
		};
	}

	const { displayBallCount, showsMinimumFloor } =
		getScaleBallCountSummary(totalTokens);
	const headline =
		totalTokens >= 10_000_000
			? "The token pile got absurd"
			: totalTokens >= 1_000_000
				? "The token pile got heavy"
				: totalTokens >= 200_000
					? "The token pile started stacking up"
					: "The token pile is getting started";
	const subline = showsMinimumFloor
		? "Even smaller totals get the same visual floor, so the page still fills with rain instead of a stub."
		: "Ball count compresses the total so the rain reads at a glance instead of as another metric card.";

	return {
		displayBallCount,
		footnote:
			"Each ball stands in for a chunk of tokens, not a single session. The count is compressed to keep the full-screen shower readable.",
		headline,
		showsMinimumFloor,
		subline,
		totalTokens,
	};
}

function clampNumber(value: number, min: number, max: number) {
	return Math.min(max, Math.max(min, value));
}

function createScaleRainSeededRandom(seed: number) {
	let state = seed % 2147483647;

	if (state <= 0) {
		state += 2147483646;
	}

	return () => {
		state = (state * 16807) % 2147483647;
		return (state - 1) / 2147483646;
	};
}

function getScaleBallCountSummary(totalTokens: number) {
	if (totalTokens <= 0) {
		return {
			displayBallCount: 0,
			showsMinimumFloor: false,
		};
	}

	const computedBallCount = Math.max(
		1,
		Math.round(totalTokens / SCALE_STAGE_TOKENS_PER_BALL),
	);
	const showsMinimumFloor = computedBallCount < SCALE_STAGE_MIN_BALL_COUNT;

	return {
		displayBallCount: showsMinimumFloor
			? SCALE_STAGE_MIN_BALL_COUNT
			: computedBallCount,
		showsMinimumFloor,
	};
}

function buildScaleRainBalls(totalTokens: number): ScaleRainBall[] {
	const { displayBallCount } = getScaleBallCountSummary(totalTokens);
	if (displayBallCount <= 0) {
		return [];
	}

	const visibleBallCount = Math.min(displayBallCount, 72);
	const random = createScaleRainSeededRandom(
		Math.max(1, Math.floor(totalTokens)),
	);
	const columnCount = Math.min(
		16,
		Math.max(6, Math.ceil(Math.sqrt(visibleBallCount * 1.25))),
	);
	const rowCount = Math.ceil(visibleBallCount / columnCount);

	return Array.from({ length: visibleBallCount }, (_, index) => {
		const lane = index % columnCount;
		const row = Math.floor(index / columnCount);
		const laneCenter = (lane + 0.5) / columnCount;
		const laneJitter = (random() - 0.5) * (0.72 / columnCount);
		const leftPercent = clampNumber((laneCenter + laneJitter) * 100, 4, 96);
			const sizePx = Math.round(
				24 + random() * 28 + (1 - row / Math.max(rowCount, 1)) * 10,
			);
			const tintBand = index % 5;
			const hue =
				tintBand <= 3
					? 28 + random() * 14
					: 214 + random() * 16;

		return {
			delayMs: Math.round(random() * 3000 + row * 120 + lane * 32),
			driftPx: Math.round((random() - 0.5) * Math.max(56, 132 - row * 5)),
			durationMs: Math.round(3600 + random() * 1900 + row * 85),
			endRotationDeg: (random() - 0.5) * 56,
			hue,
			id: `scale-rain-ball-${index}`,
			leftPercent,
			sizePx,
			startRotationDeg: (random() - 0.5) * 120,
			startYOffsetPx: Math.round(72 + random() * 160 + row * 26),
			staticTopSvh: clampNumber(12 + row * 8 + random() * 10, 10, 82),
			zIndex: 8 + row,
		} satisfies ScaleRainBall;
	});
}

function getScaleRainBallStyle(ball: ScaleRainBall): CSSProperties {
	return {
		"--scale-rain-ball-delay": `${ball.delayMs}ms`,
		"--scale-rain-ball-drift-end": `${ball.driftPx}px`,
		"--scale-rain-ball-drift-start": `${Math.round(ball.driftPx * -0.35)}px`,
		"--scale-rain-ball-duration": `${ball.durationMs}ms`,
		"--scale-rain-ball-end-rotation": `${ball.endRotationDeg}deg`,
		"--scale-rain-ball-start-rotation": `${ball.startRotationDeg}deg`,
		"--scale-rain-ball-start-y": `${-ball.startYOffsetPx}px`,
		"--scale-rain-ball-static-y": `${ball.staticTopSvh}svh`,
		height: `${ball.sizePx}px`,
		left: `${ball.leftPercent}%`,
		marginLeft: `${-ball.sizePx / 2}px`,
		width: `${ball.sizePx}px`,
		zIndex: ball.zIndex,
	} as CSSProperties;
}

function getScaleRainBallCoreStyle(ball: ScaleRainBall): CSSProperties {
	const fillLightness = ball.hue < 120 ? "82%" : "84%";

	return {
		backgroundColor: `hsl(${ball.hue} 56% ${fillLightness})`,
		border: "1px solid rgba(255, 255, 255, 0.42)",
	};
}

function resolveLockInPreviewInput(
	input: {
		avgSessionMin: number | null;
		longestSessionMin: number | null;
	},
	previewState: string,
) {
	switch (previewState) {
		case "none":
			return { avgSessionMin: 38, longestSessionMin: 24 };
		case "stretched":
			return { avgSessionMin: 62, longestSessionMin: 88 };
		case "got-away":
			return { avgSessionMin: 55, longestSessionMin: 136 };
		case "didnt-end":
			return { avgSessionMin: 54, longestSessionMin: 288 };
		default:
			return input;
	}
}

function resolveLockInStageModel(input: {
	avgSessionMin: number | null;
	longestSessionMin: number | null;
}): LockInStageModel {
	const longestSessionMin =
		input.longestSessionMin && input.longestSessionMin > 0
			? input.longestSessionMin
			: null;
	const avgSessionMin =
		input.avgSessionMin && input.avgSessionMin > 0 ? input.avgSessionMin : null;

	if (longestSessionMin === null) {
		return {
			averageDurationLabel: "No average yet",
			averageShare: 0,
			comparisonLabel: "No recorded duration yet",
			footnote:
				"Longest session is all time. Usual session uses average duration over the analytics window.",
			headline: "Your session rhythm is still landing",
			longestDurationLabel: "No record yet",
			longestShare: 0,
			state: "missing",
			stateLabel: "Still landing",
			subline:
				"We will compare the longest recorded session to your usual session length once more history lands.",
		};
	}

	const overrunMin =
		avgSessionMin !== null ? longestSessionMin - avgSessionMin : null;
	const ratio =
		avgSessionMin !== null && avgSessionMin > 0
			? longestSessionMin / avgSessionMin
			: null;
	const comparisonMaxDuration = Math.max(
		longestSessionMin,
		avgSessionMin ?? longestSessionMin,
	);
	const state = getLockInStageState({
		avgSessionMin,
		longestSessionMin,
		overrunMin,
		ratio,
	});
	const longestDurationLabel = formatDurationMinutes(longestSessionMin);
	const averageDurationLabel =
		avgSessionMin !== null ? formatDurationMinutes(avgSessionMin) : "No average yet";
	const comparisonLabel =
		overrunMin === null
			? "Average still catching up"
			: overrunMin <= 0
				? "Stayed inside your usual pace"
				: `+${formatDurationMinutes(overrunMin)} over usual`;

	return {
		averageDurationLabel,
		averageShare: getLockInStageShare(avgSessionMin, comparisonMaxDuration),
		comparisonLabel,
		footnote:
			"Longest session is all time. Usual session uses average duration over the analytics window.",
		headline: getLockInStageHeadline(state, longestSessionMin),
		longestDurationLabel,
		longestShare: getLockInStageShare(
			longestSessionMin,
			comparisonMaxDuration,
		),
		state,
		stateLabel: getLockInStageStateLabel(state, ratio),
		subline: getLockInStageSubline({
			avgSessionMin,
			longestDurationLabel,
			overrunMin,
			ratio,
			state,
		}),
	};
}

function getLockInStageState(input: {
	avgSessionMin: number | null;
	longestSessionMin: number;
	overrunMin: number | null;
	ratio: number | null;
}): LockInStageState {
	const { avgSessionMin, longestSessionMin, overrunMin, ratio } = input;

	if (avgSessionMin !== null) {
		if ((overrunMin ?? 0) <= 0) {
			return "settled";
		}
		if ((ratio ?? 0) > 4) {
			return "didnt-end";
		}
		if ((ratio ?? 0) >= 2) {
			return "got-away";
		}
		return "stretched";
	}

	if (longestSessionMin < 30) {
		return "settled";
	}
	if (longestSessionMin >= 180) {
		return "didnt-end";
	}
	if (longestSessionMin >= 90) {
		return "got-away";
	}
	return "stretched";
}

function getLockInStageShare(
	durationMin: number | null,
	maxDurationMin: number,
) {
	if (durationMin === null || durationMin <= 0 || maxDurationMin <= 0) {
		return 0;
	}

	return Math.min(
		100,
		Math.max(18, Math.round((durationMin / maxDurationMin) * 100)),
	);
}

function getLockInStageHeadline(
	state: LockInStageState,
	longestSessionMin: number,
) {
	switch (state) {
		case "settled":
			return longestSessionMin < 30
				? "Your sessions stayed contained"
				: "Your sessions stayed in rhythm";
		case "stretched":
			return "One session stretched past the usual";
		case "got-away":
			return "One session got away from you";
		case "didnt-end":
			return "One session did not want to end";
		case "missing":
			return "Your session rhythm is still landing";
	}
}

function getLockInStageStateLabel(
	state: LockInStageState,
	ratio: number | null,
) {
	switch (state) {
		case "settled":
			return "Contained";
		case "stretched":
			return ratio !== null ? `${ratio.toFixed(1)}x usual` : "Stretched";
		case "got-away":
			return ratio !== null ? `${ratio.toFixed(1)}x usual` : "Runaway";
		case "didnt-end":
			return ratio !== null ? `${ratio.toFixed(1)}x usual` : "Marathon";
		case "missing":
			return "Still landing";
	}
}

function getLockInStageSubline(input: {
	avgSessionMin: number | null;
	longestDurationLabel: string;
	overrunMin: number | null;
	ratio: number | null;
	state: LockInStageState;
}) {
	const { avgSessionMin, longestDurationLabel, overrunMin, ratio, state } = input;
	const averageDurationLabel =
		avgSessionMin !== null ? formatDurationMinutes(avgSessionMin) : null;

	switch (state) {
		case "settled":
			return averageDurationLabel
				? `${longestDurationLabel} was the longest recorded run. Your usual session sits around ${averageDurationLabel}.`
				: `${longestDurationLabel} was your longest recorded session, without turning into a runaway.`;
		case "stretched":
			return averageDurationLabel
				? `${longestDurationLabel} was the record. A usual session sits around ${averageDurationLabel}.`
				: `${longestDurationLabel} was the record run, even though the average session is still catching up.`;
		case "got-away":
			return averageDurationLabel && overrunMin !== null
				? `${longestDurationLabel} ran ${formatDurationMinutes(overrunMin)} past a usual ${averageDurationLabel}.`
				: `${longestDurationLabel} clearly ran longer than your normal rhythm.`;
		case "didnt-end":
			return averageDurationLabel && ratio !== null
				? `${longestDurationLabel} landed at ${ratio.toFixed(1)}x your usual ${averageDurationLabel}.`
				: `${longestDurationLabel} stretched well past a normal session.`;
		case "missing":
			return "We will compare the longest recorded session to your usual session length once more history lands.";
	}
}

function resolveQualityPreviewInput(
	input: {
		commitRate: number | null;
		successRate: number | null;
	},
	previewState: string,
) {
	switch (previewState) {
		case "strong":
			return { commitRate: 72, successRate: 88 };
		case "lands-commits-lag":
			return { commitRate: 41, successRate: 86 };
		case "ship-through-mess":
			return { commitRate: 67, successRate: 56 };
		case "iterate":
			return { commitRate: 34, successRate: 43 };
		case "lands-only":
			return { commitRate: null, successRate: 84 };
		case "iterating-only":
			return { commitRate: null, successRate: 47 };
		case "commit-only-high":
			return { commitRate: 64, successRate: null };
		case "commit-only-low":
			return { commitRate: 28, successRate: null };
		case "no-signal":
			return { commitRate: null, successRate: null };
		default:
			return input;
	}
}

function resolveQualityStageModel(input: {
	commitRate: number | null;
	successRate: number | null;
}): QualityStageModel {
	const commitRate =
		input.commitRate !== null ? clampNumber(input.commitRate, 0, 100) : null;
	const successRate =
		input.successRate !== null ? clampNumber(input.successRate, 0, 100) : null;
	const state = getQualityStageState({ commitRate, successRate });

	return {
		comparisonLabel: getQualityStageComparisonLabel({
			commitRate,
			successRate,
		}),
		commitRateLabel: formatRateOrPending(commitRate),
		commitShare: getQualityStageShare(commitRate),
		footnote:
			"Commit rate and success rate come from the developer analytics window. Missing lanes mean that signal has not landed yet.",
		hasCommitRate: commitRate !== null,
		hasSuccessRate: successRate !== null,
		headline: getQualityStageHeadline({
			commitRate,
			state,
			successRate,
		}),
		state,
		stateLabel: getQualityStageStateLabel({
			commitRate,
			state,
			successRate,
		}),
		subline: getQualityStageSubline({
			commitRate,
			state,
			successRate,
		}),
		successRateLabel: formatRateOrPending(successRate),
		successShare: getQualityStageShare(successRate),
	};
}

function formatModelLabel(value: string | null | undefined) {
	const trimmed = value?.trim();
	if (!trimmed || trimmed.toLowerCase() === "unknown") {
		return null;
	}
	return trimmed;
}

function buildScaleContent(totalTokens: number): WalkInStepContentLine[] {
	if (totalTokens <= 0) {
		return [
			{ text: `Token count is still catching up.` },
			{ text: `Come back once the ingest finishes.` },
		];
	}

	const headline = `${formatCompactNumber(totalTokens)} tokens.`;

	if (totalTokens >= 10_000_000) {
		const warAndPeaceCount = Math.round(totalTokens / 775_000);
		return [
			{ text: headline },
			{ text: `That's War and Peace, ${warAndPeaceCount} times over.` },
		];
	}
	if (totalTokens >= 1_000_000) {
		const novelCount = Math.max(1, Math.round(totalTokens / 100_000));
		return [{ text: headline }, { text: `About ${novelCount} novels' worth.` }];
	}
	if (totalTokens >= 100_000) {
		return [{ text: headline }, { text: `A novella's worth.` }];
	}
	return [{ text: headline }, { text: `A long essay's worth.` }];
}

function formatDurationMinutes(minutes: number) {
	if (minutes < 60) {
		return `${Math.round(minutes)} min`;
	}
	const hours = Math.floor(minutes / 60);
	const remaining = Math.round(minutes - hours * 60);
	if (remaining === 0) {
		return `${hours}h`;
	}
	return `${hours}h ${remaining}m`;
}

function getQualityStageState(input: {
	commitRate: number | null;
	successRate: number | null;
}) {
	const { commitRate, successRate } = input;

	if (commitRate === null && successRate === null) {
		return "missing" as const;
	}

	if (commitRate !== null && successRate !== null) {
		if (commitRate >= 60 && successRate >= 80) {
			return "strong" as const;
		}
		if (successRate >= 80) {
			return "delivery-led" as const;
		}
		if (commitRate >= 60) {
			return "commit-led" as const;
		}
		return "iterating" as const;
	}

	if (commitRate === null) {
		return "success-only" as const;
	}

	return "commit-only" as const;
}

function getQualityStageHeadline(input: {
	commitRate: number | null;
	state: QualityStageState;
	successRate: number | null;
}) {
	const { commitRate, state, successRate } = input;

	switch (state) {
		case "strong":
			return "The work usually landed clean";
		case "delivery-led":
			return "The work landed more often than it committed";
		case "commit-led":
			return "You kept moving code through rougher sessions";
		case "iterating":
			return "This stretch was more iteration than finish";
		case "success-only":
			return successRate !== null && successRate >= 80
				? "The work usually landed clean"
				: "The finish signal is still settling";
		case "commit-only":
			return commitRate !== null && commitRate >= 60
				? "Code usually moved before the recap ended"
				: "Many sessions stayed exploratory";
		case "missing":
			return "The finish is still settling";
	}
}

function getQualityStageStateLabel(input: {
	commitRate: number | null;
	state: QualityStageState;
	successRate: number | null;
}) {
	const { commitRate, state, successRate } = input;

	switch (state) {
		case "strong":
			return "Strong finish";
		case "delivery-led":
			return "Lands clean";
		case "commit-led":
			return "Ships through";
		case "iterating":
			return "Still iterating";
		case "success-only":
			return successRate !== null && successRate >= 80
				? "Success signal"
				: "Partial finish";
		case "commit-only":
			return commitRate !== null && commitRate >= 60
				? "Commit signal"
				: "Exploratory";
		case "missing":
			return "Still landing";
	}
}

function getQualityStageSubline(input: {
	commitRate: number | null;
	state: QualityStageState;
	successRate: number | null;
}) {
	const { commitRate, state, successRate } = input;

	switch (state) {
		case "strong":
			return `${formatPercent(commitRate)} of sessions ended with commits, and ${formatPercent(successRate)} were marked successful.`;
		case "delivery-led":
			return `${formatPercent(successRate)} success led the window, even though commits landed in ${formatPercent(commitRate)} of sessions.`;
		case "commit-led":
			return `${formatPercent(commitRate)} of sessions moved code, even while success sat at ${formatPercent(successRate)}.`;
		case "iterating":
			return `${formatPercent(commitRate)} commits. ${formatPercent(successRate)} success. More loop than finish.`;
		case "success-only":
			return `${formatPercent(successRate)} success rate is in. Commit rate is still missing.`;
		case "commit-only":
			return `${formatPercent(commitRate)} commit rate is in. Success rate is still missing.`;
		case "missing":
			return "We will compare commit rate and success rate once more finished sessions land.";
	}
}

function getQualityStageComparisonLabel(input: {
	commitRate: number | null;
	successRate: number | null;
}) {
	const { commitRate, successRate } = input;

	if (commitRate !== null && successRate !== null) {
		const gap = Math.round(Math.abs(successRate - commitRate));

		if (gap <= 6) {
			return "Commit and success stayed close";
		}

		return successRate > commitRate
			? `Success led by ${gap} pts`
			: `Commits led by ${gap} pts`;
	}

	if (successRate !== null) {
		return "Commit lane pending";
	}

	if (commitRate !== null) {
		return "Success lane pending";
	}

	return "Waiting for finish signal";
}

function getQualityStageShare(rate: number | null) {
	if (rate === null || rate <= 0) {
		return 0;
	}

	return Math.min(100, Math.max(16, Math.round(rate)));
}

function formatRateOrPending(rate: number | null) {
	if (rate === null) {
		return "Pending";
	}

	return formatPercent(rate);
}

function getToolsHeadline(input: {
	topSlashCommand: string | null;
	topSubagent: string | null;
}) {
	const { topSlashCommand, topSubagent } = input;

	if (topSlashCommand && topSubagent) {
		return `${topSlashCommand} up front. ${topSubagent} in reserve.`;
	}

	if (topSlashCommand) {
		return `${topSlashCommand} led the workflow.`;
	}

	if (topSubagent) {
		return `${topSubagent} carried the extra work.`;
	}

	return "You stayed close to the base model.";
}

function getToolsSubline(input: {
	slashCommandsAdoptionRate: number | null;
	subagentsAdoptionRate: number | null;
}) {
	const { slashCommandsAdoptionRate, subagentsAdoptionRate } = input;

	if (slashCommandsAdoptionRate === null && subagentsAdoptionRate === null) {
		return "Extension signal is still landing.";
	}

	if (slashCommandsAdoptionRate === null) {
		return `${formatPercent(subagentsAdoptionRate)} of sessions used a subagent.`;
	}

	if (subagentsAdoptionRate === null) {
		return `${formatPercent(slashCommandsAdoptionRate)} of sessions used a slash command.`;
	}

	return `${formatPercent(slashCommandsAdoptionRate)} slash-command sessions. ${formatPercent(subagentsAdoptionRate)} subagent sessions.`;
}

function formatCompactNumber(value: number) {
	return COMPACT_NUMBER_FORMATTER.format(value);
}

function formatPercent(value: number | null) {
	if (value === null) {
		return "0%";
	}

	return `${Math.round(value)}%`;
}
