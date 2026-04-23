import { useRef } from "react";
import { useMountEffect } from "@/hooks/useMountEffect";
import { cn } from "@/lib/utils";
import { WrappedStageCopy, WrappedStageFrame } from "../stage-frame";
import type { WrappedStep } from "./config";
import type { WrappedStepContentLine } from "./helpers";
import {
	buildScaleRainBalls,
	buildStepContent,
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
import type { WrappedOnboardingMetrics } from "./types";

interface WrappedOnboardingStageProps {
	displayName: string;
	isExiting: boolean;
	onboardingMetrics: WrappedOnboardingMetrics;
	previewState: string;
	step: WrappedStep;
	totalSessions: number;
}

interface WrappedOnboardingScaleRainBackdropProps {
	reduceMotion: boolean;
	totalTokens: number;
}

interface ScaleRainSimulationBall extends ScaleRainBall {
	active: boolean;
	bounceCount: number;
	exiting: boolean;
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

const SCALE_RAIN_FLOOR_OFFSET_PX = 0;
const SCALE_RAIN_RELEASE_VELOCITY_PX = 2.6;
const SCALE_RAIN_SQUASH_DURATION_MS = 80;
const SCALE_RAIN_EXIT_FADE_STEP = 0.045;

export function WrappedOnboardingStage(props: WrappedOnboardingStageProps) {
	const {
		displayName,
		isExiting,
		onboardingMetrics,
		previewState,
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
				previewState={previewState}
			/>
		);
	}

	if (step.id === "model") {
		return (
			<WrappedOnboardingModelStage
				onboardingMetrics={onboardingMetrics}
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
				onboardingMetrics={onboardingMetrics}
				previewState={previewState}
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
	const { reduceMotion, totalTokens } = props;
	const balls = buildScaleRainBalls(totalTokens);

	return (
		<WrappedOnboardingScaleRainSimulation
			key={`scale-rain:${totalTokens}:${reduceMotion ? "reduce" : "full"}`}
			balls={balls}
			reduceMotion={reduceMotion}
			totalTokens={Math.max(0, Math.round(totalTokens))}
		/>
	);
}

function WrappedOnboardingScaleRainSimulation(props: {
	balls: readonly ScaleRainBall[];
	reduceMotion: boolean;
	totalTokens: number;
}) {
	const { balls, reduceMotion, totalTokens } = props;
	const ballRefs = useRef<Array<HTMLSpanElement | null>>([]);

	useMountEffect(() => {
		const nodes = ballRefs.current;
		if (nodes.length === 0) {
			return;
		}

		const width = window.innerWidth;
		const height = window.innerHeight;
		const simulationBalls = balls.map((ball) =>
			createScaleRainSimulationBall(ball),
		);

		if (reduceMotion) {
			positionReducedMotionScaleRain(simulationBalls, width, height);
			renderScaleRainSimulation(
				nodes,
				simulationBalls,
				window.performance.now(),
			);
			return;
		}

		let frameId = 0;
		let emittedTokens = 0;

		const animate = (now: number) => {
			for (const ball of simulationBalls) {
				if (emittedTokens >= totalTokens) {
					break;
				}

				if (ball.active) {
					continue;
				}

				activateScaleRainBall(ball, width);
				emittedTokens += 1;
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
						deactivateScaleRainBall(ball);
					}
				}
			}

			renderScaleRainSimulation(nodes, simulationBalls, now);

			if (hasActiveBall || emittedTokens < totalTokens) {
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

function activateScaleRainBall(ball: ScaleRainSimulationBall, width: number) {
	const sourceX = clampScaleRainX(
		(width * ball.sourceXPercent) / 100 +
			(Math.random() - 0.5) * ball.spawnJitterPx,
		ball.radius,
		width,
	);

	ball.active = true;
	ball.bounceCount = 0;
	ball.exiting = false;
	ball.opacity = 1;
	ball.squashScaleX = 1;
	ball.squashScaleY = 1;
	ball.squashUntilMs = 0;
	ball.vx = ball.initialVelocityXPx + (Math.random() - 0.5) * 1.4;
	ball.vy = 0.35 + Math.random() * 0.75;
	ball.x = sourceX;
	ball.y = ball.sourceYOffsetPx;
}

function deactivateScaleRainBall(ball: ScaleRainSimulationBall) {
	ball.active = false;
	ball.bounceCount = 0;
	ball.exiting = false;
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

function clampScaleRainX(x: number, radius: number, width: number) {
	return Math.max(radius, Math.min(width - radius, x));
}
