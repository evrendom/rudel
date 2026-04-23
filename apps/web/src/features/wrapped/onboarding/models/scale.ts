import { clampNumber } from "../format";
import type { WrappedStepContentLine } from "../helpers";

const SCALE_STAGE_TOKENS_PER_BALL = 1;
const SCALE_STAGE_MIN_BALL_COUNT = 1;
const SCALE_STAGE_MAX_ACTIVE_BALL_COUNT = 240;
const SCALE_STAGE_BALL_SIZE_PX = 24;
const SCALE_STAGE_SOURCE_X_PERCENTS = [18, 50, 82] as const;

export interface ScaleRainBall {
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

interface ScaleStageModel {
	headline: string;
	totalTokens: number;
}

export function resolveScalePreviewTokens(
	totalTokens: number,
	previewState: string,
) {
	switch (previewState) {
		case "missing":
			return 0;
		case "million":
			return 1_000_000;
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

export function resolveScaleStageModel(totalTokens: number): ScaleStageModel {
	return {
		headline: `${formatScaleTokenTotal(totalTokens)} tokens`,
		totalTokens,
	};
}

export function buildScaleRainBalls(totalTokens: number): ScaleRainBall[] {
	const { displayBallCount } = getScaleBallCountSummary(totalTokens);
	if (displayBallCount <= 0) {
		return [];
	}

	const visibleBallCount = Math.min(
		displayBallCount,
		SCALE_STAGE_MAX_ACTIVE_BALL_COUNT,
	);
	const random = createScaleRainSeededRandom(
		Math.max(1, Math.floor(totalTokens)),
	);

	return Array.from({ length: visibleBallCount }, (_, index) => {
		const sourceXPercent =
			SCALE_STAGE_SOURCE_X_PERCENTS[
				index % SCALE_STAGE_SOURCE_X_PERCENTS.length
			] ?? 50;

		return {
			bounceDamping: Number((0.58 + random() * 0.12).toFixed(2)),
			floorThreshold: Number((1.1 + random() * 1.4).toFixed(2)),
			friction: Number((0.986 + random() * 0.01).toFixed(3)),
			gravityPx: Number((0.42 + random() * 0.12).toFixed(2)),
			id: `scale-rain-ball-${index}`,
			initialVelocityXPx: Number(((random() - 0.5) * 3.6).toFixed(2)),
			maxBounces: random() > 0.56 ? 2 : 1,
			sizePx: SCALE_STAGE_BALL_SIZE_PX,
			sourceXPercent,
			sourceYOffsetPx: Math.round(48 + random() * 28),
			spawnJitterPx: Math.round(18 + random() * 16),
			squashMultiplier: Number((0.038 + random() * 0.02).toFixed(3)),
		} satisfies ScaleRainBall;
	});
}

export function buildScaleContent(
	totalTokens: number,
): WrappedStepContentLine[] {
	return [{ text: `${formatScaleTokenTotal(totalTokens)} tokens` }];
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
		};
	}

	const computedBallCount = Math.max(
		1,
		Math.ceil(totalTokens / SCALE_STAGE_TOKENS_PER_BALL),
	);

	return {
		displayBallCount: clampNumber(
			Math.max(SCALE_STAGE_MIN_BALL_COUNT, computedBallCount),
			SCALE_STAGE_MIN_BALL_COUNT,
			SCALE_STAGE_MAX_ACTIVE_BALL_COUNT,
		),
	};
}

function formatScaleTokenTotal(totalTokens: number) {
	return Math.max(0, Math.round(totalTokens)).toLocaleString("en-US");
}
