import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { CSSProperties } from "react";
import { useRef, useState } from "react";
import { useMountEffect } from "@/hooks/useMountEffect";
import { formatCompactWholeCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
	resolveLockInPreviewInput,
	resolveLockInStageModel,
	resolveQualityPreviewInput,
	resolveQualityStageModel,
	resolveRepoPulsePreviewInput,
	resolveRepoPulseStageModel,
	resolveScaleEstimatedSpendUsd,
	resolveScalePreviewTokens,
	resolveScaleStageModel,
} from "../models";
import type {
	WrappedOnboardingMetrics,
	WrappedScaleAdvanceState,
} from "../types";
import {
	WrappedOnboardingStageCopy,
	WrappedOnboardingStageFrame,
} from "./frame";

interface SharedStageProps {
	displayName?: string;
	onboardingMetrics: WrappedOnboardingMetrics;
	onScaleAdvanceSequenceComplete?: () => void;
	onScaleRainRevealChange?: (isVisible: boolean) => void;
	previewState: string;
	scaleAdvanceState?: WrappedScaleAdvanceState;
	scaleDisplayedTokens?: number;
	totalSessions?: number;
}

interface LockInMeterStyle extends CSSProperties {
	"--lock-in-stage-meter-value": string;
}

interface QualityMeterStyle extends CSSProperties {
	"--quality-stage-meter-value": string;
}

interface ScaleKebabDrop {
	bounceDamping: number;
	floorThreshold: number;
	friction: number;
	gravityPx: number;
	id: string;
	initialVelocityXPx: number;
	maxBounces: number;
	sizePx: number;
	sourceXPercent: number;
	sourceYOffsetPx: number;
	spawnJitterPx: number;
	squashMultiplier: number;
}

interface ScaleKebabSimulationDrop extends ScaleKebabDrop {
	active: boolean;
	bounceCount: number;
	exiting: boolean;
	hasTouchedFloor: boolean;
	opacity: number;
	radius: number;
	squashScaleX: number;
	squashScaleY: number;
	squashUntilMs: number;
	vx: number;
	vy: number;
	x: number;
	y: number;
}

const SCALE_STAGE_KEBAB_COST_USD = 8;
const SCALE_STAGE_KEBAB_EMOJI = "🥙";
const SCALE_STAGE_KEBAB_EXIT_VELOCITY_PX = 3.8;
const SCALE_STAGE_KEBAB_SQUASH_DURATION_MS = 120;
export const SCALE_STAGE_SPEND_LABEL_HOLD_MS = 500;
export const SCALE_STAGE_SPEND_COUNT_DURATION_MS = 680;
const SCALE_STAGE_SPEND_TO_KEBAB_DELAY_MS = 280;
export const SCALE_STAGE_KEBAB_REVEAL_MS =
	SCALE_STAGE_SPEND_LABEL_HOLD_MS +
	SCALE_STAGE_SPEND_COUNT_DURATION_MS +
	SCALE_STAGE_SPEND_TO_KEBAB_DELAY_MS;

export function WrappedOnboardingScaleStage(props: SharedStageProps) {
	const {
		displayName,
		onboardingMetrics,
		onScaleAdvanceSequenceComplete,
		onScaleRainRevealChange,
		previewState,
		scaleAdvanceState,
		scaleDisplayedTokens,
		totalSessions,
	} = props;
	const totalTokens = resolveScalePreviewTokens(
		onboardingMetrics.totalTokens,
		previewState,
	);
	const model = resolveScaleStageModel(totalTokens);
	const sessionCount = totalSessions ?? onboardingMetrics.totalSessions;
	const estimatedSpendUsd = resolveScaleEstimatedSpendUsd({
		baseCostTokenBasis: onboardingMetrics.estimatedCostTokenBasis,
		baseCostUsd: onboardingMetrics.estimatedCostUsd,
		totalTokens: model.totalTokens,
	});

	return (
		<WrappedOnboardingStageFrame
			className="mymind-wrapped-scale-stage"
			copy={
				<WrappedOnboardingStageCopy
					title={
						<WrappedScaleStageSequenceTitle
							displayName={displayName}
							displayTokens={scaleDisplayedTokens ?? 0}
							estimatedSpendUsd={estimatedSpendUsd}
							onAdvanceSequenceComplete={onScaleAdvanceSequenceComplete}
							onRevealChange={onScaleRainRevealChange}
							scaleAdvanceState={scaleAdvanceState ?? "idle"}
							totalSessions={sessionCount}
							totalTokens={model.totalTokens}
						/>
					}
					titleClassName={cn(
						"mymind-wrapped-scale-stage__headline",
						model.totalTokens > 0
							? "mymind-wrapped-scale-stage__headline--sequenced"
							: undefined,
					)}
				/>
			}
		/>
	);
}

