import { useRef } from "react";
import { useMountEffect } from "@/hooks/useMountEffect";
import { cn } from "@/lib/utils";
import { WrappedStageCopy, WrappedStageFrame } from "../stage-frame";
import type { WrappedStep } from "./config";
import type { WrappedStepContentLine } from "./helpers";
import {
	buildScaleRainBalls,
	buildStepContent,
	resolveScaleRainBallCount,
	resolveScaleRainDisplayedTokens,
	type ScaleRainBall,
} from "./models";
import { WrappedOnboardingIntroStage } from "./stages/intro";
import {
	WrappedOnboardingLockInStage,
	WrappedOnboardingQualityStage,
	WrappedOnboardingRepoPulseStage,
	WrappedOnboardingScaleStage,
} from "./stages/metrics";
import { WrappedOnboardingModelStage } from "./stages/model";
import { WrappedOnboardingSkillsStage } from "./stages/skills";
import { WrappedOnboardingToolsStage } from "./stages/tools";
import { WrappedOnboardingUploadStage } from "./stages/upload";
import type {
	WrappedModelAdvanceState,
	WrappedOnboardingMetrics,
	WrappedScaleAdvanceState,
} from "./types";

interface WrappedOnboardingStageProps {
	displayName: string;
	isExiting: boolean;
	modelAdvanceState?: WrappedModelAdvanceState;
	onboardingMetrics: WrappedOnboardingMetrics;
	onModelComparisonSequenceComplete?: () => void;
	onModelHistoryRevealComplete?: () => void;
	onScaleAdvanceSequenceComplete?: () => void;
	onScaleRainRevealChange?: (isVisible: boolean) => void;
	onToolsBaseModelSequenceComplete?: () => void;
	previewState: string;
	scaleAdvanceState?: WrappedScaleAdvanceState;
	scaleDisplayedTokens?: number;
	step: WrappedStep;
	totalSessions: number;
}

interface WrappedOnboardingScaleRainBackdropProps {
	onDisplayedTokensChange?: (tokens: number) => void;
	reduceMotion: boolean;
	totalTokens: number;
}

interface ScaleRainSimulationBall extends ScaleRainBall {
	active: boolean;
	bounceCount: number;
	exiting: boolean;
	hasTouchedFloor: boolean;
	opacity: number;
	radius: number;
	spawnY: number;
	squashScaleX: number;
	squashScaleY: number;
	squashUntilMs: number;
	vx: number;
	vy: number;
	x: number;
	y: number;
}

const SCALE_RAIN_FLOOR_OFFSET_PX = 0;
const SCALE_RAIN_TARGET_DURATION_PER_MILLION_TOKENS_MS = 7_000;
const SCALE_RAIN_MIN_FLOW_DURATION_MS = 3_200;
const SCALE_RAIN_MAX_FLOW_DURATION_MS = 9_000;
const SCALE_RAIN_TRAVEL_OVERHEAD_MS = 1_200;
const SCALE_RAIN_RELEASE_VELOCITY_PX = 2.6;
const SCALE_RAIN_SQUASH_DURATION_MS = 80;
const SCALE_RAIN_EXIT_FADE_STEP = 0.045;
const SCALE_RAIN_SWAY_CYCLE_MS = 2_800;
const SCALE_RAIN_SWAY_EDGE_INSET_PX = 18;
const SCALE_RAIN_SWAY_VELOCITY_FACTOR = 0.56;

