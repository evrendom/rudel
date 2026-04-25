import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { CSSProperties, ReactNode } from "react";
// biome-ignore lint/style/noRestrictedImports: sequence timers and count-up animation are imperative storyboard bridges for this stage.
import { useEffect, useRef, useState } from "react";
import { useMountEffect } from "@/hooks/useMountEffect";
import { cn } from "@/lib/utils";
import { resolveModelPreviewInput, resolveModelStageModel } from "../models";
import type {
	WrappedModelAdvanceState,
	WrappedOnboardingMetrics,
} from "../types";
import {
	WrappedOnboardingStageCopy,
	WrappedOnboardingStageFrame,
} from "./frame";

interface ModelStageProps {
	advanceState: WrappedModelAdvanceState;
	onboardingMetrics: WrappedOnboardingMetrics;
	onComparisonSequenceComplete?: () => void;
	onHistoryRevealComplete?: () => void;
	previewState: string;
}

interface ModelSegmentStyle extends CSSProperties {
	"--model-stage-segment-background": string;
	"--model-stage-segment-box-shadow"?: string;
	"--model-stage-segment-highlight-opacity"?: string;
	"--model-stage-segment-delay"?: string;
	"--model-stage-segment-share": string;
}

interface ModelRaceRowStyle extends CSSProperties {
	"--model-stage-race-fill-background"?: string;
	"--model-stage-race-fill-box-shadow"?: string;
	"--model-stage-race-fill-highlight-opacity"?: string;
	"--model-stage-race-fill-radius"?: string;
	"--model-stage-race-tint": string;
}

type WrappedModelStageResolvedModel = ReturnType<typeof resolveModelStageModel>;

type WrappedModelStageSplitCard = {
	label: string;
	logo: ReactNode;
	segment: WrappedModelStageResolvedModel["summary"][number] | undefined;
	source: "claude_code" | "codex";
};

type ModelStageSequencePhase =
	| "lead-in"
	| "question"
	| "comparison"
	| "result"
	| "history-question"
	| "history-bars";

/* ─────────────────────────────────────────────────────────
 * MODEL STAGE STORYBOARD
 *
 * Read top-to-bottom. Each `at` value is ms after mount.
 *
 *    0ms   "Now comes the question..." lands centered
 * 1180ms   prompt swaps to "Claude or Codex?"
 * 2760ms   giant suspense bars start the race and hold near-even
 * 5360ms   title, real counts, logos, and labels finally reveal the winner
 * Continue  title swaps to the month-history question
 * +560ms    month bars expand upward and finish the beat
 * ───────────────────────────────────────────────────────── */

const MODEL_STAGE_MOTION = {
	distance: {
		lift: 12,
		nudge: 6,
		slide: 28,
	},
	duration: {
		micro: 0.18,
		reveal: 0.52,
		section: 0.34,
		shell: 0.72,
	},
	easing: {
		enter: [0.22, 1, 0.36, 1] as const,
		exit: [0.4, 0, 0.2, 1] as const,
		morph: [0.32, 0.72, 0, 1] as const,
	},
};

const MODEL_STAGE_SURFACE_TRANSITION = {
	duration: MODEL_STAGE_MOTION.duration.reveal,
	ease: MODEL_STAGE_MOTION.easing.enter,
};

const MODEL_STAGE_COPY_TRANSITION = {
	duration: MODEL_STAGE_MOTION.duration.section,
	ease: MODEL_STAGE_MOTION.easing.enter,
};

const MODEL_STAGE_LAYOUT_TRANSITION = {
	duration: MODEL_STAGE_MOTION.duration.shell,
	ease: MODEL_STAGE_MOTION.easing.morph,
};

const MODEL_STAGE_INTRO_SEQUENCE = [
	{ holdMs: 1_180, phase: "lead-in" },
	{ holdMs: 1_580, phase: "question" },
	{ holdMs: 2_600, phase: "comparison" },
] as const satisfies ReadonlyArray<{
	holdMs: number;
	phase: Extract<
		ModelStageSequencePhase,
		"lead-in" | "question" | "comparison"
	>;
}>;

const MODEL_STAGE_HISTORY_PROMPT_HOLD_MS = 560;
const MODEL_STAGE_HISTORY_REVEAL_SETTLE_MS = 1_120;
const MODEL_STAGE_RESULT_SETTLE_MS = 1_900;
const MODEL_STAGE_RESULT_DETAIL_DELAY_MS = 520;
const MODEL_STAGE_RESULT_LOGO_DELAY_MS = 760;
const MODEL_STAGE_COMPARISON_COUNTER_DURATION_MS = 2_280;
const MODEL_STAGE_RESULT_COUNTER_DURATION_MS = 1_680;
const MODEL_STAGE_HISTORY_COUNTER_DURATION_MS = 880;
const MODEL_STAGE_MIN_RESULT_FILL_SHARE = 16;
const MODEL_STAGE_FLOATING_TEXT_RENDERED_SHARE_THRESHOLD = 28;
const MODEL_STAGE_NEUTRAL_TONE = "#cfd5df";
const MODEL_STAGE_SUSPENSE_TONE = "#17161c";

