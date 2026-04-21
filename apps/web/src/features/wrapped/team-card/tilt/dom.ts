import {
	RESTING_PORTRAIT_HIGHLIGHT_BLUR,
	RESTING_PORTRAIT_HIGHLIGHT_OPACITY,
	RESTING_PORTRAIT_HIGHLIGHT_X,
	RESTING_PORTRAIT_HIGHLIGHT_Y,
	RESTING_PORTRAIT_SHADOW_BLUR,
	RESTING_PORTRAIT_SHADOW_OPACITY,
	RESTING_PORTRAIT_SHADOW_X,
	RESTING_PORTRAIT_SHADOW_Y,
	RESTING_STAT_GLOSS_ANGLE,
	RESTING_STAT_MASK_X,
	RESTING_STAT_MASK_Y,
} from "./constants";
import type { WrappedCardTiltValues } from "./types";

export function applyTilt(node: HTMLDivElement | null, values: WrappedCardTiltValues) {
	if (!node) {
		return;
	}

	const statGlossAngleDegrees =
		118 + values.rotateYDegrees * 4.2 - values.rotateXDegrees * 2.4;
	const statMaskXPercent = clamp(
		values.glareXPercent + values.rotateYDegrees,
		8,
		92,
	);
	const statMaskYPercent = clamp(
		values.glareYPercent - values.rotateXDegrees * 0.8,
		8,
		92,
	);
	const portraitShadowX = values.rotateYDegrees * 0.36;
	const portraitHighlightX = values.rotateYDegrees * 0.24;
	const portraitHighlightY = clamp(4 + values.rotateXDegrees * 0.28, 2, 7);
	const portraitShadowY = clamp(-4 + values.rotateXDegrees * 0.28, -7, -2);
	const portraitHighlightBlur = clamp(
		4 + Math.abs(values.rotateYDegrees) * 0.18,
		3,
		5.75,
	);
	const portraitShadowBlur = clamp(
		4 + Math.abs(values.rotateYDegrees) * 0.22,
		3,
		6.2,
	);
	const portraitHighlightOpacity = clamp(
		0.52 +
			values.rotateXDegrees * 0.03 -
			Math.abs(values.rotateYDegrees) * 0.006,
		0.32,
		0.82,
	);
	const portraitShadowOpacity = clamp(
		0.63 -
			values.rotateXDegrees * 0.034 +
			Math.abs(values.rotateYDegrees) * 0.01,
		0.4,
		0.94,
	);

	node.dataset.tiltActive = "true";
	node.style.setProperty(
		"--wrapped-card-tilt-glare-opacity",
		values.glareOpacity.toFixed(3),
	);
	node.style.setProperty(
		"--wrapped-card-tilt-glare-x",
		`${values.glareXPercent.toFixed(2)}%`,
	);
	node.style.setProperty(
		"--wrapped-card-tilt-glare-y",
		`${values.glareYPercent.toFixed(2)}%`,
	);
	node.style.setProperty(
		"--wrapped-card-tilt-rotate-x",
		`${values.rotateXDegrees.toFixed(2)}deg`,
	);
	node.style.setProperty(
		"--wrapped-card-tilt-rotate-y",
		`${values.rotateYDegrees.toFixed(2)}deg`,
	);
	node.style.setProperty("--wrapped-card-tilt-scale", values.scale.toFixed(3));
	node.style.setProperty(
		"--wrapped-card-stat-gloss-angle",
		`${statGlossAngleDegrees.toFixed(2)}deg`,
	);
	node.style.setProperty(
		"--wrapped-card-stat-mask-x",
		`${statMaskXPercent.toFixed(2)}%`,
	);
	node.style.setProperty(
		"--wrapped-card-stat-mask-y",
		`${statMaskYPercent.toFixed(2)}%`,
	);
	node.style.setProperty(
		"--wrapped-card-portrait-highlight-x",
		`${portraitHighlightX.toFixed(2)}px`,
	);
	node.style.setProperty(
		"--wrapped-card-portrait-highlight-y",
		`${portraitHighlightY.toFixed(2)}px`,
	);
	node.style.setProperty(
		"--wrapped-card-portrait-highlight-blur",
		`${portraitHighlightBlur.toFixed(2)}px`,
	);
	node.style.setProperty(
		"--wrapped-card-portrait-highlight-opacity",
		portraitHighlightOpacity.toFixed(3),
	);
	node.style.setProperty(
		"--wrapped-card-portrait-shadow-x",
		`${portraitShadowX.toFixed(2)}px`,
	);
	node.style.setProperty(
		"--wrapped-card-portrait-shadow-y",
		`${portraitShadowY.toFixed(2)}px`,
	);
	node.style.setProperty(
		"--wrapped-card-portrait-shadow-blur",
		`${portraitShadowBlur.toFixed(2)}px`,
	);
	node.style.setProperty(
		"--wrapped-card-portrait-shadow-opacity",
		portraitShadowOpacity.toFixed(3),
	);
}

export function resetTilt(node: HTMLDivElement | null) {
	if (!node) {
		return;
	}

	node.dataset.tiltActive = "false";
	node.style.setProperty("--wrapped-card-tilt-glare-opacity", "0");
	node.style.setProperty("--wrapped-card-tilt-glare-x", "50%");
	node.style.setProperty("--wrapped-card-tilt-glare-y", "18%");
	node.style.setProperty("--wrapped-card-tilt-rotate-x", "0deg");
	node.style.setProperty("--wrapped-card-tilt-rotate-y", "0deg");
	node.style.setProperty("--wrapped-card-tilt-scale", "1");
	node.style.setProperty(
		"--wrapped-card-stat-gloss-angle",
		RESTING_STAT_GLOSS_ANGLE,
	);
	node.style.setProperty("--wrapped-card-stat-mask-x", RESTING_STAT_MASK_X);
	node.style.setProperty("--wrapped-card-stat-mask-y", RESTING_STAT_MASK_Y);
	node.style.setProperty(
		"--wrapped-card-portrait-highlight-x",
		RESTING_PORTRAIT_HIGHLIGHT_X,
	);
	node.style.setProperty(
		"--wrapped-card-portrait-highlight-y",
		RESTING_PORTRAIT_HIGHLIGHT_Y,
	);
	node.style.setProperty(
		"--wrapped-card-portrait-highlight-blur",
		RESTING_PORTRAIT_HIGHLIGHT_BLUR,
	);
	node.style.setProperty(
		"--wrapped-card-portrait-highlight-opacity",
		RESTING_PORTRAIT_HIGHLIGHT_OPACITY,
	);
	node.style.setProperty(
		"--wrapped-card-portrait-shadow-x",
		RESTING_PORTRAIT_SHADOW_X,
	);
	node.style.setProperty(
		"--wrapped-card-portrait-shadow-y",
		RESTING_PORTRAIT_SHADOW_Y,
	);
	node.style.setProperty(
		"--wrapped-card-portrait-shadow-blur",
		RESTING_PORTRAIT_SHADOW_BLUR,
	);
	node.style.setProperty(
		"--wrapped-card-portrait-shadow-opacity",
		RESTING_PORTRAIT_SHADOW_OPACITY,
	);
}

function clamp(value: number, min: number, max: number) {
	return Math.min(Math.max(value, min), max);
}
