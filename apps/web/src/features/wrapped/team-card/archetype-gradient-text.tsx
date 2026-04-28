import type { CSSProperties } from "react";
import {
	getWrappedArchetypeCardBackgroundValue,
	type WrappedArchetypeCardTheme,
} from "./archetypes";

interface WrappedArchetypeGradientTextStyle extends CSSProperties {
	"--wrapped-reveal-archetype-accent": string;
	"--wrapped-reveal-archetype-gt-direction": string;
	"--wrapped-reveal-archetype-gt-gradient": string;
}

export type WrappedArchetypeGradientTextState = "active" | "waiting";

const WRAPPED_ARCHETYPE_GRADIENT_TEXT_DARK = "#17161c";
const WRAPPED_ARCHETYPE_GRADIENT_COLOR_PATTERN = /#[\da-fA-F]{3,8}\b/g;
const WRAPPED_ARCHETYPE_LINEAR_GRADIENT_PATTERN =
	/^linear-gradient\(([^,]+),\s*(.+)\)$/;
const WRAPPED_ARCHETYPE_GRADIENT_DARK_HOLD_STOP = 60;
const WRAPPED_ARCHETYPE_GRADIENT_COLOR_RANGE_START = 68;
const WRAPPED_ARCHETYPE_GRADIENT_COLOR_RANGE_END = 100;
const WRAPPED_ARCHETYPE_GRADIENT_COLOR_INSET_STOP = 15;

export interface WrappedArchetypeGradientTextValue {
	accent: string;
	direction: string;
	stops: string;
}

export function WrappedArchetypeGradientText(props: {
	activeArchetype: WrappedArchetypeCardTheme;
	className: string;
	isHoverReplayEnabled?: boolean;
	state: WrappedArchetypeGradientTextState;
	suffix?: string;
}) {
	const {
		activeArchetype,
		className,
		isHoverReplayEnabled = false,
		state,
		suffix = "",
	} = props;
	const gradient = getWrappedArchetypeGradientTextValue(activeArchetype);
	const style: WrappedArchetypeGradientTextStyle = {
		"--wrapped-reveal-archetype-accent": gradient.accent,
		"--wrapped-reveal-archetype-gt-direction": gradient.direction,
		"--wrapped-reveal-archetype-gt-gradient": gradient.stops,
	};
	const classNames = `mymind-wrapped-final-stage__gradient-text ${className}`;

	return (
		<span
			className={classNames}
			data-accent-state={state}
			data-hover-replay={
				isHoverReplayEnabled && state === "active" ? "ready" : undefined
			}
			data-label={activeArchetype.displayLabel}
			style={style}
		>
			{activeArchetype.displayLabel}
			{suffix}
		</span>
	);
}

export function getWrappedArchetypeGradientTextValue(
	theme: WrappedArchetypeCardTheme,
): WrappedArchetypeGradientTextValue {
	const cardBackgroundValue = getWrappedArchetypeCardBackgroundValue(theme);
	const gradientMatch = cardBackgroundValue?.match(
		WRAPPED_ARCHETYPE_LINEAR_GRADIENT_PATTERN,
	);
	const colors = cardBackgroundValue?.match(
		WRAPPED_ARCHETYPE_GRADIENT_COLOR_PATTERN,
	);
	const direction = gradientMatch?.[1]?.trim() ?? "184deg";
	const gradientColors = colors ?? [];

	return {
		accent: buildWrappedArchetypeTextAccentGradient({
			colors: gradientColors,
			direction,
		}),
		direction,
		stops: buildWrappedArchetypeTextGradientStops(gradientColors),
	};
}

function formatWrappedArchetypeGradientStopPosition(position: number) {
	return position.toFixed(2).replace(/\.?0+$/, "");
}

function resolveWrappedArchetypeGradientColorStop(position: number) {
	const colorRange =
		WRAPPED_ARCHETYPE_GRADIENT_COLOR_RANGE_END -
		WRAPPED_ARCHETYPE_GRADIENT_COLOR_RANGE_START;

	return (
		WRAPPED_ARCHETYPE_GRADIENT_COLOR_RANGE_START + (colorRange * position) / 100
	);
}

function buildWrappedArchetypeTextGradientStops(colors: readonly string[]) {
	if (colors.length === 0) {
		return `${WRAPPED_ARCHETYPE_GRADIENT_TEXT_DARK} 0%, ${WRAPPED_ARCHETYPE_GRADIENT_TEXT_DARK} 100%`;
	}

	if (colors.length === 1) {
		return `${WRAPPED_ARCHETYPE_GRADIENT_TEXT_DARK} 0%, ${WRAPPED_ARCHETYPE_GRADIENT_TEXT_DARK} ${WRAPPED_ARCHETYPE_GRADIENT_DARK_HOLD_STOP}%, ${colors[0]} ${WRAPPED_ARCHETYPE_GRADIENT_COLOR_RANGE_START}%, ${colors[0]} ${WRAPPED_ARCHETYPE_GRADIENT_COLOR_RANGE_END}%`;
	}

	const firstColor = colors[0];
	const lastColor = colors[colors.length - 1];
	const interiorColors = colors.slice(1, -1);
	const interiorDenominator = Math.max(interiorColors.length + 1, 1);
	const interiorStops = interiorColors
		.map((color, index) => {
			const stopPosition =
				WRAPPED_ARCHETYPE_GRADIENT_COLOR_INSET_STOP +
				((100 - WRAPPED_ARCHETYPE_GRADIENT_COLOR_INSET_STOP * 2) *
					(index + 1)) /
					interiorDenominator;

			return `${color} ${formatWrappedArchetypeGradientStopPosition(resolveWrappedArchetypeGradientColorStop(stopPosition))}%`;
		})
		.join(", ");
	const edgeStops = [
		`${firstColor} ${formatWrappedArchetypeGradientStopPosition(resolveWrappedArchetypeGradientColorStop(0))}%`,
		`${firstColor} ${formatWrappedArchetypeGradientStopPosition(resolveWrappedArchetypeGradientColorStop(WRAPPED_ARCHETYPE_GRADIENT_COLOR_INSET_STOP))}%`,
		interiorStops,
		`${lastColor} ${formatWrappedArchetypeGradientStopPosition(resolveWrappedArchetypeGradientColorStop(100 - WRAPPED_ARCHETYPE_GRADIENT_COLOR_INSET_STOP))}%`,
		`${lastColor} ${formatWrappedArchetypeGradientStopPosition(resolveWrappedArchetypeGradientColorStop(100))}%`,
	].filter(Boolean);

	return `${WRAPPED_ARCHETYPE_GRADIENT_TEXT_DARK} 0%, ${WRAPPED_ARCHETYPE_GRADIENT_TEXT_DARK} ${WRAPPED_ARCHETYPE_GRADIENT_DARK_HOLD_STOP}%, ${edgeStops.join(", ")}`;
}

function buildWrappedArchetypeTextAccentGradient(input: {
	colors: readonly string[];
	direction: string;
}) {
	const { colors, direction } = input;

	if (colors.length === 0) {
		return WRAPPED_ARCHETYPE_GRADIENT_TEXT_DARK;
	}

	if (colors.length === 1) {
		return colors[0];
	}

	const denominator = Math.max(colors.length - 1, 1);
	const colorStops = colors
		.map((color, index) => {
			const stopPosition = (100 * index) / denominator;

			return `${color} ${formatWrappedArchetypeGradientStopPosition(stopPosition)}%`;
		})
		.join(", ");

	return `linear-gradient(${direction}, ${colorStops})`;
}