export function WrappedOnboardingModelStage(props: ModelStageProps) {
	const {
		advanceState,
		onboardingMetrics,
		onComparisonSequenceComplete,
		onHistoryRevealComplete,
		previewState,
	} = props;
	const model = resolveModelStageModel(
		resolveModelPreviewInput(
			{
				modelByMonth: onboardingMetrics.modelByMonth,
				sourceSplit: onboardingMetrics.sourceSplit,
			},
			previewState,
		),
	);
	const shouldReduceMotion = useReducedMotion();
	const reduceMotion = shouldReduceMotion ?? false;
	const hasAnimatedData = model.summary.length > 0;
	const leadingSource = getLeadingModelStageSource(model.summary);
	const resultHeadline = getModelStageResultHeadline(leadingSource);
	const splitCards = [
		{
			label: "Codex",
			logo: <CodexModelStageLogo />,
			segment: model.summary.find((segment) => segment.source === "codex"),
			source: "codex",
		},
		{
			label: "Claude",
			logo: <ClaudeModelStageLogo />,
			segment: model.summary.find(
				(segment) => segment.source === "claude_code",
			),
			source: "claude_code",
		},
	] as const;
	const [phase, setPhase] = useState<ModelStageSequencePhase>(() =>
		!hasAnimatedData ? "history-bars" : reduceMotion ? "result" : "lead-in",
	);
	const sequenceTimerRefs = useRef<number[]>([]);
	const isIntroCopyPhase = phase === "lead-in" || phase === "question";
	const isSummarySceneVisible = !isIntroCopyPhase;
	const resultKicker =
		phase === "result" ? getModelStageResultKicker(leadingSource) : null;

	function clearSequenceTimers() {
		for (const timeoutId of sequenceTimerRefs.current) {
			window.clearTimeout(timeoutId);
		}

		sequenceTimerRefs.current = [];
	}

	useMountEffect(() => {
		if (!hasAnimatedData) {
			onHistoryRevealComplete?.();
			return;
		}

		if (reduceMotion) {
			setPhase("result");
			onComparisonSequenceComplete?.();
			return;
		}

		setPhase("lead-in");
		const timeoutIds: number[] = [];
		let elapsedMs = 0;

		for (const item of MODEL_STAGE_INTRO_SEQUENCE) {
			timeoutIds.push(
				window.setTimeout(() => {
					setPhase(item.phase);
				}, elapsedMs),
			);
			elapsedMs += item.holdMs;
		}

		timeoutIds.push(
			window.setTimeout(() => {
				setPhase("result");
			}, elapsedMs),
		);
		timeoutIds.push(
			window.setTimeout(() => {
				onComparisonSequenceComplete?.();
			}, elapsedMs + MODEL_STAGE_RESULT_SETTLE_MS),
		);
		sequenceTimerRefs.current = timeoutIds;

		return () => {
			clearSequenceTimers();
		};
	});

	useEffect(() => {
		if (advanceState !== "history") {
			return;
		}

		if (!hasAnimatedData) {
			onHistoryRevealComplete?.();
			return;
		}

		if (reduceMotion) {
			setPhase("history-bars");
			onHistoryRevealComplete?.();
			return;
		}

		setPhase("history-question");
		const showHistoryTimeoutId = window.setTimeout(() => {
			setPhase("history-bars");
		}, MODEL_STAGE_HISTORY_PROMPT_HOLD_MS);
		const completeHistoryTimeoutId = window.setTimeout(() => {
			onHistoryRevealComplete?.();
		}, MODEL_STAGE_HISTORY_PROMPT_HOLD_MS +
			MODEL_STAGE_HISTORY_REVEAL_SETTLE_MS);
		sequenceTimerRefs.current = [
			showHistoryTimeoutId,
			completeHistoryTimeoutId,
		];

		return () => {
			clearSequenceTimers();
		};
	}, [advanceState, hasAnimatedData, onHistoryRevealComplete, reduceMotion]);

	if (!hasAnimatedData) {
		return (
			<WrappedOnboardingStageFrame
				className="mymind-wrapped-model-stage"
				objectClassName="mymind-wrapped-model-stage__object"
				copy={
					<WrappedOnboardingStageCopy
						title={model.headline}
						description={model.subline}
					/>
				}
				object={
					<article className="mymind-wrapped-model-stage__card">
						<section className="mymind-wrapped-model-stage__summary-card">
							<div className="mymind-wrapped-model-stage__chart-shell">
								<p className="mymind-wrapped-model-stage__empty">
									The all-time split and the month-by-month stacks show up once
									session history lands.
								</p>
							</div>
						</section>
					</article>
				}
			/>
		);
	}

	return (
		<WrappedOnboardingStageFrame
			className={cn(
				"mymind-wrapped-model-stage",
				isIntroCopyPhase ? "mymind-wrapped-model-stage--intro-copy" : undefined,
				isSummarySceneVisible
					? "mymind-wrapped-model-stage--immersive"
					: undefined,
			)}
			objectClassName="mymind-wrapped-model-stage__object"
			copy={
				<motion.div
					layout="position"
					className="mymind-wrapped-model-stage__copy-shell"
					transition={MODEL_STAGE_LAYOUT_TRANSITION}
				>
					<WrappedOnboardingStageCopy
						description={
							resultKicker ? (
								<WrappedModelStageResultKicker
									kicker={resultKicker}
									reduceMotion={reduceMotion}
								/>
							) : undefined
						}
						descriptionClassName="mymind-wrapped-model-stage__result-kicker-shell"
						title={
							<WrappedModelStageSequenceTitle
								phase={phase}
								reduceMotion={reduceMotion}
								resultHeadline={resultHeadline}
							/>
						}
						titleClassName="mymind-wrapped-model-stage__headline mymind-wrapped-model-stage__headline--sequenced"
					/>
				</motion.div>
			}
			object={
				isSummarySceneVisible ? (
					<WrappedModelStageBody
						leadingSource={leadingSource}
						model={model}
						phase={phase}
						splitCards={splitCards}
					/>
				) : null
			}
		/>
	);
}

function WrappedModelStageSequenceTitle(props: {
	phase: ModelStageSequencePhase;
	reduceMotion: boolean;
	resultHeadline: string;
}) {
	const { phase, reduceMotion, resultHeadline } = props;
	const titleKey =
		phase === "lead-in"
			? "lead-in"
			: phase === "question"
				? "answer"
				: phase === "result"
					? "result"
					: phase === "history-question" || phase === "history-bars"
						? "history"
						: "hidden";
	const title =
		titleKey === "lead-in"
			? "Now comes the question..."
			: titleKey === "answer"
				? "Claude or Codex?"
				: titleKey === "result"
					? resultHeadline
					: titleKey === "history"
						? "Here's how it looked MoM"
						: null;

	if (reduceMotion) {
		return title;
	}

	return (
		<AnimatePresence initial={false} mode="wait">
			<motion.span
				key={titleKey}
				animate={{ filter: "blur(0px)", opacity: 1, scale: 1, y: 0 }}
				className={cn(
					"mymind-wrapped-model-stage__sequence-title",
					titleKey === "result" &&
						"mymind-wrapped-model-stage__sequence-title--result",
					(titleKey === "result" || titleKey === "history") &&
						"mymind-wrapped-model-stage__sequence-title--compact",
				)}
				exit={{
					filter: "blur(4px)",
					opacity: 0,
					scale: 0.992,
					y: -MODEL_STAGE_MOTION.distance.lift,
				}}
				initial={{
					filter: titleKey === "result" ? "blur(10px)" : "blur(8px)",
					opacity: 0,
					scale: titleKey === "result" ? 0.992 : 0.988,
					y:
						titleKey === "result"
							? MODEL_STAGE_MOTION.distance.lift
							: MODEL_STAGE_MOTION.distance.slide,
				}}
				transition={MODEL_STAGE_COPY_TRANSITION}
			>
				{title}
			</motion.span>
		</AnimatePresence>
	);
}