type ScaleStageSequencePhase = "greeting" | "sessions" | "burned" | "total";

const SCALE_STAGE_SEQUENCE = [
	{ phase: "greeting", holdMs: 2_000 },
	{ phase: "sessions", holdMs: 2_000 },
	{ phase: "burned", holdMs: 2_000 },
] as const satisfies ReadonlyArray<{
	holdMs: number;
	phase: Exclude<ScaleStageSequencePhase, "total">;
}>;

const SCALE_STAGE_SEQUENCE_TRANSITION = {
	duration: 0.26,
	ease: [0.22, 1, 0.36, 1] as const,
};

function WrappedScaleStageSequenceTitle(props: {
	displayName?: string;
	displayTokens: number;
	estimatedSpendUsd: number;
	onAdvanceSequenceComplete?: () => void;
	onRevealChange?: (isVisible: boolean) => void;
	scaleAdvanceState: WrappedScaleAdvanceState;
	totalSessions: number;
	totalTokens: number;
}) {
	const {
		displayName,
		displayTokens,
		estimatedSpendUsd,
		onAdvanceSequenceComplete,
		onRevealChange,
		scaleAdvanceState,
		totalSessions,
		totalTokens,
	} = props;
	const shouldReduceMotion = useReducedMotion();
	const reduceMotion = shouldReduceMotion ?? false;
	const isScaleAdvanceVisible = scaleAdvanceState !== "idle";
	const totalKebabs = resolveScaleKebabCount(estimatedSpendUsd);
	const kebabDropCount = totalKebabs;
	const [phase, setPhase] = useState<ScaleStageSequencePhase>(() =>
		reduceMotion ? "total" : "greeting",
	);

	useMountEffect(() => {
		if (reduceMotion) {
			setPhase("total");
			onRevealChange?.(true);
			return;
		}

		setPhase("greeting");
		onRevealChange?.(false);
		const timeoutIds: number[] = [];
		let elapsedMs = 0;

		for (const item of SCALE_STAGE_SEQUENCE) {
			elapsedMs += item.holdMs;
			timeoutIds.push(
				window.setTimeout(() => {
					setPhase(item.phase);
				}, elapsedMs - item.holdMs),
			);
		}

		timeoutIds.push(
			window.setTimeout(() => {
				setPhase("total");
				onRevealChange?.(true);
			}, elapsedMs),
		);

		return () => {
			for (const timeoutId of timeoutIds) {
				window.clearTimeout(timeoutId);
			}
		};
	});

	return (
		<AnimatePresence initial={false} mode="wait">
			<motion.span
				key={
					isScaleAdvanceVisible
						? `advance:${estimatedSpendUsd}:${totalKebabs}:${kebabDropCount}`
						: `${phase}:${displayName ?? ""}:${totalSessions}:${totalTokens}`
				}
				animate={{ opacity: 1, scale: 1, y: 0 }}
				className="mymind-wrapped-scale-stage__title-shell"
				exit={{ opacity: 0, scale: 0.985, y: -18 }}
				initial={{ opacity: 0, scale: 0.985, y: 18 }}
				transition={SCALE_STAGE_SEQUENCE_TRANSITION}
			>
				{isScaleAdvanceVisible ? (
					<WrappedScaleSpendTitle
						estimatedSpendUsd={estimatedSpendUsd}
						onSequenceComplete={onAdvanceSequenceComplete}
						showKebabs={
							scaleAdvanceState === "kebabs" || scaleAdvanceState === "complete"
						}
						totalKebabs={totalKebabs}
						visibleKebabDrops={kebabDropCount}
					/>
				) : phase === "total" ? (
					<WrappedScaleCountTitle
						displayTokens={displayTokens}
						totalTokens={totalTokens}
					/>
				) : (
					resolveScaleStageSequenceLine(phase, displayName, totalSessions)
				)}
			</motion.span>
		</AnimatePresence>
	);
}