export function WrappedOnboardingStage(props: WrappedOnboardingStageProps) {
	const {
		displayName,
		isExiting,
		modelAdvanceState,
		onboardingMetrics,
		onModelComparisonSequenceComplete,
		onModelHistoryRevealComplete,
		onScaleAdvanceSequenceComplete,
		onScaleRainRevealChange,
		onToolsBaseModelSequenceComplete,
		previewState,
		scaleAdvanceState,
		scaleDisplayedTokens,
		step,
		totalSessions,
	} = props;

	if (step.id === "upload") {
		return <WrappedOnboardingUploadStage previewState={previewState} />;
	}

	if (step.id === "intro") {
		return (
			<WrappedOnboardingIntroStage
				displayName={displayName}
				isExiting={isExiting}
			/>
		);
	}

	if (step.id === "skills") {
		return (
			<WrappedOnboardingSkillsStage
				key={`skills:${previewState}:${onboardingMetrics.topSkills.length}:${onboardingMetrics.skillsAdoptionRate ?? -1}`}
				onboardingMetrics={onboardingMetrics}
				previewState={previewState}
			/>
		);
	}

	if (step.id === "tools") {
		return (
			<WrappedOnboardingToolsStage
				key={`tools:${previewState}:${onboardingMetrics.topSlashCommands.length}:${onboardingMetrics.topSubagents.length}:${onboardingMetrics.topSlashCommandCount ?? -1}:${onboardingMetrics.topSubagentCount ?? -1}:${onboardingMetrics.totalSessions}`}
				onboardingMetrics={onboardingMetrics}
				onBaseModelSequenceComplete={onToolsBaseModelSequenceComplete}
				previewState={previewState}
			/>
		);
	}

	if (step.id === "model") {
		return (
			<WrappedOnboardingModelStage
				key={`model:${previewState}:${onboardingMetrics.totalSessions}:${onboardingMetrics.modelByMonth.length}:${onboardingMetrics.sourceSplit
					.map(
						(sourceEntry) =>
							`${sourceEntry.source}:${sourceEntry.session_count}`,
					)
					.join("|")}`}
				advanceState={modelAdvanceState ?? "intro"}
				onboardingMetrics={onboardingMetrics}
				onComparisonSequenceComplete={onModelComparisonSequenceComplete}
				onHistoryRevealComplete={onModelHistoryRevealComplete}
				previewState={previewState}
			/>
		);
	}

	if (step.id === "pulse") {
		return (
			<WrappedOnboardingRepoPulseStage
				onboardingMetrics={onboardingMetrics}
				previewState={previewState}
			/>
		);
	}

	if (step.id === "scale") {
		return (
			<WrappedOnboardingScaleStage
				key={`scale:${displayName}:${totalSessions}:${previewState}:${onboardingMetrics.totalTokens}`}
				displayName={displayName}
				onboardingMetrics={onboardingMetrics}
				onScaleAdvanceSequenceComplete={onScaleAdvanceSequenceComplete}
				onScaleRainRevealChange={onScaleRainRevealChange}
				previewState={previewState}
				scaleAdvanceState={scaleAdvanceState}
				scaleDisplayedTokens={scaleDisplayedTokens}
				totalSessions={totalSessions}
			/>
		);
	}

	if (step.id === "lock-in") {
		return (
			<WrappedOnboardingLockInStage
				onboardingMetrics={onboardingMetrics}
				previewState={previewState}
			/>
		);
	}

	if (step.id === "quality") {
		return (
			<WrappedOnboardingQualityStage
				onboardingMetrics={onboardingMetrics}
				previewState={previewState}
			/>
		);
	}

	const content: WrappedStepContentLine[] = buildStepContent({
		displayName,
		onboardingMetrics,
		previewState,
		stepId: step.id,
		totalSessions,
	});
	const [headlineLine, ...detailLines] = content;

	return (
		<WrappedStageFrame
			className="mymind-wrapped-onboarding-stage"
			copyClassName="mymind-wrapped-onboarding-stage__copy"
			objectClassName="mymind-wrapped-onboarding-stage__object"
			copy={
				headlineLine ? (
					<WrappedStageCopy
						entrancePreset="story"
						title={headlineLine.text}
						titleClassName={cn(
							headlineLine.tone === "danger"
								? "text-red-700 dark:text-red-400"
								: undefined,
						)}
					/>
				) : null
			}
			object={
				detailLines.length > 0 ? (
					<div className="mymind-wrapped-copy-stage__content">
						{detailLines.map((line) => (
							<p
								key={`${line.tone ?? "default"}:${line.text}`}
								className={cn(
									"mymind-wrapped-copy-stage__line",
									line.tone === "danger"
										? "text-red-700 dark:text-red-400"
										: undefined,
								)}
							>
								{line.text}
							</p>
						))}
					</div>
				) : null
			}
		/>
	);
}

export function WrappedOnboardingScaleRainBackdrop(
	props: WrappedOnboardingScaleRainBackdropProps,
) {
	const {
		onDisplayedTokensChange,
		reduceMotion,
		totalTokens,
	} = props;
	const balls = buildScaleRainBalls(totalTokens);
	const logicalBallCount = resolveScaleRainBallCount(totalTokens);

	return (
		<WrappedOnboardingScaleRainSimulation
			key={`scale-rain:${totalTokens}:${reduceMotion ? "reduce" : "full"}`}
			balls={balls}
			onDisplayedTokensChange={onDisplayedTokensChange}
			reduceMotion={reduceMotion}
			totalTokens={totalTokens}
			totalBallCount={logicalBallCount}
		/>
	);
}