function WrappedModelStageResultKicker(props: {
	kicker: string;
	reduceMotion: boolean;
}) {
	const { kicker, reduceMotion } = props;

	if (reduceMotion) {
		return (
			<p className="mymind-wrapped-model-stage__result-kicker">{kicker}</p>
		);
	}

	return (
		<motion.p
			animate={{ filter: "blur(0px)", opacity: 1, scale: 1, y: 0 }}
			className="mymind-wrapped-model-stage__result-kicker"
			initial={{ filter: "blur(8px)", opacity: 0, scale: 0.985, y: 8 }}
			transition={{
				delay: MODEL_STAGE_RESULT_DETAIL_DELAY_MS / 1_000,
				duration: 0.28,
				ease: MODEL_STAGE_MOTION.easing.enter,
			}}
		>
			{kicker}
		</motion.p>
	);
}

function WrappedModelStageBody(props: {
	leadingSource: "claude_code" | "codex" | null;
	model: WrappedModelStageResolvedModel;
	phase: ModelStageSequencePhase;
	splitCards: readonly WrappedModelStageSplitCard[];
}) {
	const { leadingSource, model, phase, splitCards } = props;
	const shouldReduceMotion = useReducedMotion();
	const reduceMotion = shouldReduceMotion ?? false;
	const areDetailsVisible =
		phase === "result" ||
		phase === "history-question" ||
		phase === "history-bars";
	const isComparisonPhase = phase === "comparison";
	const isHistoryRevealPhase = phase === "history-bars";
	const areCountersVisible = isComparisonPhase || areDetailsVisible;
	const areSplitFillsVisible = isComparisonPhase || areDetailsVisible;
	const areMonthsVisible = phase === "history-bars";
	const totalSessionCount = splitCards.reduce(
		(sum, splitCard) => sum + (splitCard.segment?.sessionCount ?? 0),
		0,
	);
	const targetRaceShares = splitCards.map((splitCard) =>
		resolveModelStageRaceCounterShare({
			isComparisonPhase,
			isHistoryPhase: phase === "history-question" || phase === "history-bars",
			isLeading: leadingSource === splitCard.source,
			leadingSource,
			share: Math.round(splitCard.segment?.share ?? 0),
		}),
	);
	const targetRaceSharesKey = targetRaceShares.join("|");
	const raceShareRef = useRef(targetRaceShares);
	const [raceDisplayShares, setRaceDisplayShares] = useState<number[]>(() =>
		reduceMotion ? targetRaceShares : splitCards.map(() => 0),
	);
	const [areMonthBarsExpanded, setAreMonthBarsExpanded] = useState(() =>
		reduceMotion ? areMonthsVisible : false,
	);

	useEffect(() => {
		raceShareRef.current = raceDisplayShares;
	}, [raceDisplayShares]);

	useEffect(() => {
		const nextTargetShares = targetRaceSharesKey
			.split("|")
			.map((share) => Number(share));

		if (reduceMotion) {
			raceShareRef.current = nextTargetShares;
			setRaceDisplayShares(nextTargetShares);
			return;
		}

		const startShares = raceShareRef.current;
		const durationMs = resolveModelStageCounterDurationMs(phase);

		if (
			durationMs === 0 ||
			startShares.every((share, index) => share === nextTargetShares[index])
		) {
			raceShareRef.current = nextTargetShares;
			return;
		}

		let animationFrameId = 0;
		const startTime = performance.now();

		const tick = (now: number) => {
			const progress = Math.min((now - startTime) / durationMs, 1);
			const easedProgress = resolveModelStageCounterEase(phase, progress);
			const nextShares = startShares.map((startShare, index) => {
				const targetShare = nextTargetShares[index] ?? 0;
				return startShare + (targetShare - startShare) * easedProgress;
			});

			raceShareRef.current = nextShares;
			setRaceDisplayShares(nextShares);

			if (progress < 1) {
				animationFrameId = window.requestAnimationFrame(tick);
			}
		};

		animationFrameId = window.requestAnimationFrame(tick);
		return () => {
			window.cancelAnimationFrame(animationFrameId);
		};
	}, [phase, reduceMotion, targetRaceSharesKey]);

	useEffect(() => {
		if (reduceMotion) {
			setAreMonthBarsExpanded(areMonthsVisible);
			return;
		}

		if (!areMonthsVisible) {
			setAreMonthBarsExpanded(false);
			return;
		}

		const animationFrameId = window.requestAnimationFrame(() => {
			setAreMonthBarsExpanded(true);
		});

		return () => {
			window.cancelAnimationFrame(animationFrameId);
		};
	}, [areMonthsVisible, reduceMotion]);

	return (
		<motion.div
			layout
			className={cn(
				"mymind-wrapped-model-stage__scene-shell",
				isComparisonPhase &&
					"mymind-wrapped-model-stage__scene-shell--comparison",
				areDetailsVisible && "mymind-wrapped-model-stage__scene-shell--details",
				isHistoryRevealPhase &&
					"mymind-wrapped-model-stage__scene-shell--history",
			)}
			transition={{ layout: MODEL_STAGE_LAYOUT_TRANSITION }}
		>
			<motion.article
				layout
				animate={{
					filter: "blur(0px)",
					opacity: 1,
					scale: isComparisonPhase ? 1.012 : 1,
					y: isComparisonPhase ? 2 : 0,
				}}
				className="mymind-wrapped-model-stage__card"
				initial={
					reduceMotion
						? false
						: isComparisonPhase
							? {
									filter: "blur(8px)",
									opacity: 0,
									scale: 0.976,
									y: 0,
								}
							: {
									filter: "blur(10px)",
									opacity: 0,
									scale: 0.98,
									y: MODEL_STAGE_MOTION.distance.slide,
								}
				}
				transition={{
					...MODEL_STAGE_SURFACE_TRANSITION,
					layout: MODEL_STAGE_LAYOUT_TRANSITION,
				}}
			>
				<motion.section
					layout
					animate={{
						scale: areMonthsVisible ? 1 : areDetailsVisible ? 1.008 : 1,
						y: areMonthsVisible ? 0 : areDetailsVisible ? -2 : 0,
					}}
					className={cn(
						"mymind-wrapped-model-stage__summary-card",
						areMonthsVisible &&
							"mymind-wrapped-model-stage__summary-card--history",
					)}
					initial={false}
					transition={{
						...MODEL_STAGE_SURFACE_TRANSITION,
						layout: MODEL_STAGE_LAYOUT_TRANSITION,
					}}
				>
					<motion.div
						layout
						className="mymind-wrapped-model-stage__chart-shell"
						transition={{ layout: MODEL_STAGE_LAYOUT_TRANSITION }}
					>
						<WrappedModelStageMorphChart
							areCountersVisible={areCountersVisible}
							areDetailsVisible={areDetailsVisible}
							areMonthBarsExpanded={areMonthBarsExpanded}
							areMonthsVisible={areMonthsVisible}
							areSplitFillsVisible={areSplitFillsVisible}
							isComparisonPhase={isComparisonPhase}
							leadingSource={leadingSource}
							model={model}
							raceDisplayShares={raceDisplayShares}
							reduceMotion={reduceMotion}
							splitCards={splitCards}
							totalSessionCount={totalSessionCount}
						/>
					</motion.div>
				</motion.section>
			</motion.article>
		</motion.div>
	);
}