function resolveScaleStageSequenceLine(
	phase: Exclude<ScaleStageSequencePhase, "total">,
	displayName: string | undefined,
	totalSessions: number,
) {
	if (phase === "greeting") {
		const trimmedName = displayName?.trim();
		return trimmedName ? `Hey ${trimmedName}.` : "Hey there.";
	}

	if (phase === "sessions") {
		const sessionLabel = totalSessions === 1 ? "session" : "sessions";
		return `Out of the ${totalSessions.toLocaleString("en-US")} ${sessionLabel} you uploaded...`;
	}

	return "You've burned...";
}

function WrappedScaleCountTitle(props: {
	displayTokens: number;
	totalTokens: number;
}) {
	const { displayTokens, totalTokens } = props;
	const shouldReduceMotion = useReducedMotion();
	const reduceMotion = shouldReduceMotion ?? false;
	const visibleTokens = reduceMotion
		? totalTokens
		: Math.max(0, Math.min(totalTokens, displayTokens));
	const hasFinishedCounting = reduceMotion || visibleTokens >= totalTokens;

	return (
		<span className="mymind-wrapped-scale-stage__count-shell">
			<span className="mymind-wrapped-scale-stage__count-value">
				{visibleTokens.toLocaleString("en-US")}
			</span>
			<AnimatePresence initial={false}>
				{hasFinishedCounting ? (
					<motion.span
						key="tokens-label"
						animate={
							reduceMotion
								? { opacity: 1 }
								: { filter: "blur(0px)", opacity: 1, y: 0 }
						}
						className="mymind-wrapped-scale-stage__count-unit"
						initial={
							reduceMotion
								? { opacity: 0 }
								: { filter: "blur(8px)", opacity: 0, y: 8 }
						}
						exit={
							reduceMotion
								? { opacity: 0 }
								: { filter: "blur(8px)", opacity: 0, y: 8 }
						}
						transition={
							reduceMotion
								? {
										duration: 0.14,
										ease: "linear",
									}
								: {
										delay: 0.06,
										duration: 0.22,
										ease: [0.22, 1, 0.36, 1],
									}
						}
					>
						tokens
					</motion.span>
				) : null}
			</AnimatePresence>
		</span>
	);
}