function WrappedOnboardingScaleRainSimulation(props: {
	balls: readonly ScaleRainBall[];
	onDisplayedTokensChange?: (tokens: number) => void;
	reduceMotion: boolean;
	totalTokens: number;
	totalBallCount: number;
}) {
	const {
		balls,
		onDisplayedTokensChange,
		reduceMotion,
		totalBallCount,
		totalTokens,
	} = props;
	const ballRefs = useRef<Array<HTMLSpanElement | null>>([]);

	useMountEffect(() => {
		const nodes = ballRefs.current;
		if (nodes.length === 0) {
			return;
		}

		onDisplayedTokensChange?.(0);

		const width = window.innerWidth;
		const height = window.innerHeight;
		const simulationBalls = balls.map((ball) =>
			createScaleRainSimulationBall(ball),
		);

		if (reduceMotion) {
			positionReducedMotionScaleRain(simulationBalls, width, height);
			onDisplayedTokensChange?.(totalTokens);
			renderScaleRainSimulation(
				nodes,
				simulationBalls,
				window.performance.now(),
			);
			return;
		}

		let frameId = 0;
		let emittedBallCount = 0;
		let completedBallCount = 0;
		let reportedTokens = 0;
		const releaseIntervalMs = resolveScaleRainReleaseIntervalMs(totalBallCount);
		let nextReleaseAtMs = window.performance.now();
		let releaseCursor = 0;

		const animate = (now: number) => {
			while (emittedBallCount < totalBallCount && now >= nextReleaseAtMs) {
				const activation = activateNextScaleRainBall(
					simulationBalls,
					releaseCursor,
					now,
					width,
				);

				if (!activation.didActivate) {
					break;
				}

				emittedBallCount += 1;
				releaseCursor = activation.nextCursor;
				nextReleaseAtMs += releaseIntervalMs;
			}

			let hasActiveBall = false;

			for (const ball of simulationBalls) {
				if (!ball.active) {
					continue;
				}

				hasActiveBall = true;
				ball.vy += ball.gravityPx;
				ball.vx *= ball.exiting ? 0.994 : ball.friction;
				ball.x += ball.vx;
				ball.y += ball.vy;
				resolveScaleRainWallCollision(ball, width, now);
				resolveScaleRainFloorCollision(ball, height, now);

				if (ball.exiting) {
					ball.opacity = Math.max(0, ball.opacity - SCALE_RAIN_EXIT_FADE_STEP);

					if (
						ball.y - ball.radius > height + ball.radius * 3 ||
						ball.opacity <= 0
					) {
						if (ball.hasTouchedFloor) {
							completedBallCount += 1;
						}
						deactivateScaleRainBall(ball);
					}
				}
			}

			const nextReportedTokens = resolveScaleRainDisplayedTokens(
				totalTokens,
				resolveScaleRainDisplayedBallProgress(
					simulationBalls,
					completedBallCount,
					height,
				),
				totalBallCount,
			);
			if (nextReportedTokens !== reportedTokens) {
				reportedTokens = nextReportedTokens;
				onDisplayedTokensChange?.(nextReportedTokens);
			}

			renderScaleRainSimulation(nodes, simulationBalls, now);

			if (hasActiveBall || emittedBallCount < totalBallCount) {
				frameId = window.requestAnimationFrame(animate);
			}
		};

		frameId = window.requestAnimationFrame(animate);

		return () => {
			window.cancelAnimationFrame(frameId);
		};
	});

	return (
		<div
			aria-hidden="true"
			className={cn(
				"mymind-wrapped-scale-rain",
				reduceMotion ? "is-reduced-motion" : undefined,
			)}
		>
			{balls.map((ball, index) => (
				<span
					key={ball.id}
					ref={(node) => {
						ballRefs.current[index] = node;
					}}
					className="mymind-wrapped-scale-rain__ball"
					style={{
						height: `${ball.sizePx}px`,
						opacity: reduceMotion ? 1 : 0,
						top: `${-ball.sizePx}px`,
						width: `${ball.sizePx}px`,
					}}
				/>
			))}
		</div>
	);
}

function createScaleRainSimulationBall(
	ball: ScaleRainBall,
): ScaleRainSimulationBall {
	const radius = ball.sizePx / 2;
	return {
		...ball,
		active: false,
		bounceCount: 0,
		exiting: false,
		hasTouchedFloor: false,
		opacity: 0,
		radius,
		spawnY: ball.sourceYOffsetPx,
		squashScaleX: 1,
		squashScaleY: 1,
		squashUntilMs: 0,
		vx: 0,
		vy: 0,
		x: 0,
		y: 0,
	};
}