function WrappedModelStageMorphChart(props: {
	areCountersVisible: boolean;
	areDetailsVisible: boolean;
	areMonthBarsExpanded: boolean;
	areMonthsVisible: boolean;
	areSplitFillsVisible: boolean;
	isComparisonPhase: boolean;
	leadingSource: "claude_code" | "codex" | null;
	model: WrappedModelStageResolvedModel;
	raceDisplayShares: number[];
	reduceMotion: boolean;
	splitCards: readonly WrappedModelStageSplitCard[];
	totalSessionCount: number;
}) {
	const {
		areCountersVisible,
		areDetailsVisible,
		areMonthBarsExpanded,
		areMonthsVisible,
		areSplitFillsVisible,
		isComparisonPhase,
		leadingSource,
		model,
		raceDisplayShares,
		reduceMotion,
		splitCards,
		totalSessionCount,
	} = props;
	const chartSlots = areMonthsVisible
		? model.months.map((month, monthIndex) => ({
				kind: "month" as const,
				month,
				monthIndex,
				slotIndex: monthIndex,
			}))
		: splitCards.map((splitCard, splitCardIndex) => ({
				kind: "race" as const,
				splitCard,
				splitCardIndex,
				slotIndex: splitCardIndex,
			}));

	if (areMonthsVisible && chartSlots.length === 0) {
		return (
			<motion.div
				layout
				animate={{ filter: "blur(0px)", opacity: 1, scale: 1, y: 0 }}
				className="mymind-wrapped-model-stage__chart-empty-state"
				initial={
					reduceMotion
						? false
						: {
								filter: "blur(8px)",
								opacity: 0,
								scale: 0.97,
								y: MODEL_STAGE_MOTION.distance.slide,
							}
				}
				transition={MODEL_STAGE_SURFACE_TRANSITION}
			>
				<p className="mymind-wrapped-model-stage__empty">
					The monthly stacks fill in once model history spans a few sessions.
				</p>
			</motion.div>
		);
	}

	return (
		<motion.div
			layout
			className={cn(
				"mymind-wrapped-model-stage__chart-grid",
				areMonthsVisible && "mymind-wrapped-model-stage__chart-grid--history",
			)}
			transition={{ layout: MODEL_STAGE_LAYOUT_TRANSITION }}
		>
			{chartSlots.map((slot) => (
				<motion.div
					key={`slot-${slot.slotIndex}`}
					layout
					animate={{ opacity: 1, scale: 1, y: 0 }}
					className="mymind-wrapped-model-stage__chart-slot"
					initial={
						reduceMotion || slot.slotIndex < splitCards.length
							? false
							: {
									opacity: 0,
									scale: 0.9,
									y: MODEL_STAGE_MOTION.distance.slide,
								}
					}
					transition={{
						...MODEL_STAGE_SURFACE_TRANSITION,
						layout: MODEL_STAGE_LAYOUT_TRANSITION,
					}}
				>
					{slot.kind === "race" ? (
						<WrappedModelStageRaceSlot
							areCountersVisible={areCountersVisible}
							areDetailsVisible={areDetailsVisible}
							areSplitFillsVisible={areSplitFillsVisible}
							isComparisonPhase={isComparisonPhase}
							leadingSource={leadingSource}
							raceDisplayShare={raceDisplayShares[slot.splitCardIndex] ?? 0}
							reduceMotion={reduceMotion}
							splitCard={slot.splitCard}
							splitCardIndex={slot.splitCardIndex}
							totalSessionCount={totalSessionCount}
						/>
					) : (
						<WrappedModelStageMonthSlot
							areMonthBarsExpanded={areMonthBarsExpanded}
							month={slot.month}
							monthIndex={slot.monthIndex}
							reduceMotion={reduceMotion}
						/>
					)}
				</motion.div>
			))}
		</motion.div>
	);
}