function WrappedScaleSpendTitle(props: {
	estimatedSpendUsd: number;
	onSequenceComplete?: () => void;
	showKebabs: boolean;
	totalKebabs: number;
	visibleKebabDrops: number;
}) {
	const {
		estimatedSpendUsd,
		onSequenceComplete,
		showKebabs,
		totalKebabs,
		visibleKebabDrops,
	} = props;
	const shouldReduceMotion = useReducedMotion();
	const reduceMotion = shouldReduceMotion ?? false;
	const [displaySpendUsd, setDisplaySpendUsd] = useState(() =>
		reduceMotion ? estimatedSpendUsd : 0,
	);
	const [isSpendValueVisible, setIsSpendValueVisible] = useState(reduceMotion);

	useMountEffect(() => {
		if (reduceMotion) {
			setDisplaySpendUsd(estimatedSpendUsd);
			setIsSpendValueVisible(true);
			return;
		}

		setDisplaySpendUsd(0);
		setIsSpendValueVisible(false);
		let frameId = 0;
		const revealTimerId = window.setTimeout(() => {
			setIsSpendValueVisible(true);
			const animationStart = window.performance.now();

			const animateValue = (now: number) => {
				const progress = Math.max(
					0,
					Math.min(
						1,
						(now - animationStart) / SCALE_STAGE_SPEND_COUNT_DURATION_MS,
					),
				);
				const easedProgress = 1 - (1 - progress) ** 3;
				setDisplaySpendUsd(Math.round(estimatedSpendUsd * easedProgress));

				if (progress < 1) {
					frameId = window.requestAnimationFrame(animateValue);
				}
			};

			frameId = window.requestAnimationFrame(animateValue);
		}, SCALE_STAGE_SPEND_LABEL_HOLD_MS);

		return () => {
			window.clearTimeout(revealTimerId);
			window.cancelAnimationFrame(frameId);
		};
	});

	return (
		<span className="mymind-wrapped-scale-stage__spend-shell">
			<span className="mymind-wrapped-scale-stage__spend-label">
				This equals to
			</span>
			<AnimatePresence initial={false}>
				{isSpendValueVisible ? (
					<motion.span
						key={`spend-value:${estimatedSpendUsd}`}
						animate={
							reduceMotion
								? { opacity: 1 }
								: { filter: "blur(0px)", opacity: 1, y: 0 }
						}
						className="mymind-wrapped-scale-stage__spend-value-shell"
						initial={
							reduceMotion
								? { opacity: 0 }
								: { filter: "blur(10px)", opacity: 0, y: 10 }
						}
						exit={
							reduceMotion
								? { opacity: 0 }
								: { filter: "blur(10px)", opacity: 0, y: 10 }
						}
						transition={
							reduceMotion
								? {
										duration: 0.14,
										ease: "linear",
									}
								: {
										duration: 0.24,
										ease: [0.22, 1, 0.36, 1],
									}
						}
					>
						<span className="mymind-wrapped-scale-stage__spend-value">
							{formatCompactWholeCurrency(displaySpendUsd)}
						</span>
					</motion.span>
				) : null}
			</AnimatePresence>
			<AnimatePresence initial={false}>
				{showKebabs ? (
					<motion.span
						key={`kebabs:${totalKebabs}`}
						animate={
							reduceMotion
								? { opacity: 1 }
								: { filter: "blur(0px)", opacity: 1, y: 0 }
						}
						className="mymind-wrapped-scale-stage__spend-kebab-line"
						initial={
							reduceMotion
								? { opacity: 0 }
								: { filter: "blur(8px)", opacity: 0, y: 8 }
						}
						exit={
							reduceMotion
								? { opacity: 0 }
								: { filter: "blur(8px)", opacity: 0, y: 8 }
						}
						transition={
							reduceMotion
								? {
										duration: 0.14,
										ease: "linear",
									}
								: {
										duration: 0.24,
										ease: [0.22, 1, 0.36, 1],
									}
						}
					>
						{`or ${totalKebabs.toLocaleString("en-US")} kebabs`}
					</motion.span>
				) : null}
			</AnimatePresence>
			{showKebabs && !reduceMotion ? (
				<WrappedScaleKebabRain
					onComplete={onSequenceComplete}
					totalDrops={visibleKebabDrops}
				/>
			) : null}
		</span>
	);
}

function WrappedScaleKebabRain(props: {
	onComplete?: () => void;
	totalDrops: number;
}) {
	const { onComplete, totalDrops } = props;
	const drops = buildScaleKebabDrops(totalDrops);
	const dropRefs = useRef<Array<HTMLSpanElement | null>>([]);

	useMountEffect(() => {
		if (drops.length === 0) {
			onComplete?.();
			return;
		}

		const nodes = dropRefs.current;
		if (nodes.length === 0) {
			return;
		}

		const width = window.innerWidth;
		const height = window.innerHeight;
		const simulationDrops = drops.map((drop) =>
			createScaleKebabSimulationDrop(drop),
		);

		for (const drop of simulationDrops) {
			activateScaleKebabDrop(drop, width);
		}

		let frameId = 0;

		const animate = (now: number) => {
			let hasActiveDrop = false;

			for (const drop of simulationDrops) {
				if (!drop.active) {
					continue;
				}

				hasActiveDrop = true;
				drop.vy += drop.gravityPx;
				drop.vx *= drop.exiting ? 0.994 : drop.friction;
				drop.x += drop.vx;
				drop.y += drop.vy;

				resolveScaleKebabWallCollision(drop, width, now);
				resolveScaleKebabFloorCollision(drop, height, now);

				if (drop.exiting && drop.y - drop.radius > height + drop.radius * 3) {
					deactivateScaleKebabDrop(drop);
				}
			}

			renderScaleKebabSimulation(nodes, simulationDrops, now);

			if (hasActiveDrop) {
				frameId = window.requestAnimationFrame(animate);
				return;
			}

			onComplete?.();
		};

		frameId = window.requestAnimationFrame(animate);

		return () => {
			window.cancelAnimationFrame(frameId);
		};
	});

	if (drops.length === 0) {
		return null;
	}

	return (
		<div aria-hidden="true" className="mymind-wrapped-scale-stage__kebab-rain">
			{drops.map((drop, index) => (
				<span
					key={drop.id}
					ref={(node) => {
						dropRefs.current[index] = node;
					}}
					className="mymind-wrapped-scale-stage__kebab-drop"
					style={{
						fontSize: `${drop.sizePx}px`,
						left: "50%",
						opacity: 0,
						top: `${drop.sourceYOffsetPx}px`,
					}}
				>
					{SCALE_STAGE_KEBAB_EMOJI}
				</span>
			))}
		</div>
	);
}