function renderScaleRainSimulation(
	nodes: Array<HTMLSpanElement | null>,
	balls: readonly ScaleRainSimulationBall[],
	now: number,
) {
	for (let index = 0; index < balls.length; index += 1) {
		const node = nodes[index];
		const ball = balls[index];

		if (!node || !ball) {
			continue;
		}

		const { scaleX, scaleY } = resolveScaleRainScale(ball, now);
		const borderWidth = Math.max(1, Math.min(3, ball.radius * 0.34));

		node.style.width = `${ball.radius * 2}px`;
		node.style.height = `${ball.radius * 2}px`;
		node.style.borderWidth = `${borderWidth}px`;
		node.style.left = `${ball.x - ball.radius}px`;
		node.style.top = `${ball.y - ball.radius}px`;
		node.style.opacity = `${ball.opacity}`;
		node.style.transform = `scaleX(${scaleX}) scaleY(${scaleY})`;
	}
}

function resolveScaleRainWallCollision(
	ball: ScaleRainSimulationBall,
	width: number,
	now: number,
) {
	const minimumX = ball.radius;
	const maximumX = width - ball.radius;

	if (ball.x <= minimumX) {
		ball.x = minimumX;
		ball.vx = Math.abs(ball.vx) * 0.78;
		applyScaleRainImpact(ball, now, 1 + Math.abs(ball.vx) * 0.06);
		return;
	}

	if (ball.x >= maximumX) {
		ball.x = maximumX;
		ball.vx = -Math.abs(ball.vx) * 0.78;
		applyScaleRainImpact(ball, now, 1 + Math.abs(ball.vx) * 0.06);
	}
}

function resolveScaleRainFloorCollision(
	ball: ScaleRainSimulationBall,
	height: number,
	now: number,
) {
	if (ball.exiting) {
		return;
	}

	const floorY = height - ball.radius + SCALE_RAIN_FLOOR_OFFSET_PX;
	if (ball.y < floorY) {
		return;
	}

	ball.y = floorY;
	ball.hasTouchedFloor = true;
	if (
		ball.bounceCount < ball.maxBounces &&
		Math.abs(ball.vy) > ball.floorThreshold
	) {
		ball.bounceCount += 1;
		ball.vy = -Math.abs(ball.vy) * ball.bounceDamping;
		ball.vx *= 0.92;
		applyScaleRainImpact(ball, now, 1 + Math.abs(ball.vy) * 0.08);
		return;
	}

	ball.exiting = true;
	ball.vy = SCALE_RAIN_RELEASE_VELOCITY_PX;
	ball.y = floorY + 1;
}

function resolveScaleRainScale(ball: ScaleRainSimulationBall, now: number) {
	if (ball.squashUntilMs <= now) {
		return {
			scaleX: 1,
			scaleY: 1,
		};
	}

	const progress = Math.max(
		0,
		Math.min(1, (ball.squashUntilMs - now) / SCALE_RAIN_SQUASH_DURATION_MS),
	);

	return {
		scaleX: 1 + (ball.squashScaleX - 1) * progress,
		scaleY: 1 + (ball.squashScaleY - 1) * progress,
	};
}

function applyScaleRainImpact(
	ball: ScaleRainSimulationBall,
	now: number,
	intensity: number,
) {
	const squashX = Math.min(1.7, 1 + intensity * ball.squashMultiplier);
	ball.squashScaleX = squashX;
	ball.squashScaleY = Math.max(0.62, 2 - squashX);
	ball.squashUntilMs = now + SCALE_RAIN_SQUASH_DURATION_MS;
}

function activateScaleRainBall(
	ball: ScaleRainSimulationBall,
	width: number,
	now: number,
) {
	const emitterMotion = resolveScaleRainEmitterMotion(now, width);
	const sourceX = clampScaleRainX(
		(width * ball.sourceXPercent) / 100 +
			emitterMotion.offsetPx +
			(Math.random() - 0.5) * ball.spawnJitterPx,
		ball.radius,
		width,
	);

	ball.active = true;
	ball.bounceCount = 0;
	ball.exiting = false;
	ball.hasTouchedFloor = false;
	ball.opacity = 1;
	ball.squashScaleX = 1;
	ball.squashScaleY = 1;
	ball.squashUntilMs = 0;
	ball.vx =
		ball.initialVelocityXPx +
		emitterMotion.velocityPx +
		(Math.random() - 0.5) * 0.24;
	ball.vy = 0.35 + Math.random() * 0.75;
	ball.x = sourceX;
	ball.y = ball.sourceYOffsetPx;
	ball.spawnY = ball.sourceYOffsetPx;
}

