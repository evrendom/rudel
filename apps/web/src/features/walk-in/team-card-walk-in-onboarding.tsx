import type { MonthlyModelUsage } from "@rudel/api-routes";
import {
	BadgeCheck,
	ChevronLeft,
	LoaderCircle,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import type { ReactNode, UIEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { appRoutes } from "@/app/routes";
import { buttonVariants } from "@/app/ui/button";
import { cn } from "@/lib/utils";

const STEP_QUERY_PARAM = "step";
const STEP_PREVIEW_QUERY_PARAM_PREFIX = "preview-";
const COMPACT_NUMBER_FORMATTER = new Intl.NumberFormat("en", {
	maximumFractionDigits: 1,
	notation: "compact",
});

const UPLOAD_STEP = {
	id: "upload",
	label: "Upload",
	kind: "placeholder",
} as const;

const WALK_IN_STEPS = [
	{ id: "intro", label: "Intro", kind: "placeholder" },
	{ id: "presence", label: "Presence", kind: "placeholder" },
	{ id: "skills", label: "Skills", kind: "placeholder" },
	{ id: "tools", label: "Tools", kind: "placeholder" },
	{ id: "model", label: "Model", kind: "placeholder" },
	{ id: "scale", label: "Scale", kind: "placeholder" },
	{ id: "lock-in", label: "Lock-in", kind: "placeholder" },
	{ id: "project", label: "Project", kind: "placeholder" },
	{ id: "quality", label: "Quality", kind: "placeholder" },
	{ id: "card", label: "Final card", kind: "final" },
] as const;

type WalkInPrimaryStep = (typeof WALK_IN_STEPS)[number];
type WalkInStep = typeof UPLOAD_STEP | WalkInPrimaryStep;
type WalkInStepId = WalkInStep["id"];

export const WALK_IN_BEAT_CONTRACTS: Record<WalkInStepId, WalkInBeatContract> =
	{
		upload: {
			metricBasis:
				"Temporary pre-recap beat. Final live version should read from upload job status and uploaded export summary.",
			timeWindow: "Current upload attempt.",
			referenceClass: "Current user's uploaded session exports.",
			eligibility: "Always shown before the intro beat.",
		},
		intro: {
			metricBasis: "Count of session_analytics rows for this user.",
			timeWindow: "All time since first session.",
			referenceClass: "User's own history.",
			eligibility: "Always shown. Copy softens when total_sessions < 10.",
		},
		presence: {
			metricBasis: "active_days divided by days_since_first_session.",
			timeWindow: "Since first session, in UTC date boundaries.",
			referenceClass: "User's own history, not peers.",
			eligibility: "days_since_first_session >= 7.",
		},
		skills: {
			metricBasis: "Top skill by usage and skills_adoption_rate.",
			timeWindow: "Developer analytics window (last 90 days).",
			referenceClass: "User's own history.",
			eligibility: "At least one skill or adoption rate recorded.",
		},
		tools: {
			metricBasis: "Top slash command and top subagent by usage.",
			timeWindow: "Developer analytics window (last 90 days).",
			referenceClass: "User's own history.",
			eligibility: "At least one slash command or subagent recorded.",
		},
		model: {
			metricBasis:
				"Favorite model by session count. When eligible, monthly top model from model_by_month.",
			timeWindow: "All time since first session.",
			referenceClass: "User's own history.",
			eligibility:
				"Single-model copy when a favorite model exists. Evolution copy when >= 3 distinct months and >= 2 distinct top models across months.",
		},
		scale: {
			metricBasis: "Sum of input_tokens + output_tokens across sessions.",
			timeWindow: "All time since first session.",
			referenceClass:
				"Reading-length anchors (essay, novella, novel, War and Peace).",
			eligibility: "total_tokens > 0.",
		},
		"lock-in": {
			metricBasis:
				"Longest session duration (min) compared to avg session duration.",
			timeWindow:
				"Longest session across all time. Average over developer analytics window.",
			referenceClass: "User's own session distribution.",
			eligibility: "longest_session_min >= 30.",
		},
		project: {
			metricBasis:
				"Top project by total_tokens, with sessions as tie-break. Falls back to distinct_projects.",
			timeWindow: "Developer analytics window.",
			referenceClass: "User's own projects.",
			eligibility: "At least one project recorded or distinct_projects > 0.",
		},
		quality: {
			metricBasis: "Commit rate and success_rate.",
			timeWindow: "Developer analytics window.",
			referenceClass: "User's own history.",
			eligibility: "At least one of commit_rate or success_rate is available.",
		},
		card: {
			metricBasis:
				"User-picked archetype theme. Classifier lands later; no automatic assignment yet.",
			timeWindow: "Snapshot of the current card stats at view time.",
			referenceClass: "User browses the full archetype set.",
			eligibility: "Always shown.",
		},
	};

type WalkInStepContentTone = "default" | "danger";

interface WalkInStepContentLine {
	text: string;
	tone?: WalkInStepContentTone;
}

interface WalkInVisibleProgressStep {
	step: WalkInStep;
	stepIndex: number;
}

type PreviewableWalkInStepId = Exclude<WalkInStepId, "card">;

interface WalkInPreviewOption {
	label: string;
	value: string;
}

interface IntroStageModel {
	cardDetail: string;
	cardMeta: string;
	cardValue: string;
	footnote: string;
	headline: string;
}

interface UploadStageModel {
	body: string;
	cardBody: string;
	cardEyebrow: string;
	cardMeta: string | null;
	headline: string;
	isUploading: boolean;
	rollItems: readonly UploadStageRollItem[];
	secondaryActionLabel: string | null;
}

interface UploadStageRollItem {
	id: string;
	label: string;
	meta: string;
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

type IntroCommitDotLevel = 0 | 1 | 2 | 3 | 4;

interface IntroCommitDot {
	id: string;
	level: IntroCommitDotLevel;
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

const INTRO_COMMIT_GRAPH = {
	columns: 53,
	rows: 19,
	totalDots: 365,
};

const WALK_IN_STEP_PREVIEW_OPTIONS = {
	upload: [
		{ value: "auto", label: "Auto (placeholder)" },
		{ value: "uploading", label: "Uploading now" },
		{ value: "ready-single", label: "Ready, one export" },
		{ value: "ready-multi", label: "Ready, multiple exports" },
	],
	intro: [
		{ value: "auto", label: "Auto (live data)" },
		{ value: "sparse", label: "Sparse run" },
		{ value: "full", label: "Full run" },
	],
	presence: [
		{ value: "auto", label: "Auto (live data)" },
		{ value: "day-one", label: "Day one" },
		{ value: "high", label: "High return rate" },
		{ value: "mid", label: "Mid return rate" },
		{ value: "low", label: "Low return rate" },
	],
	skills: [
		{ value: "auto", label: "Auto (live data)" },
		{ value: "dominant", label: "Top skill + adoption" },
		{ value: "dominant-no-rate", label: "Top skill, no adoption rate" },
		{ value: "usage-no-winner", label: "Usage, no clear winner" },
		{ value: "no-signal", label: "No skill signal" },
	],
	tools: [
		{ value: "auto", label: "Auto (live data)" },
		{ value: "both", label: "Slash + subagent" },
		{ value: "slash-only", label: "Slash only" },
		{ value: "subagent-only", label: "Subagent only" },
		{ value: "base-model", label: "No extension usage" },
	],
	model: [
		{ value: "auto", label: "Auto (live data)" },
		{ value: "favorite", label: "Clear favorite" },
		{ value: "played-field", label: "No favorite" },
		{ value: "single-switch", label: "One monthly switch" },
		{ value: "exploring", label: "Constant exploration" },
		{ value: "settled", label: "Explored, then settled" },
		{ value: "rotation", label: "Mostly one, some rotation" },
	],
	scale: [
		{ value: "auto", label: "Auto (live data)" },
		{ value: "missing", label: "No token signal" },
		{ value: "essay", label: "Essay scale" },
		{ value: "novella", label: "Novella scale" },
		{ value: "novels", label: "Novel scale" },
		{ value: "war-and-peace", label: "War and Peace scale" },
	],
	"lock-in": [
		{ value: "auto", label: "Auto (live data)" },
		{ value: "none", label: "No runaway session" },
		{ value: "stretched", label: "Stretched session" },
		{ value: "got-away", label: "Session got away" },
		{ value: "didnt-end", label: "Session never ended" },
	],
	project: [
		{ value: "auto", label: "Auto (live data)" },
		{ value: "top-project", label: "One clear repo" },
		{ value: "spread-repos", label: "Spread across repos" },
		{ value: "spread-work", label: "Spread, no repo count" },
	],
	quality: [
		{ value: "auto", label: "Auto (live data)" },
		{ value: "strong", label: "Strong finish" },
		{ value: "lands-commits-lag", label: "High success, lower commits" },
		{ value: "ship-through-mess", label: "High commits, lower success" },
		{ value: "iterate", label: "Mostly iteration" },
		{ value: "lands-only", label: "Success only" },
		{ value: "iterating-only", label: "Low success only" },
		{ value: "commit-only-high", label: "Commit rate only, high" },
		{ value: "commit-only-low", label: "Commit rate only, low" },
		{ value: "no-signal", label: "No finish signal" },
	],
} as const satisfies Record<
	PreviewableWalkInStepId,
	readonly WalkInPreviewOption[]
>;

export interface WalkInOnboardingMetrics {
	activeDays: number;
	avgSessionMin: number | null;
	commitRate: number | null;
	daysSinceFirst: number;
	favoriteModel: string | null;
	longestSessionMin: number | null;
	modelByMonth: readonly MonthlyModelUsage[];
	skillsAdoptionRate: number | null;
	slashCommandsAdoptionRate: number | null;
	subagentsAdoptionRate: number | null;
	successRate: number | null;
	topProjectName: string | null;
	topProjectSessions: number;
	topProjectTokens: number;
	topSkill: string | null;
	topSlashCommand: string | null;
	topSubagent: string | null;
	totalTokens: number;
}

export interface WalkInBeatContract {
	metricBasis: string;
	timeWindow: string;
	referenceClass: string;
	eligibility: string;
}

export interface TeamCardWalkInOnboardingProps {
	distinctProjectCount: number;
	displayName: string;
	finalFooter?: ReactNode;
	finalStage: ReactNode;
	onboardingMetrics: WalkInOnboardingMetrics;
	totalSessions: number;
}

export function TeamCardWalkInOnboarding(props: TeamCardWalkInOnboardingProps) {
	const {
		distinctProjectCount,
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
	const isStepTransitioning = pendingStepIndex !== null;

	useEffect(() => {
		return () => {
			if (exitTimerRef.current !== null) {
				window.clearTimeout(exitTimerRef.current);
			}
		};
	}, []);

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
		<main className="mymind-walk-in-route">
			<div className="mymind-walk-in-shell mx-auto flex w-full max-w-[68rem] flex-1 flex-col text-foreground">
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
									distinctProjectCount={distinctProjectCount}
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
	distinctProjectCount: number;
	displayName: string;
	isExiting: boolean;
	onboardingMetrics: WalkInOnboardingMetrics;
	previewState: string;
	step: WalkInStep;
	totalSessions: number;
}) {
	const {
		distinctProjectCount,
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

	const content = buildStepContent({
		distinctProjectCount,
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
	distinctProjectCount: number;
	displayName: string;
	onboardingMetrics: WalkInOnboardingMetrics;
	previewState: string;
	stepId: WalkInStep["id"];
	totalSessions: number;
}): WalkInStepContentLine[] {
	const {
		distinctProjectCount,
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
		case "presence":
			return buildPresenceContent(
				resolvePresencePreviewInput(
					{
						activeDays: onboardingMetrics.activeDays,
						daysSinceFirst: onboardingMetrics.daysSinceFirst,
					},
					previewState,
				),
			);
		case "skills": {
			const skillsPreview = resolveSkillsPreviewInput(
				{
					skillsAdoptionRate: onboardingMetrics.skillsAdoptionRate,
					topSkill: onboardingMetrics.topSkill,
				},
				previewState,
			);
			return [
				{ text: getSkillsHeadline(skillsPreview.topSkill) },
				{ text: getSkillsSubline(skillsPreview.skillsAdoptionRate) },
			];
		}
		case "model":
			return buildModelContent(
				resolveModelPreviewInput(
					{
						favoriteModel: onboardingMetrics.favoriteModel,
						modelByMonth: onboardingMetrics.modelByMonth,
					},
					previewState,
				),
			);
		case "scale":
			return buildScaleContent(
				resolveScalePreviewTokens(onboardingMetrics.totalTokens, previewState),
			);
		case "quality": {
			const qualityPreview = resolveQualityPreviewInput(
				{
					commitRate: onboardingMetrics.commitRate,
					successRate: onboardingMetrics.successRate,
				},
				previewState,
			);
			return [
				{
					text: getQualityHeadline({
						commitRate: qualityPreview.commitRate,
						successRate: qualityPreview.successRate,
					}),
				},
				{
					text: getQualitySubline({
						commitRate: qualityPreview.commitRate,
						successRate: qualityPreview.successRate,
					}),
				},
			];
		}
		case "tools": {
			const toolsPreview = resolveToolsPreviewInput(
				{
					slashCommandsAdoptionRate:
						onboardingMetrics.slashCommandsAdoptionRate,
					subagentsAdoptionRate: onboardingMetrics.subagentsAdoptionRate,
					topSlashCommand: onboardingMetrics.topSlashCommand,
					topSubagent: onboardingMetrics.topSubagent,
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
		case "project": {
			const projectPreview = resolveProjectPreviewInput(
				{
					distinctProjectCount,
					topProjectName: onboardingMetrics.topProjectName,
					topProjectSessions: onboardingMetrics.topProjectSessions,
					topProjectTokens: onboardingMetrics.topProjectTokens,
				},
				previewState,
			);
			return [
				{ text: getProjectHeadline(projectPreview.topProjectName) },
				{
					text: getProjectSubline({
						distinctProjectCount: projectPreview.distinctProjectCount,
						topProjectName: projectPreview.topProjectName,
						topProjectSessions: projectPreview.topProjectSessions,
						topProjectTokens: projectPreview.topProjectTokens,
					}),
				},
			];
		}
		case "lock-in":
			return buildLockInContent(
				resolveLockInPreviewInput(
					{
						avgSessionMin: onboardingMetrics.avgSessionMin,
						longestSessionMin: onboardingMetrics.longestSessionMin,
					},
					previewState,
				),
			);
		default:
			return [{ text: "" }];
	}
}

function resolveUploadStageModel(previewState: string): UploadStageModel {
	switch (previewState) {
		case "ready-single":
			return {
				body: "One export is in. Add another, or start the story.",
				cardBody: "1 export added",
				cardEyebrow: "Upload complete",
				cardMeta: "128 sessions from Cursor",
				headline: "Your upload is ready.",
				isUploading: false,
				rollItems: [
					{
						id: "cursor-export-1",
						label: "Cursor export",
						meta: "128 sessions",
					},
				],
				secondaryActionLabel: "Upload more",
			};
		case "ready-multi":
			return {
				body: "This pass is done. Add more, or keep going.",
				cardBody: "3 exports added",
				cardEyebrow: "Uploads complete",
				cardMeta: "412 sessions across 2 tools",
				headline: "Your uploads are ready.",
				isUploading: false,
				rollItems: [
					{
						id: "cursor-export-1",
						label: "Cursor export",
						meta: "128 sessions",
					},
					{
						id: "cursor-export-2",
						label: "Cursor export",
						meta: "96 sessions",
					},
					{
						id: "claude-export-1",
						label: "Claude Code export",
						meta: "188 sessions",
					},
				],
				secondaryActionLabel: "Upload more",
			};
		default:
			return {
				body: "We'll start as soon as this upload pass finishes.",
				cardBody: "2 of 3 exports processed",
				cardEyebrow: "2 exports landed",
				cardMeta: "284 sessions landed so far",
				headline: "Bringing your sessions in.",
				isUploading: true,
				rollItems: [
					{
						id: "cursor-export-1",
						label: "Cursor export",
						meta: "128 sessions added",
					},
					{
						id: "claude-export-1",
						label: "Claude Code export",
						meta: "156 sessions added",
					},
					{
						id: "windsurf-export-1",
						label: "Windsurf export",
						meta: "Still processing",
					},
				],
				secondaryActionLabel: null,
			};
	}
}

function buildIntroContent(input: {
	activeDays: number;
	daysSinceFirst: number;
	displayName: string;
	totalSessions: number;
}): WalkInStepContentLine[] {
	const { activeDays, daysSinceFirst, displayName, totalSessions } = input;
	const resolvedActiveDays = Math.max(activeDays, totalSessions > 0 ? 1 : 0);
	const resolvedDaysSinceFirst = Math.max(daysSinceFirst, resolvedActiveDays);
	const greetingName = getGreetingName(displayName);

	if (totalSessions <= 0) {
		return [
			{ text: `No sessions yet.` },
			{ text: `Start the run and the story will show up here.` },
		];
	}

	if (totalSessions < 10) {
		return [
			{
				text: `Hey ${greetingName}, we got the outline.`,
			},
			{
				text: `${totalSessions.toLocaleString()} sessions in, and it's starting to show.`,
			},
			{
				text: `${resolvedActiveDays.toLocaleString()} active days across your first ${resolvedDaysSinceFirst.toLocaleString()} days.`,
			},
		];
	}

	return [
		{
			text: `Hey ${greetingName}, we got the shape of it.`,
		},
		{
			text: `${totalSessions.toLocaleString()} sessions later, a real pattern showed up.`,
		},
		{
			text: `${resolvedActiveDays.toLocaleString()} active days across ${resolvedDaysSinceFirst.toLocaleString()} days.`,
		},
	];
}

function resolveIntroStageModel(input: {
	activeDays: number;
	daysSinceFirst: number;
	displayName: string;
	totalSessions: number;
}): IntroStageModel {
	const { activeDays, daysSinceFirst, displayName, totalSessions } = input;
	const resolvedActiveDays = Math.max(activeDays, totalSessions > 0 ? 1 : 0);
	const resolvedDaysSinceFirst = Math.max(daysSinceFirst, resolvedActiveDays);
	const greetingName = getGreetingName(displayName);

	if (totalSessions <= 0) {
		return {
			cardDetail: "across 0 days",
			cardMeta: "0 day run",
			cardValue: "0 active days",
			footnote: "As soon as sessions land, this step turns into your opening beat.",
			headline: "No sessions yet.",
		};
	}

	if (totalSessions < 10) {
		return {
			cardDetail: `across ${resolvedDaysSinceFirst.toLocaleString()} days`,
			cardMeta: `${totalSessions.toLocaleString()} sessions`,
			cardValue: `${resolvedActiveDays.toLocaleString()} active days`,
			footnote: "A light run, but enough signal to keep going.",
			headline: `Hey ${greetingName}, we got the outline.`,
		};
	}

	return {
		cardDetail: `across ${resolvedDaysSinceFirst.toLocaleString()} days`,
		cardMeta: `${totalSessions.toLocaleString()} sessions`,
		cardValue: `${resolvedActiveDays.toLocaleString()} active days`,
		footnote: "Enough signal to start the story with something real.",
		headline: `Hey ${greetingName}, we got the shape of it.`,
	};
}

function buildIntroCommitGraph(input: {
	activeDays: number;
	daysSinceFirst: number;
	displayName: string;
	totalSessions: number;
}): IntroCommitDot[] {
	const TOTAL_DOTS = INTRO_COMMIT_GRAPH.totalDots;
	const resolvedVisibleDays = Math.max(
		0,
		Math.min(TOTAL_DOTS, Math.max(input.daysSinceFirst, input.totalSessions > 0 ? 1 : 0)),
	);
	const resolvedActiveDays = Math.max(
		0,
		Math.min(resolvedVisibleDays, input.activeDays),
	);
	const startOffset = TOTAL_DOTS - resolvedVisibleDays;
	const activeDotIndices = new Set<number>();
	const intensityByIndex = new Map<number, IntroCommitDotLevel>();

	if (resolvedVisibleDays > 0 && resolvedActiveDays > 0) {
		const random = createSeededRandom(
			input.totalSessions * 31 +
				input.activeDays * 17 +
				input.daysSinceFirst * 13 +
				input.displayName.length * 7,
		);
		const rankedDays = Array.from({ length: resolvedVisibleDays }, (_, dayIndex) => {
			const recency =
				resolvedVisibleDays <= 1 ? 1 : dayIndex / (resolvedVisibleDays - 1);
			const noise = random();
			const streak = (Math.sin((dayIndex + 1) * 0.72 + noise * 2.4) + 1) / 2;
			return {
				dayIndex,
				score: recency * 0.48 + noise * 0.32 + streak * 0.2,
			};
		})
			.sort((left, right) => right.score - left.score)
			.slice(0, resolvedActiveDays)
			.sort((left, right) => left.dayIndex - right.dayIndex);

		for (const entry of rankedDays) {
			const graphIndex = startOffset + entry.dayIndex;
			activeDotIndices.add(graphIndex);
			const intensityNoise = (Math.sin((entry.dayIndex + 1) * 1.13) + 1) / 2;
			const recency =
				resolvedVisibleDays <= 1
					? 1
					: entry.dayIndex / (resolvedVisibleDays - 1);
			const intensityScore = recency * 0.55 + intensityNoise * 0.45;
			const level =
				intensityScore > 0.82
					? 4
					: intensityScore > 0.58
						? 3
						: intensityScore > 0.34
							? 2
							: 1;
			intensityByIndex.set(graphIndex, level);
		}
	}

	return Array.from({ length: TOTAL_DOTS }, (_, index) => ({
		id: `intro-commit-dot-${index}`,
		level: activeDotIndices.has(index) ? (intensityByIndex.get(index) ?? 1) : 0,
	}));
}

function createSeededRandom(seed: number) {
	let state = (seed >>> 0) || 1;
	return () => {
		state = (state * 1_664_525 + 1_013_904_223) >>> 0;
		return state / 4_294_967_296;
	};
}

function resolveIntroPreviewInput(
	input: {
		activeDays: number;
		daysSinceFirst: number;
		displayName: string;
		totalSessions: number;
	},
	previewState: string,
) {
	switch (previewState) {
		case "sparse":
			return {
				activeDays: 4,
				daysSinceFirst: 12,
				displayName: input.displayName,
				totalSessions: 7,
			};
		case "full":
			return {
				activeDays: 37,
				daysSinceFirst: 214,
				displayName: input.displayName,
				totalSessions: 128,
			};
		default:
			return input;
	}
}

function getGreetingName(displayName: string) {
	const trimmedDisplayName = displayName.trim();
	if (!trimmedDisplayName) {
		return "there";
	}

	return trimmedDisplayName.split(/\s+/)[0] ?? trimmedDisplayName;
}

function resolvePresencePreviewInput(
	input: {
		activeDays: number;
		daysSinceFirst: number;
	},
	previewState: string,
) {
	switch (previewState) {
		case "day-one":
			return { activeDays: 0, daysSinceFirst: 0 };
		case "high":
			return { activeDays: 91, daysSinceFirst: 120 };
		case "mid":
			return { activeDays: 18, daysSinceFirst: 60 };
		case "low":
			return { activeDays: 4, daysSinceFirst: 32 };
		default:
			return input;
	}
}

function resolveSkillsPreviewInput(
	input: {
		skillsAdoptionRate: number | null;
		topSkill: string | null;
	},
	previewState: string,
) {
	switch (previewState) {
		case "dominant":
			return { topSkill: "Refactor", skillsAdoptionRate: 68 };
		case "dominant-no-rate":
			return { topSkill: "Refactor", skillsAdoptionRate: null };
		case "usage-no-winner":
			return { topSkill: null, skillsAdoptionRate: 24 };
		case "no-signal":
			return { topSkill: null, skillsAdoptionRate: null };
		default:
			return input;
	}
}

function resolveToolsPreviewInput(
	input: {
		slashCommandsAdoptionRate: number | null;
		subagentsAdoptionRate: number | null;
		topSlashCommand: string | null;
		topSubagent: string | null;
	},
	previewState: string,
) {
	switch (previewState) {
		case "both":
			return {
				topSlashCommand: "/fix",
				topSubagent: "Reviewer",
				slashCommandsAdoptionRate: 58,
				subagentsAdoptionRate: 31,
			};
		case "slash-only":
			return {
				topSlashCommand: "/plan",
				topSubagent: null,
				slashCommandsAdoptionRate: 62,
				subagentsAdoptionRate: null,
			};
		case "subagent-only":
			return {
				topSlashCommand: null,
				topSubagent: "Researcher",
				slashCommandsAdoptionRate: null,
				subagentsAdoptionRate: 29,
			};
		case "base-model":
			return {
				topSlashCommand: null,
				topSubagent: null,
				slashCommandsAdoptionRate: null,
				subagentsAdoptionRate: null,
			};
		default:
			return input;
	}
}

function resolveModelPreviewInput(
	input: {
		favoriteModel: string | null;
		modelByMonth: readonly MonthlyModelUsage[];
	},
	previewState: string,
) {
	switch (previewState) {
		case "favorite":
			return { favoriteModel: "Claude Sonnet 4", modelByMonth: [] };
		case "played-field":
			return { favoriteModel: null, modelByMonth: [] };
		case "single-switch":
			return {
				favoriteModel: "GPT-4.1",
				modelByMonth: buildPreviewMonthlyModelUsage([
					["2026-01", "Claude Sonnet 4", 22],
					["2026-02", "Claude Sonnet 4", 18],
					["2026-03", "GPT-4.1", 25],
					["2026-04", "GPT-4.1", 29],
				]),
			};
		case "exploring":
			return {
				favoriteModel: null,
				modelByMonth: buildPreviewMonthlyModelUsage([
					["2026-01", "Claude Sonnet 4", 18],
					["2026-02", "GPT-4.1", 17],
					["2026-03", "Gemini 2.5 Pro", 15],
					["2026-04", "Claude Sonnet 4", 19],
					["2026-05", "GPT-4.1", 16],
				]),
			};
		case "settled":
			return {
				favoriteModel: "GPT-4.1",
				modelByMonth: buildPreviewMonthlyModelUsage([
					["2026-01", "Claude Sonnet 4", 18],
					["2026-02", "Claude Sonnet 4", 19],
					["2026-03", "GPT-4.1", 21],
					["2026-04", "GPT-4.1", 22],
					["2026-05", "Claude Sonnet 4", 17],
					["2026-06", "GPT-4.1", 24],
					["2026-07", "GPT-4.1", 26],
				]),
			};
		case "rotation":
			return {
				favoriteModel: "Claude Sonnet 4",
				modelByMonth: buildPreviewMonthlyModelUsage([
					["2026-01", "Claude Sonnet 4", 18],
					["2026-02", "Claude Sonnet 4", 21],
					["2026-03", "GPT-4.1", 19],
					["2026-04", "GPT-4.1", 17],
					["2026-05", "Claude Sonnet 4", 22],
					["2026-06", "Claude Sonnet 4", 24],
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

function resolveProjectPreviewInput(
	input: {
		distinctProjectCount: number;
		topProjectName: string | null;
		topProjectSessions: number;
		topProjectTokens: number;
	},
	previewState: string,
) {
	switch (previewState) {
		case "top-project":
			return {
				distinctProjectCount: 5,
				topProjectName: "geneva",
				topProjectSessions: 46,
				topProjectTokens: 1_400_000,
			};
		case "spread-repos":
			return {
				distinctProjectCount: 7,
				topProjectName: null,
				topProjectSessions: 0,
				topProjectTokens: 0,
			};
		case "spread-work":
			return {
				distinctProjectCount: 0,
				topProjectName: null,
				topProjectSessions: 0,
				topProjectTokens: 0,
			};
		default:
			return input;
	}
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

function getStepPreviewStateParam(stepId: PreviewableWalkInStepId) {
	return `${STEP_PREVIEW_QUERY_PARAM_PREFIX}${stepId}`;
}

function getSelectedPreviewState(
	stepId: PreviewableWalkInStepId,
	requestedState: string | null,
) {
	const normalizedRequestedState = requestedState?.trim() ?? "";
	return WALK_IN_STEP_PREVIEW_OPTIONS[stepId].some(
		(option) => option.value === normalizedRequestedState,
	)
		? normalizedRequestedState
		: "auto";
}

function buildPresenceContent(input: {
	activeDays: number;
	daysSinceFirst: number;
}): WalkInStepContentLine[] {
	const { activeDays, daysSinceFirst } = input;

	if (daysSinceFirst <= 0) {
		return [{ text: `Day one.` }, { text: `The pattern will shape itself.` }];
	}

	const ratio = activeDays / daysSinceFirst;
	const proof = `${activeDays.toLocaleString()} of ${daysSinceFirst.toLocaleString()} days.`;

	if (ratio >= 0.6) {
		return [{ text: `You kept coming back.` }, { text: proof }];
	}
	if (ratio >= 0.25) {
		return [{ text: `You came back when it mattered.` }, { text: proof }];
	}
	return [{ text: `You meant to be here more.` }, { text: proof }];
}

function buildModelContent(input: {
	favoriteModel: string | null;
	modelByMonth: readonly MonthlyModelUsage[];
}): WalkInStepContentLine[] {
	const { favoriteModel, modelByMonth } = input;
	const evolution = summarizeModelEvolution(modelByMonth);
	const favoriteLabel = formatModelLabel(favoriteModel);

	if (
		evolution &&
		evolution.months.length >= 3 &&
		evolution.distinctTops >= 2
	) {
		return buildEvolutionContent(evolution, favoriteLabel);
	}

	if (!favoriteLabel) {
		return [
			{ text: `You played the field.` },
			{ text: `No single model carried the run.` },
		];
	}

	return [{ text: `You reached for ${favoriteLabel} most.` }];
}

interface ModelEvolutionSummary {
	months: string[];
	topModelByMonth: string[];
	distinctTops: number;
	transitions: number;
	firstTop: string;
	latestTop: string;
	latestSwitchMonth: string | null;
}

function summarizeModelEvolution(
	modelByMonth: readonly MonthlyModelUsage[],
): ModelEvolutionSummary | null {
	if (modelByMonth.length === 0) {
		return null;
	}

	const monthToLeader = new Map<string, MonthlyModelUsage>();

	for (const row of modelByMonth) {
		const existing = monthToLeader.get(row.month);
		if (!existing || row.session_count > existing.session_count) {
			monthToLeader.set(row.month, row);
		}
	}

	const months = [...monthToLeader.keys()].sort();
	const topModelByMonth = months.map(
		(month) => formatModelLabel(monthToLeader.get(month)?.model) ?? "Unknown",
	);
	const distinctTops = new Set(topModelByMonth).size;

	let transitions = 0;
	let latestSwitchMonth: string | null = null;

	for (let i = 1; i < topModelByMonth.length; i += 1) {
		if (topModelByMonth[i] !== topModelByMonth[i - 1]) {
			transitions += 1;
			latestSwitchMonth = months[i] ?? null;
		}
	}

	return {
		months,
		topModelByMonth,
		distinctTops,
		transitions,
		firstTop: topModelByMonth[0] ?? "Unknown",
		latestTop: topModelByMonth[topModelByMonth.length - 1] ?? "Unknown",
		latestSwitchMonth,
	};
}

function buildEvolutionContent(
	evolution: ModelEvolutionSummary,
	favoriteLabel: string | null,
): WalkInStepContentLine[] {
	const { months, latestTop, firstTop, transitions, latestSwitchMonth } =
		evolution;
	const monthCount = months.length;
	const headlineFavorite = latestTop || favoriteLabel || "one";

	if (transitions === 1 && latestSwitchMonth && latestTop !== firstTop) {
		return [
			{
				text: `In ${formatMonthLabel(latestSwitchMonth)}, ${latestTop} took over.`,
			},
			{ text: `Before that it was ${firstTop}.` },
		];
	}

	if (transitions >= Math.ceil(monthCount / 2)) {
		return [
			{ text: `You kept exploring.` },
			{
				text: `${evolution.distinctTops} models across ${monthCount} months. No single winner.`,
			},
		];
	}

	if (latestTop !== firstTop) {
		return [
			{ text: `You tried a few. Then ${headlineFavorite} stuck.` },
			{
				text: `${transitions} shift${transitions === 1 ? "" : "s"} across ${monthCount} months.`,
			},
		];
	}

	return [
		{ text: `${headlineFavorite}, mostly.` },
		{
			text: `${monthCount} months, ${evolution.distinctTops} model${evolution.distinctTops === 1 ? "" : "s"} in rotation.`,
		},
	];
}

function formatMonthLabel(month: string) {
	const [year, monthPart] = month.split("-");
	if (!year || !monthPart) {
		return month;
	}

	const monthIndex = Number(monthPart) - 1;
	if (!Number.isInteger(monthIndex) || monthIndex < 0 || monthIndex > 11) {
		return month;
	}

	const date = new Date(Date.UTC(Number(year), monthIndex, 1));
	return date.toLocaleString("en", { month: "long", year: "numeric" });
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

function buildLockInContent(input: {
	avgSessionMin: number | null;
	longestSessionMin: number | null;
}): WalkInStepContentLine[] {
	const { avgSessionMin, longestSessionMin } = input;

	if (longestSessionMin === null || longestSessionMin < 30) {
		return [
			{ text: `You close the tab when you're done.` },
			{ text: `No session ran away from you.` },
		];
	}

	const headline = `Your longest session lasted ${formatDurationMinutes(longestSessionMin)}.`;

	if (avgSessionMin && avgSessionMin > 0) {
		const ratio = longestSessionMin / avgSessionMin;
		if (ratio > 4) {
			return [
				{ text: headline },
				{ text: `Most sessions end. That one didn't.` },
			];
		}
		if (ratio >= 2) {
			return [{ text: headline }, { text: `One session got away from you.` }];
		}
	}

	return [
		{ text: headline },
		{ text: `Close to your usual rhythm, just stretched.` },
	];
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

function resolveActiveStepIndex(
	stepId: string | null,
	eligibleSteps: readonly WalkInStep[],
) {
	if (!stepId || stepId === UPLOAD_STEP.id) {
		return 0;
	}

	const resolvedStepIndex = eligibleSteps.findIndex(
		(step) => step.id === stepId,
	);
	return resolvedStepIndex >= 0 ? resolvedStepIndex + 1 : 0;
}

function getVisibleProgressSteps(
	activeStepIndex: number,
	eligibleSteps: readonly WalkInStep[],
): WalkInVisibleProgressStep[] {
	const MAX_VISIBLE_PROGRESS_STEPS = 10;
	const progressSteps = eligibleSteps.filter((step) => step.kind !== "final");

	if (progressSteps.length <= MAX_VISIBLE_PROGRESS_STEPS) {
		return progressSteps.map((step, progressIndex) => ({
			step,
			stepIndex: progressIndex + 1,
		}));
	}

	const activeProgressIndex = Math.max(0, activeStepIndex - 1);
	const maxStartIndex = progressSteps.length - MAX_VISIBLE_PROGRESS_STEPS;
	const desiredStartIndex = Math.max(
		0,
		activeProgressIndex - Math.floor(MAX_VISIBLE_PROGRESS_STEPS / 2),
	);
	const startIndex = Math.min(desiredStartIndex, maxStartIndex);

	return progressSteps
		.slice(startIndex, startIndex + MAX_VISIBLE_PROGRESS_STEPS)
		.map((step, visibleIndex) => ({
			step,
			stepIndex: startIndex + visibleIndex + 1,
		}));
}

function getStepDisplayNumber(stepIndex: number) {
	return (stepIndex - 1).toString();
}

function getSkillsHeadline(topSkill: string | null) {
	if (!topSkill) {
		return "No single skill took over.";
	}

	return `You kept reaching for ${topSkill}.`;
}

function getSkillsSubline(skillsAdoptionRate: number | null) {
	if (skillsAdoptionRate === null) {
		return "Skill signal is still landing.";
	}

	return `${formatPercent(skillsAdoptionRate)} of sessions pulled one in.`;
}

function getQualityHeadline(input: {
	commitRate: number | null;
	successRate: number | null;
}) {
	const { commitRate, successRate } = input;

	if (commitRate === null && successRate === null) {
		return "The finish is still settling.";
	}

	if (commitRate !== null && successRate !== null) {
		if (commitRate >= 60 && successRate >= 80) {
			return "You finish what you start.";
		}
		if (successRate >= 80) {
			return "The code lands. Commits lag.";
		}
		if (commitRate >= 60) {
			return "You shipped through the mess.";
		}
		return "You iterated more than you landed.";
	}

	if (commitRate === null) {
		return successRate !== null && successRate >= 80
			? "The work lands."
			: "Still iterating toward a clean finish.";
	}

	return commitRate >= 60
		? "You usually left with code that moved."
		: "Plenty of sessions stayed exploratory.";
}

function getQualitySubline(input: {
	commitRate: number | null;
	successRate: number | null;
}) {
	const { commitRate, successRate } = input;

	if (commitRate === null && successRate === null) {
		return "Not enough signal yet to call it.";
	}

	if (commitRate !== null && successRate !== null) {
		return `${formatPercent(commitRate)} commits. ${formatPercent(successRate)} success.`;
	}

	if (commitRate === null) {
		return `${formatPercent(successRate)} success rate.`;
	}

	return `${formatPercent(commitRate)} commit rate.`;
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
		return `${formatPercent(subagentsAdoptionRate)} subagent adoption.`;
	}

	if (subagentsAdoptionRate === null) {
		return `${formatPercent(slashCommandsAdoptionRate)} slash-command adoption.`;
	}

	return `${formatPercent(slashCommandsAdoptionRate)} slash. ${formatPercent(subagentsAdoptionRate)} subagent.`;
}

function getProjectHeadline(topProjectName: string | null) {
	if (!topProjectName) {
		return "No single repo dominated the run.";
	}

	return `${topProjectName} got the most of you.`;
}

function getProjectSubline(input: {
	distinctProjectCount: number;
	topProjectName: string | null;
	topProjectSessions: number;
	topProjectTokens: number;
}) {
	const {
		distinctProjectCount,
		topProjectName,
		topProjectSessions,
		topProjectTokens,
	} = input;

	if (!topProjectName) {
		if (distinctProjectCount > 0) {
			return `Attention spread across ${distinctProjectCount.toLocaleString()} repos.`;
		}
		return "Attention spread across the work.";
	}

	return `${topProjectSessions.toLocaleString()} sessions. ${formatCompactNumber(topProjectTokens)} tokens.`;
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