function WrappedModelStageRaceSlot(props: {
	areCountersVisible: boolean;
	areDetailsVisible: boolean;
	areSplitFillsVisible: boolean;
	isComparisonPhase: boolean;
	leadingSource: "claude_code" | "codex" | null;
	raceDisplayShare: number;
	reduceMotion: boolean;
	splitCard: WrappedModelStageSplitCard;
	splitCardIndex: number;
	totalSessionCount: number;
}) {
	const {
		areCountersVisible,
		areDetailsVisible,
		areSplitFillsVisible,
		isComparisonPhase,
		leadingSource,
		raceDisplayShare,
		reduceMotion,
		splitCard,
		splitCardIndex,
		totalSessionCount,
	} = props;
	const displayedShare = Math.round(raceDisplayShare);
	const share = Math.round(splitCard.segment?.share ?? 0);
	const sessionCount = splitCard.segment?.sessionCount ?? 0;
	const displayedSessionCount = resolveModelStageDisplayedSessionCount({
		displayedShare,
		isComparisonPhase,
		sessionCount,
		totalSessionCount,
	});
	const sessionLabel = `${displayedSessionCount.toLocaleString()} ${
		displayedSessionCount === 1 ? "session" : "sessions"
	}`;
	const isLeading = leadingSource === splitCard.source;
	const renderedFillShare = resolveModelStageRenderedFillShare({
		animatedShare: raceDisplayShare,
		areDetailsVisible,
		isLeading,
		leadingSource,
		share,
	});
	const shouldFloatBarText = shouldFloatModelStageBarText({
		areDetailsVisible,
		isLeading,
		leadingSource,
		renderedFillShare,
	});
	const floatingTextBottomShare = Math.max(
		renderedFillShare,
		MODEL_STAGE_MIN_RESULT_FILL_SHARE,
	);
	const revealFillStyle = areDetailsVisible
		? getModelStageRevealFillStyle(splitCard.source)
		: null;
	const raceRowStyle: ModelRaceRowStyle = {
		"--model-stage-race-tint": isComparisonPhase
			? MODEL_STAGE_SUSPENSE_TONE
			: areDetailsVisible
				? getModelStageRevealTint(splitCard.source)
				: MODEL_STAGE_NEUTRAL_TONE,
		"--model-stage-race-fill-background": revealFillStyle?.background,
		"--model-stage-race-fill-box-shadow": revealFillStyle?.boxShadow,
		"--model-stage-race-fill-highlight-opacity":
			revealFillStyle?.highlightOpacity,
		"--model-stage-race-fill-radius": revealFillStyle?.borderRadius,
	};
	const splitCardDelay = reduceMotion
		? 0
		: resolveModelStageCardDelaySeconds({
				index: splitCardIndex,
				isLeading,
				leadingSource,
			});
	const counterDelaySeconds = reduceMotion
		? 0
		: isComparisonPhase
			? 0.1 + splitCardIndex * 0.08
			: areCountersVisible
				? MODEL_STAGE_RESULT_DETAIL_DELAY_MS / 1_000
				: 0;
	const fillTransition = {
		opacity: reduceMotion
			? { duration: 0 }
			: {
					duration: 0.26,
					ease: MODEL_STAGE_MOTION.easing.enter,
					delay: isComparisonPhase ? splitCardIndex * 0.06 : splitCardDelay,
				},
	};

	return (
		<motion.div
			animate={{ filter: "blur(0px)", opacity: 1, scale: 1, y: 0 }}
			className={cn(
				"mymind-wrapped-model-stage__race-row",
				isLeading && "is-leading",
			)}
			initial={
				reduceMotion
					? false
					: {
							filter: isComparisonPhase ? "blur(8px)" : "blur(10px)",
							opacity: 0,
							scale: 0.95,
							y: isComparisonPhase ? 24 : MODEL_STAGE_MOTION.distance.slide,
						}
			}
			style={raceRowStyle}
			transition={{
				filter: {
					duration: MODEL_STAGE_MOTION.duration.reveal,
					ease: MODEL_STAGE_MOTION.easing.enter,
					delay: isComparisonPhase ? 0 : splitCardDelay,
				},
				opacity: {
					duration: 0.26,
					ease: MODEL_STAGE_MOTION.easing.enter,
					delay: isComparisonPhase ? 0 : splitCardDelay,
				},
				scale: reduceMotion
					? { duration: 0 }
					: {
							type: "spring",
							stiffness: areDetailsVisible ? 260 : 220,
							damping: 22,
							mass: isLeading ? 0.9 : 1,
							delay: isComparisonPhase ? 0 : splitCardDelay,
						},
				y: reduceMotion
					? { duration: 0 }
					: {
							type: "spring",
							stiffness: areDetailsVisible ? 240 : 210,
							damping: 24,
							mass: 0.94,
							delay: isComparisonPhase ? 0 : splitCardDelay,
						},
			}}
		>
			<div className="mymind-wrapped-model-stage__race-track-shell">
				<div
					aria-hidden="true"
					className="mymind-wrapped-model-stage__race-track-grid"
				/>
				<div className="mymind-wrapped-model-stage__race-track">
					<motion.div
						animate={{
							opacity: areSplitFillsVisible ? 1 : 0,
						}}
						className="mymind-wrapped-model-stage__race-fill"
						initial={false}
						style={{
							height: areSplitFillsVisible ? `${renderedFillShare}%` : "0%",
						}}
						transition={fillTransition}
					>
						{shouldFloatBarText ? null : (
							<div className="mymind-wrapped-model-stage__race-value-anchor">
								<motion.p
									animate={{
										opacity: areCountersVisible ? 1 : 0,
										scale: areCountersVisible ? 1 : 0.92,
										y: areCountersVisible ? 0 : 12,
									}}
									className="mymind-wrapped-model-stage__race-value"
									initial={false}
									transition={{
										opacity: {
											duration: 0.24,
											ease: MODEL_STAGE_MOTION.easing.enter,
											delay: counterDelaySeconds,
										},
										scale: reduceMotion
											? { duration: 0 }
											: {
													type: "spring",
													stiffness: 260,
													damping: 20,
													mass: 0.85,
													delay: counterDelaySeconds,
												},
										y: reduceMotion
											? { duration: 0 }
											: {
													type: "spring",
													stiffness: 240,
													damping: 22,
													mass: 0.9,
													delay: counterDelaySeconds,
												},
									}}
								>
									{displayedShare}%
								</motion.p>
								<motion.p
									animate={{
										opacity: areCountersVisible ? 1 : 0,
										scale: areCountersVisible ? 1 : 0.96,
										y: areCountersVisible ? 0 : 10,
									}}
									className="mymind-wrapped-model-stage__race-session-count"
									initial={false}
									transition={{
										opacity: {
											duration: 0.22,
											ease: MODEL_STAGE_MOTION.easing.enter,
											delay: counterDelaySeconds + 0.08,
										},
										scale: reduceMotion
											? { duration: 0 }
											: {
													type: "spring",
													stiffness: 220,
													damping: 22,
													mass: 0.92,
													delay: counterDelaySeconds + 0.08,
												},
										y: reduceMotion
											? { duration: 0 }
											: {
													type: "spring",
													stiffness: 210,
													damping: 24,
													mass: 0.96,
													delay: counterDelaySeconds + 0.08,
												},
									}}
								>
									{sessionLabel}
								</motion.p>
							</div>
						)}
						<motion.div
							animate={{
								opacity: areDetailsVisible ? 1 : 0,
								scale: areDetailsVisible ? 1 : 0.84,
								y: areDetailsVisible ? 0 : 14,
							}}
							aria-hidden="true"
							className={cn(
								"mymind-wrapped-model-stage__split-logo",
								"mymind-wrapped-model-stage__split-logo--in-bar",
								areDetailsVisible &&
									share === 0 &&
									"mymind-wrapped-model-stage__split-logo--zero-result",
							)}
							initial={false}
							transition={{
								opacity: {
									duration: 0.24,
									ease: MODEL_STAGE_MOTION.easing.enter,
									delay: areDetailsVisible
										? MODEL_STAGE_RESULT_LOGO_DELAY_MS / 1_000
										: 0,
								},
								scale: reduceMotion
									? { duration: 0 }
									: {
											type: "spring",
											stiffness: 260,
											damping: 18,
											mass: 0.82,
											delay: areDetailsVisible
												? MODEL_STAGE_RESULT_LOGO_DELAY_MS / 1_000
												: 0,
										},
								y: reduceMotion
									? { duration: 0 }
									: {
											type: "spring",
											stiffness: 240,
											damping: 22,
											mass: 0.9,
											delay: areDetailsVisible
												? MODEL_STAGE_RESULT_LOGO_DELAY_MS / 1_000
												: 0,
										},
							}}
						>
							{splitCard.logo}
						</motion.div>
					</motion.div>
				</div>
				{shouldFloatBarText ? (
					<div
						className="mymind-wrapped-model-stage__race-value-anchor-shell"
						style={{
							bottom: `calc(${floatingTextBottomShare}% + clamp(0.55rem, 1.8svh, 0.85rem))`,
						}}
					>
						<motion.div
							animate={{
								opacity: areDetailsVisible ? 1 : 0,
								scale: areDetailsVisible ? 1 : 0.84,
								y: areDetailsVisible ? 0 : 14,
							}}
							className="mymind-wrapped-model-stage__race-value-anchor mymind-wrapped-model-stage__race-value-anchor--outside"
							initial={false}
							transition={{
								opacity: {
									duration: 0.24,
									ease: MODEL_STAGE_MOTION.easing.enter,
									delay: counterDelaySeconds,
								},
								scale: reduceMotion
									? { duration: 0 }
									: {
											type: "spring",
											stiffness: 240,
											damping: 20,
											mass: 0.86,
											delay: counterDelaySeconds,
										},
								y: reduceMotion
									? { duration: 0 }
									: {
											type: "spring",
											stiffness: 220,
											damping: 22,
											mass: 0.92,
											delay: counterDelaySeconds,
										},
							}}
						>
							<p className="mymind-wrapped-model-stage__race-value">
								{displayedShare}%
							</p>
							<p className="mymind-wrapped-model-stage__race-session-count">
								{sessionLabel}
							</p>
						</motion.div>
					</div>
				) : null}
			</div>
			<motion.p
				animate={{
					opacity: areDetailsVisible ? 1 : 0,
					scale: areDetailsVisible ? 1 : 0.96,
					y: areDetailsVisible ? 0 : 8,
				}}
				aria-hidden={!areDetailsVisible}
				className="mymind-wrapped-model-stage__month-label"
				initial={false}
				transition={{
					opacity: {
						duration: 0.22,
						ease: MODEL_STAGE_MOTION.easing.enter,
						delay: areDetailsVisible
							? MODEL_STAGE_RESULT_DETAIL_DELAY_MS / 1_000
							: 0,
					},
					scale: reduceMotion
						? { duration: 0 }
						: {
								type: "spring",
								stiffness: 240,
								damping: 22,
								mass: 0.92,
								delay: areDetailsVisible
									? MODEL_STAGE_RESULT_DETAIL_DELAY_MS / 1_000
									: 0,
							},
					y: reduceMotion
						? { duration: 0 }
						: {
								type: "spring",
								stiffness: 220,
								damping: 24,
								mass: 0.96,
								delay: areDetailsVisible
									? MODEL_STAGE_RESULT_DETAIL_DELAY_MS / 1_000
									: 0,
							},
				}}
			>
				{splitCard.label}
			</motion.p>
		</motion.div>
	);
}

