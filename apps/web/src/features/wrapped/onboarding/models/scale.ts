import type { CSSProperties } from "react";
import { clampNumber, formatCompactNumber } from "../format";
import type { WrappedStepContentLine } from "../helpers";

export const SCALE_STAGE_TOKENS_PER_BALL = 2_000_000;
export const SCALE_STAGE_MIN_BALL_COUNT = 50;

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

export function resolveScalePreviewTokens(
	totalTokens: number,
	previewState: string,
) {
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

export function resolveScaleStageModel(totalTokens: number): ScaleStageModel {
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

export function buildScaleRainBalls(totalTokens: number): ScaleRainBall[] {
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
		const hue = tintBand <= 3 ? 28 + random() * 14 : 214 + random() * 16;

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

export function getScaleRainBallStyle(ball: ScaleRainBall): CSSProperties {
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

export function getScaleRainBallCoreStyle(ball: ScaleRainBall): CSSProperties {
	const fillLightness = ball.hue < 120 ? "82%" : "84%";

	return {
		backgroundColor: `hsl(${ball.hue} 56% ${fillLightness})`,
		border: "1px solid rgba(255, 255, 255, 0.42)",
	};
}

export function buildScaleContent(
	totalTokens: number,
): WrappedStepContentLine[] {
	if (totalTokens <= 0) {
		return [
			{ text: "Token count is still catching up." },
			{ text: "Come back once the ingest finishes." },
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
		return [{ text: headline }, { text: "A novella's worth." }];
	}

	return [{ text: headline }, { text: "A long essay's worth." }];
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