function deactivateScaleRainBall(ball: ScaleRainSimulationBall) {
	ball.active = false;
	ball.bounceCount = 0;
	ball.exiting = false;
	ball.hasTouchedFloor = false;
	ball.opacity = 0;
	ball.squashScaleX = 1;
	ball.squashScaleY = 1;
	ball.squashUntilMs = 0;
	ball.vx = 0;
	ball.vy = 0;
}

function positionReducedMotionScaleRain(
	balls: readonly ScaleRainSimulationBall[],
	width: number,
	height: number,
) {
	const spacingY = 34;

	for (let index = 0; index < balls.length; index += 1) {
		const ball = balls[index];
		if (!ball) {
			continue;
		}

		const trailIndex = Math.floor(index / 3);
		const x =
			(width * ball.sourceXPercent) / 100 + (trailIndex % 2 === 0 ? -1 : 1) * 6;
		const y = Math.min(
			height - ball.radius * 3,
			ball.sourceYOffsetPx + trailIndex * spacingY,
		);

		ball.active = true;
		ball.opacity = 1;
		ball.x = clampScaleRainX(x, ball.radius, width);
		ball.y = y;
	}
}

function resolveScaleRainDisplayedBallProgress(
	balls: readonly ScaleRainSimulationBall[],
	completedBallCount: number,
	height: number,
) {
	let progress = completedBallCount;

	for (const ball of balls) {
		if (!ball.active) {
			continue;
		}

		progress += resolveScaleRainBallProgress(ball, height);
	}

	return progress;
}

function resolveScaleRainBallProgress(
	ball: ScaleRainSimulationBall,
	height: number,
) {
	if (ball.hasTouchedFloor || ball.exiting) {
		return 1;
	}

	const floorY = height - ball.radius + SCALE_RAIN_FLOOR_OFFSET_PX;
	const travelDistance = Math.max(1, floorY - ball.spawnY);
	return Math.max(0, Math.min(1, (ball.y - ball.spawnY) / travelDistance));
}

function activateNextScaleRainBall(
	balls: readonly ScaleRainSimulationBall[],
	startIndex: number,
	now: number,
	width: number,
) {
	for (let offset = 0; offset < balls.length; offset += 1) {
		const index = (startIndex + offset) % balls.length;
		const ball = balls[index];
		if (!ball || ball.active) {
			continue;
		}

		activateScaleRainBall(ball, width, now);
		return {
			didActivate: true,
			nextCursor: (index + 1) % balls.length,
		};
	}

	return {
		didActivate: false,
		nextCursor: startIndex,
	};
}

function resolveScaleRainReleaseIntervalMs(totalBallCount: number) {
	if (totalBallCount <= 0) {
		return SCALE_RAIN_MAX_FLOW_DURATION_MS;
	}

	const tokenCount = totalBallCount * 1_000;
	const targetTotalDurationMs = Math.min(
		SCALE_RAIN_MAX_FLOW_DURATION_MS,
		Math.max(
			SCALE_RAIN_MIN_FLOW_DURATION_MS,
			(tokenCount / 1_000_000) *
				SCALE_RAIN_TARGET_DURATION_PER_MILLION_TOKENS_MS,
		),
	);
	const flowDurationMs = Math.min(
		SCALE_RAIN_MAX_FLOW_DURATION_MS,
		Math.max(
			SCALE_RAIN_MIN_FLOW_DURATION_MS,
			targetTotalDurationMs - SCALE_RAIN_TRAVEL_OVERHEAD_MS,
		),
	);

	return flowDurationMs / totalBallCount;
}

function clampScaleRainX(x: number, radius: number, width: number) {
	return Math.max(radius, Math.min(width - radius, x));
}

function resolveScaleRainEmitterMotion(now: number, width: number) {
	const cycleProgress =
		((now % SCALE_RAIN_SWAY_CYCLE_MS) / SCALE_RAIN_SWAY_CYCLE_MS) * Math.PI * 2;
	const amplitudePx = Math.max(0, width / 2 - SCALE_RAIN_SWAY_EDGE_INSET_PX);
	const offsetPx = Math.sin(cycleProgress) * amplitudePx;
	const velocityPx = Math.cos(cycleProgress) * SCALE_RAIN_SWAY_VELOCITY_FACTOR;

	return {
		offsetPx,
		velocityPx,
	};
}