function resolveScaleKebabCount(estimatedSpendUsd: number) {
	if (estimatedSpendUsd <= 0) {
		return 0;
	}

	return Math.max(
		1,
		Math.round(estimatedSpendUsd / SCALE_STAGE_KEBAB_COST_USD),
	);
}

function buildScaleKebabDrops(totalDrops: number): ScaleKebabDrop[] {
	if (totalDrops <= 0) {
		return [];
	}

	const random = createScaleKebabSeededRandom(totalDrops * 97);

	return Array.from({ length: totalDrops }, (_, index) => {
		const progress = totalDrops === 1 ? 0.5 : index / (totalDrops - 1);

		return {
			bounceDamping: Number((0.56 + random() * 0.1).toFixed(2)),
			floorThreshold: Number((1.4 + random() * 0.55).toFixed(2)),
			friction: Number((0.989 + random() * 0.005).toFixed(3)),
			gravityPx: Number((0.52 + random() * 0.08).toFixed(2)),
			id: `scale-kebab-drop-${index}`,
			initialVelocityXPx: Number(((random() - 0.5) * 1.3).toFixed(2)),
			maxBounces: 1,
			sizePx: Math.round(46 + random() * 14),
			sourceXPercent: 8 + progress * 84,
			sourceYOffsetPx: Math.round(-110 - random() * 96),
			spawnJitterPx: Math.round(8 + random() * 12),
			squashMultiplier: Number((0.058 + random() * 0.02).toFixed(3)),
		};
	});
}

function createScaleKebabSimulationDrop(
	drop: ScaleKebabDrop,
): ScaleKebabSimulationDrop {
	const radius = drop.sizePx / 2;

	return {
		...drop,
		active: false,
		bounceCount: 0,
		exiting: false,
		hasTouchedFloor: false,
		opacity: 0,
		radius,
		squashScaleX: 1,
		squashScaleY: 1,
		squashUntilMs: 0,
		vx: 0,
		vy: 0,
		x: 0,
		y: 0,
	};
}

function activateScaleKebabDrop(drop: ScaleKebabSimulationDrop, width: number) {
	drop.active = true;
	drop.bounceCount = 0;
	drop.exiting = false;
	drop.hasTouchedFloor = false;
	drop.opacity = 1;
	drop.squashScaleX = 1;
	drop.squashScaleY = 1;
	drop.squashUntilMs = 0;
	drop.vx = drop.initialVelocityXPx + (Math.random() - 0.5) * 0.28;
	drop.vy = 0.35 + Math.random() * 0.7;
	drop.x = clampScaleKebabX(
		(width * drop.sourceXPercent) / 100 +
			(Math.random() - 0.5) * drop.spawnJitterPx,
		drop.radius,
		width,
	);
	drop.y = drop.sourceYOffsetPx;
}

function deactivateScaleKebabDrop(drop: ScaleKebabSimulationDrop) {
	drop.active = false;
	drop.bounceCount = 0;
	drop.exiting = false;
	drop.hasTouchedFloor = false;
	drop.opacity = 0;
	drop.squashScaleX = 1;
	drop.squashScaleY = 1;
	drop.squashUntilMs = 0;
	drop.vx = 0;
	drop.vy = 0;
}