function WrappedModelStageMonthSlot(props: {
	areMonthBarsExpanded: boolean;
	month: WrappedModelStageResolvedModel["months"][number];
	monthIndex: number;
	reduceMotion: boolean;
}) {
	const { areMonthBarsExpanded, month, monthIndex, reduceMotion } = props;

	return (
		<motion.div
			animate={{ filter: "blur(0px)", opacity: 1, scale: 1, y: 0 }}
			className="mymind-wrapped-model-stage__month-column"
			initial={
				reduceMotion
					? false
					: {
							filter: "blur(8px)",
							opacity: 0,
							scale: 0.96,
							y: MODEL_STAGE_MOTION.distance.nudge,
						}
			}
			title={
				month.totalSessions > 0
					? `${month.label}: ${month.leaderLabel} led with ${month.leaderShare}%`
					: `${month.label}: no model activity`
			}
			transition={MODEL_STAGE_SURFACE_TRANSITION}
		>
			<div className="mymind-wrapped-model-stage__race-track-shell">
				<div
					aria-hidden="true"
					className="mymind-wrapped-model-stage__race-track-grid"
				/>
				<div className="mymind-wrapped-model-stage__race-track">
					<span
						aria-hidden="true"
						className={cn(
							"mymind-wrapped-model-stage__month-track-stack",
							month.totalSessions === 0 ? "is-empty" : null,
						)}
					>
						{month.segments.map((segment, segmentIndex) => {
							const revealFillStyle = getModelStageRevealFillStyle(
								segment.source,
							);
							const segmentStyle: ModelSegmentStyle = {
								"--model-stage-segment-background":
									revealFillStyle.background ?? "#d9dee7",
								"--model-stage-segment-box-shadow": revealFillStyle.boxShadow,
								"--model-stage-segment-highlight-opacity":
									revealFillStyle.highlightOpacity,
								"--model-stage-segment-delay": `${0.08 * monthIndex + 0.04 * segmentIndex}s`,
								"--model-stage-segment-share": areMonthBarsExpanded
									? `${segment.share}%`
									: "0%",
							};

							return (
								<span
									key={segment.id}
									className="mymind-wrapped-model-stage__month-segment"
									style={segmentStyle}
								/>
							);
						})}
					</span>
				</div>
			</div>
			<p className="mymind-wrapped-model-stage__month-label">{month.label}</p>
		</motion.div>
	);
}

function getLeadingModelStageSource(
	summary: ReturnType<typeof resolveModelStageModel>["summary"],
) {
	const summaryWithCounts = summary.filter(
		(segment) => segment.sessionCount > 0 || segment.share > 0,
	);
	const [firstSegment, secondSegment] = summaryWithCounts;

	if (!firstSegment) {
		return null;
	}

	if (!secondSegment) {
		return firstSegment.source;
	}

	if (firstSegment.sessionCount === secondSegment.sessionCount) {
		return null;
	}

	return firstSegment.sessionCount > secondSegment.sessionCount
		? firstSegment.source
		: secondSegment.source;
}

function getModelStageRevealTint(source: "claude_code" | "codex") {
	return source === "claude_code" ? "#DA7757" : "#3628F9";
}

function getModelStageRevealFillStyle(source: "claude_code" | "codex") {
	if (source === "claude_code") {
		return {
			background: "#DA7757",
			borderRadius: "2rem 2rem 1.45rem 1.45rem",
			boxShadow: undefined,
			highlightOpacity: "0",
		};
	}

	return {
		background:
			"linear-gradient(180deg, #B09AFF 0%, #7795F7 56.73%, #3628F9 100%)",
		borderRadius: undefined,
		boxShadow: "inset 0px 0px 7.5px #FFFFFF",
		highlightOpacity: "0",
	};
}

function getModelStageResultHeadline(
	leadingSource: "claude_code" | "codex" | null,
) {
	if (leadingSource === "claude_code") {
		return "Claude pilled.";
	}

	if (leadingSource === "codex") {
		return "Codex pilled.";
	}

	return "Both pilled.";
}

function getModelStageResultKicker(
	leadingSource: "claude_code" | "codex" | null,
) {
	if (leadingSource === "claude_code") {
		return "Dario loves you";
	}

	if (leadingSource === "codex") {
		return "Uncle Sam's proud";
	}

	return null;
}

function resolveModelStageCardDelaySeconds(input: {
	index: number;
	isLeading: boolean;
	leadingSource: "claude_code" | "codex" | null;
}) {
	const { index, isLeading, leadingSource } = input;

	if (leadingSource === null) {
		return index * 0.08;
	}

	return isLeading ? 0.04 : 0.16;
}

function shouldFloatModelStageBarText(input: {
	areDetailsVisible: boolean;
	isLeading: boolean;
	leadingSource: "claude_code" | "codex" | null;
	renderedFillShare: number;
}) {
	const { areDetailsVisible, isLeading, leadingSource, renderedFillShare } =
		input;

	if (!areDetailsVisible || leadingSource === null || isLeading) {
		return false;
	}

	return (
		renderedFillShare <= MODEL_STAGE_FLOATING_TEXT_RENDERED_SHARE_THRESHOLD
	);
}

function resolveModelStageDisplayedSessionCount(input: {
	displayedShare: number;
	isComparisonPhase: boolean;
	sessionCount: number;
	totalSessionCount: number;
}) {
	const { displayedShare, isComparisonPhase, sessionCount, totalSessionCount } =
		input;

	if (!isComparisonPhase || totalSessionCount <= 0) {
		return sessionCount;
	}

	return Math.round((totalSessionCount * displayedShare) / 100);
}

function resolveModelStageRenderedFillShare(input: {
	animatedShare: number;
	areDetailsVisible: boolean;
	isLeading: boolean;
	leadingSource: "claude_code" | "codex" | null;
	share: number;
}) {
	const { animatedShare, areDetailsVisible, isLeading, leadingSource, share } =
		input;

	if (!areDetailsVisible || leadingSource === null || isLeading) {
		return animatedShare;
	}

	if (share > MODEL_STAGE_MIN_RESULT_FILL_SHARE) {
		return animatedShare;
	}

	return Math.max(animatedShare, MODEL_STAGE_MIN_RESULT_FILL_SHARE);
}

function resolveModelStageRaceCounterShare(input: {
	isComparisonPhase: boolean;
	isHistoryPhase: boolean;
	isLeading: boolean;
	leadingSource: "claude_code" | "codex" | null;
	share: number;
}) {
	const { isComparisonPhase, isHistoryPhase, isLeading, leadingSource, share } =
		input;

	if (isComparisonPhase && !isHistoryPhase) {
		if (leadingSource === null) {
			return 50;
		}

		return isLeading
			? clampModelStageShare(share, 50, 51)
			: clampModelStageShare(Math.max(share, 48), 48, 49);
	}

	if (share <= 0) {
		return 0;
	}

	return share;
}

function resolveModelStageCounterDurationMs(phase: ModelStageSequencePhase) {
	if (phase === "comparison") {
		return MODEL_STAGE_COMPARISON_COUNTER_DURATION_MS;
	}

	if (
		phase === "result" ||
		phase === "history-question" ||
		phase === "history-bars"
	) {
		return phase === "result"
			? MODEL_STAGE_RESULT_COUNTER_DURATION_MS
			: MODEL_STAGE_HISTORY_COUNTER_DURATION_MS;
	}

	return 0;
}

function resolveModelStageCounterEase(
	phase: ModelStageSequencePhase,
	progress: number,
) {
	if (phase === "comparison") {
		return 1 - (1 - progress) ** 3;
	}

	return 1 - (1 - progress) ** 4;
}

function clampModelStageShare(value: number, minimum: number, maximum: number) {
	return Math.min(maximum, Math.max(minimum, value));
}