function renderScaleKebabSimulation(
	nodes: Array<HTMLSpanElement | null>,
	drops: readonly ScaleKebabSimulationDrop[],
	now: number,
) {
	for (let index = 0; index < drops.length; index += 1) {
		const node = nodes[index];
		const drop = drops[index];

		if (!node || !drop) {
			continue;
		}

		const { scaleX, scaleY } = resolveScaleKebabScale(drop, now);

		node.style.width = `${drop.radius * 2}px`;
		node.style.height = `${drop.radius * 2}px`;
		node.style.left = `${drop.x - drop.radius}px`;
		node.style.top = `${drop.y - drop.radius}px`;
		node.style.opacity = `${drop.opacity}`;
		node.style.transform = `scaleX(${scaleX}) scaleY(${scaleY})`;
	}
}

function resolveScaleKebabWallCollision(
	drop: ScaleKebabSimulationDrop,
	width: number,
	now: number,
) {
	const minimumX = drop.radius;
	const maximumX = width - drop.radius;

	if (drop.x <= minimumX) {
		drop.x = minimumX;
		drop.vx = Math.abs(drop.vx) * 0.78;
		applyScaleKebabImpact(drop, now, 1 + Math.abs(drop.vx) * 0.08);
		return;
	}

	if (drop.x >= maximumX) {
		drop.x = maximumX;
		drop.vx = -Math.abs(drop.vx) * 0.78;
		applyScaleKebabImpact(drop, now, 1 + Math.abs(drop.vx) * 0.08);
	}
}

function resolveScaleKebabFloorCollision(
	drop: ScaleKebabSimulationDrop,
	height: number,
	now: number,
) {
	if (drop.exiting) {
		return;
	}

	const floorY = height - drop.radius;
	if (drop.y < floorY) {
		return;
	}

	drop.y = floorY;
	drop.hasTouchedFloor = true;

	if (
		drop.bounceCount < drop.maxBounces &&
		Math.abs(drop.vy) > drop.floorThreshold
	) {
		drop.bounceCount += 1;
		drop.vy = -Math.abs(drop.vy) * drop.bounceDamping;
		drop.vx *= 0.92;
		applyScaleKebabImpact(drop, now, 1 + Math.abs(drop.vy) * 0.1);
		return;
	}

	drop.exiting = true;
	drop.vy = Math.max(SCALE_STAGE_KEBAB_EXIT_VELOCITY_PX, Math.abs(drop.vy));
	drop.y = floorY + 1;
}

function resolveScaleKebabScale(drop: ScaleKebabSimulationDrop, now: number) {
	if (drop.squashUntilMs <= now) {
		return {
			scaleX: 1,
			scaleY: 1,
		};
	}

	const progress = Math.max(
		0,
		Math.min(
			1,
			(drop.squashUntilMs - now) / SCALE_STAGE_KEBAB_SQUASH_DURATION_MS,
		),
	);

	return {
		scaleX: 1 + (drop.squashScaleX - 1) * progress,
		scaleY: 1 + (drop.squashScaleY - 1) * progress,
	};
}

function applyScaleKebabImpact(
	drop: ScaleKebabSimulationDrop,
	now: number,
	intensity: number,
) {
	const squashX = Math.min(1.95, 1 + intensity * drop.squashMultiplier);
	drop.squashScaleX = squashX;
	drop.squashScaleY = Math.max(0.48, 2 - squashX);
	drop.squashUntilMs = now + SCALE_STAGE_KEBAB_SQUASH_DURATION_MS;
}

function clampScaleKebabX(x: number, radius: number, width: number) {
	return Math.max(radius, Math.min(width - radius, x));
}

function createScaleKebabSeededRandom(seed: number) {
	let state = seed % 2147483647;

	if (state <= 0) {
		state += 2147483646;
	}

	return () => {
		state = (state * 16807) % 2147483647;
		return (state - 1) / 2147483646;
	};
}

export function WrappedOnboardingLockInStage(props: SharedStageProps) {
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
	const averageStyle: LockInMeterStyle = {
		"--lock-in-stage-meter-value": `${model.averageShare}%`,
	};
	const longestStyle: LockInMeterStyle = {
		"--lock-in-stage-meter-value": `${model.longestShare}%`,
	};

	return (
		<WrappedOnboardingStageFrame
			className="mymind-wrapped-lock-in-stage"
			objectClassName="mymind-wrapped-lock-in-stage__object"
			copy={
				<WrappedOnboardingStageCopy
					entrancePreset="story"
					title={model.headline}
					description={model.subline}
				/>
			}
			object={
				<article
					className={cn(
						"mymind-wrapped-lock-in-stage__card",
						`is-${model.state}`,
					)}
				>
					<ul className="mymind-wrapped-lock-in-stage__stats">
						<li className="mymind-wrapped-lock-in-stage__stat">
							<p className="mymind-wrapped-lock-in-stage__stat-label">
								Longest recorded
							</p>
							<p className="mymind-wrapped-lock-in-stage__stat-value">
								{model.longestDurationLabel}
							</p>
						</li>
						<li className="mymind-wrapped-lock-in-stage__stat">
							<p className="mymind-wrapped-lock-in-stage__stat-label">
								Usual session
							</p>
							<p className="mymind-wrapped-lock-in-stage__stat-value">
								{model.averageDurationLabel}
							</p>
						</li>
					</ul>

					<ul className="mymind-wrapped-lock-in-stage__chips">
						<li className="mymind-wrapped-lock-in-stage__chip is-state">
							{model.stateLabel}
						</li>
						<li className="mymind-wrapped-lock-in-stage__chip">
							{model.comparisonLabel}
						</li>
					</ul>

					<ul className="mymind-wrapped-lock-in-stage__compare">
						<li className="mymind-wrapped-lock-in-stage__row">
							<header className="mymind-wrapped-lock-in-stage__row-head">
								<p className="mymind-wrapped-lock-in-stage__row-label">
									Usual session
								</p>
								<p className="mymind-wrapped-lock-in-stage__row-value">
									{model.averageDurationLabel}
								</p>
							</header>
							<span
								aria-hidden="true"
								className="mymind-wrapped-lock-in-stage__track"
							>
								<span
									className="mymind-wrapped-lock-in-stage__fill is-average"
									style={averageStyle}
								/>
							</span>
						</li>

						<li className="mymind-wrapped-lock-in-stage__row">
							<header className="mymind-wrapped-lock-in-stage__row-head">
								<p className="mymind-wrapped-lock-in-stage__row-label">
									Longest recorded
								</p>
								<p className="mymind-wrapped-lock-in-stage__row-value">
									{model.longestDurationLabel}
								</p>
							</header>
							<span
								aria-hidden="true"
								className="mymind-wrapped-lock-in-stage__track"
							>
								<span
									className="mymind-wrapped-lock-in-stage__fill is-longest"
									style={longestStyle}
								/>
							</span>
						</li>
					</ul>
				</article>
			}
			support={
				<p className="mymind-wrapped-lock-in-stage__footnote">
					{model.footnote}
				</p>
			}
		/>
	);
}