function ClaudeModelStageLogo() {
	return (
		<svg
			viewBox="0 0 1200 1200"
			aria-hidden="true"
			className="mymind-wrapped-model-stage__brand-icon"
		>
			<path
				fill="currentColor"
				d="M233.959793 800.214905L468.644287 668.536987L472.590637 657.100647L468.644287 650.738403L457.208069 650.738403L417.986633 648.322144L283.892639 644.69812L167.597321 639.865845L54.926208 633.825623L26.577238 627.785339L0.00033 592.751709L2.73832 575.27533L26.577238 559.248352L60.724873 562.228149L136.187973 567.382629L249.422867 575.194763L331.570496 580.026978L453.261841 592.671082L472.590637 592.671082L475.328857 584.859009L468.724915 580.026978L463.570557 575.194763L346.389313 495.785217L219.543671 411.865906L153.100723 363.543762L117.181267 339.060425L99.060455 316.107361L91.248367 266.01355L123.865784 230.093994L167.677887 233.073853L178.872513 236.053772L223.248367 270.201477L318.040283 343.570496L441.825592 434.738342L459.946411 449.798706L467.194672 444.64447L468.080597 441.020203L459.946411 427.409485L392.617493 305.718323L320.778564 181.932983L288.80542 130.630859L280.348999 99.865845C277.369171 87.221436 275.194641 76.590698 275.194641 63.624268L312.322174 13.20813L332.8591 6.604126L382.389313 13.20813L403.248352 31.328979L434.013519 101.71814L483.865753 212.537048L561.181274 363.221497L583.812134 407.919434L595.892639 449.315491L600.40271 461.959839L608.214783 461.959839L608.214783 454.711609L614.577271 369.825623L626.335632 265.61084L637.771851 131.516846L641.718201 93.745117L660.402832 48.483276L697.530334 24.000122L726.52356 37.852417L750.362549 72L747.060486 94.067139L732.886047 186.201416L705.100708 330.52356L686.979919 427.167847L697.530334 427.167847L709.61084 415.087341L758.496704 350.174561L840.644348 247.490051L876.885925 206.738342L919.167847 161.71814L946.308838 140.29541L997.61084 140.29541L1035.38269 196.429626L1018.469849 254.416199L965.637634 321.422852L921.825562 378.201538L859.006714 462.765259L819.785278 530.41626L823.409424 535.812073L832.75177 534.92627L974.657776 504.724915L1051.328979 490.872559L1142.818848 475.167786L1184.214844 494.496582L1188.724854 514.147644L1172.456421 554.335693L1074.604126 578.496765L959.838989 601.449829L788.939636 641.879272L786.845764 643.409485L789.261841 646.389343L866.255127 653.637634L899.194702 655.409424L979.812134 655.409424L1129.932861 666.604187L1169.154419 692.537109L1192.671265 724.268677L1188.724854 748.429688L1128.322144 779.194641L1046.818848 759.865845L856.590759 714.604126L791.355774 698.335754L782.335693 698.335754L782.335693 703.731567L836.69812 756.885986L936.322205 846.845581L1061.073975 962.81897L1067.436279 991.490112L1051.409424 1014.120911L1034.496704 1011.704712L924.885986 929.234924L882.604126 892.107544L786.845764 811.48999L780.483276 811.48999L780.483276 819.946289L802.550415 852.241699L919.087341 1027.409424L925.127625 1081.127686L916.671204 1098.604126L886.469849 1109.154419L853.288696 1103.114136L785.073914 1007.355835L714.684631 899.516785L657.906067 802.872498L650.979858 806.81897L617.476624 1167.704834L601.771851 1186.147705L565.530212 1200L535.328857 1177.046997L519.302124 1139.919556L535.328857 1066.550537L554.657776 970.792053L570.362488 894.68457L584.536926 800.134277L592.993347 768.724976L592.429626 766.630859L585.503479 767.516968L514.22821 865.369263L405.825531 1011.865906L320.053711 1103.677979L299.516815 1111.812256L263.919525 1093.369263L267.221497 1060.429688L287.114136 1031.114136L405.825531 880.107361L477.422913 786.52356L523.651062 732.483276L523.328918 724.671265L520.590698 724.671265L205.288605 929.395935L149.154434 936.644409L124.993355 914.01355L127.973183 876.885986L139.409409 864.80542L234.201385 799.570435L233.879227 799.8927Z"
			/>
		</svg>
	);
}

function CodexModelStageLogo() {
	return (
		<svg
			viewBox="0 0 320 320"
			aria-hidden="true"
			className="mymind-wrapped-model-stage__brand-icon"
		>
			<path
				fill="currentColor"
				d="M297.06 130.97c7.26-21.79 4.76-45.66-6.85-65.48-17.46-30.4-52.56-46.04-86.84-38.68-15.25-17.18-37.16-26.95-60.13-26.81-35.04-.08-66.13 22.48-76.91 55.82-22.51 4.61-41.94 18.7-53.31 38.67-17.59 30.32-13.58 68.54 9.92 94.54-7.26 21.79-4.76 45.66 6.85 65.48 17.46 30.4 52.56 46.04 86.84 38.68 15.24 17.18 37.16 26.95 60.13 26.8 35.06.09 66.16-22.49 76.94-55.86 22.51-4.61 41.94-18.7 53.31-38.67 17.57-30.32 13.55-68.51-9.94-94.51zm-120.28 168.11c-14.03.02-27.62-4.89-38.39-13.88.49-.26 1.34-.73 1.89-1.07l63.72-36.8c3.26-1.85 5.26-5.32 5.24-9.07v-89.83l26.93 15.55c.29.14.48.42.52.74v74.39c-.04 33.08-26.83 59.9-59.91 59.97zm-128.84-55.03c-7.03-12.14-9.56-26.37-7.15-40.18.47.28 1.3.79 1.89 1.13l63.72 36.8c3.23 1.89 7.23 1.89 10.47 0l77.79-44.92v31.1c.02.32-.13.63-.38.83l-64.41 37.19c-28.69 16.52-65.33 6.7-81.92-21.95zm-16.77-139.09c7-12.16 18.05-21.46 31.21-26.29 0 .55-.03 1.52-.03 2.2v73.61c-.02 3.74 1.98 7.21 5.23 9.06l77.79 44.91-26.93 15.55c-.27.18-.61.21-.91.08l-64.42-37.22c-28.63-16.58-38.45-53.21-21.95-81.89zm221.26 51.49-77.79-44.92 26.93-15.54c.27-.18.61-.21.91-.08l64.42 37.19c28.68 16.57 38.51 53.26 21.94 81.94-7.01 12.14-18.05 21.44-31.2 26.28v-75.81c.03-3.74-1.96-7.2-5.2-9.06zm26.8-40.34c-.47-.29-1.3-.79-1.89-1.13l-63.72-36.8c-3.23-1.89-7.23-1.89-10.47 0l-77.79 44.92v-31.1c-.02-.32.13-.63.38-.83l64.41-37.16c28.69-16.55 65.37-6.7 81.91 22 6.99 12.12 9.52 26.31 7.15 40.1zm-168.51 55.43-26.94-15.55c-.29-.14-.48-.42-.52-.74v-74.39c.02-33.12 26.89-59.96 60.01-59.94 14.01 0 27.57 4.92 38.34 13.88-.49.26-1.33.73-1.89 1.07l-63.72 36.8c-3.26 1.85-5.26 5.31-5.24 9.06l-.04 89.79zm14.63-31.54 34.65-20.01 34.65 20v40.01l-34.65 20-34.65-20z"
			/>
		</svg>
	);
}