export function WrappedOnboardingQualityStage(props: SharedStageProps) {
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
	const commitStyle: QualityMeterStyle = {
		"--quality-stage-meter-value": `${model.commitShare}%`,
	};
	const successStyle: QualityMeterStyle = {
		"--quality-stage-meter-value": `${model.successShare}%`,
	};

	return (
		<WrappedOnboardingStageFrame
			className="mymind-wrapped-quality-stage"
			objectClassName="mymind-wrapped-quality-stage__object"
			copy={
				<WrappedOnboardingStageCopy
					entrancePreset="story"
					title={model.headline}
					description={model.subline}
				/>
			}
			object={
				<article
					className={cn(
						"mymind-wrapped-quality-stage__card",
						`is-${model.state}`,
					)}
				>
					<ul className="mymind-wrapped-quality-stage__stats">
						<li className="mymind-wrapped-quality-stage__stat">
							<p className="mymind-wrapped-quality-stage__stat-label">
								Commit rate
							</p>
							<p className="mymind-wrapped-quality-stage__stat-value">
								{model.commitRateLabel}
							</p>
						</li>
						<li className="mymind-wrapped-quality-stage__stat">
							<p className="mymind-wrapped-quality-stage__stat-label">
								Success rate
							</p>
							<p className="mymind-wrapped-quality-stage__stat-value">
								{model.successRateLabel}
							</p>
						</li>
					</ul>

					<ul className="mymind-wrapped-quality-stage__chips">
						<li className="mymind-wrapped-quality-stage__chip is-state">
							{model.stateLabel}
						</li>
						<li className="mymind-wrapped-quality-stage__chip">
							{model.comparisonLabel}
						</li>
					</ul>

					<ul className="mymind-wrapped-quality-stage__compare">
						<li
							className={cn(
								"mymind-wrapped-quality-stage__row",
								!model.hasCommitRate ? "is-pending" : undefined,
							)}
						>
							<header className="mymind-wrapped-quality-stage__row-head">
								<p className="mymind-wrapped-quality-stage__row-label">
									Sessions with commits
								</p>
								<p className="mymind-wrapped-quality-stage__row-value">
									{model.commitRateLabel}
								</p>
							</header>
							<span
								aria-hidden="true"
								className="mymind-wrapped-quality-stage__track"
							>
								<span
									className="mymind-wrapped-quality-stage__fill is-commit"
									style={commitStyle}
								/>
							</span>
						</li>

						<li
							className={cn(
								"mymind-wrapped-quality-stage__row",
								!model.hasSuccessRate ? "is-pending" : undefined,
							)}
						>
							<header className="mymind-wrapped-quality-stage__row-head">
								<p className="mymind-wrapped-quality-stage__row-label">
									Successful sessions
								</p>
								<p className="mymind-wrapped-quality-stage__row-value">
									{model.successRateLabel}
								</p>
							</header>
							<span
								aria-hidden="true"
								className="mymind-wrapped-quality-stage__track"
							>
								<span
									className="mymind-wrapped-quality-stage__fill is-success"
									style={successStyle}
								/>
							</span>
						</li>
					</ul>
				</article>
			}
			support={
				<p className="mymind-wrapped-quality-stage__footnote">
					{model.footnote}
				</p>
			}
		/>
	);
}

export function WrappedOnboardingRepoPulseStage(props: SharedStageProps) {
	const { onboardingMetrics, previewState } = props;
	const model = resolveRepoPulseStageModel(
		resolveRepoPulsePreviewInput(onboardingMetrics.repoPulse, previewState),
	);

	return (
		<WrappedOnboardingStageFrame
			className="mymind-wrapped-repo-pulse-stage"
			objectClassName="mymind-wrapped-repo-pulse-stage__object"
			copy={
				<WrappedOnboardingStageCopy
					entrancePreset="story"
					title={model.headline}
					description={model.subline}
				/>
			}
			object={
				<article className="mymind-wrapped-repo-pulse-stage__card">
					<header className="mymind-wrapped-repo-pulse-stage__section-head">
						<p className="mymind-wrapped-repo-pulse-stage__section-label">
							Top repos
						</p>
						<p className="mymind-wrapped-repo-pulse-stage__section-value">
							{model.totalSessionsLabel}
						</p>
					</header>

					<ul className="mymind-wrapped-repo-pulse-stage__stack">
						{model.entries.map((entry) => (
							<li
								key={entry.id}
								className="mymind-wrapped-repo-pulse-stage__row"
							>
								<section className="mymind-wrapped-repo-pulse-stage__row-copy">
									<p className="mymind-wrapped-repo-pulse-stage__repo">
										{entry.repoName}
									</p>
									<p className="mymind-wrapped-repo-pulse-stage__proof">
										{entry.proof}
									</p>
									<p className="mymind-wrapped-repo-pulse-stage__meta">
										{entry.meta}
									</p>
								</section>
							</li>
						))}

						{model.entries.length === 0 ? (
							<li className="mymind-wrapped-repo-pulse-stage__empty">
								Repo work types show up once a few project sessions land.
							</li>
						) : null}
					</ul>
				</article>
			}
		/>
	);
}
