type ContextColorScheme = "dark" | "light";

type ContextColorStop = {
	chroma: number;
	hue: number;
	lightness: number;
	offset: number;
};

// These are the Liveline stroke gradient stops from
// SessionThreadOverviewTokenLayer, represented numerically so compact UI
// readouts can resolve the exact color at one utilization percentage.
const CONTEXT_COLOR_STOPS: Record<
	ContextColorScheme,
	readonly ContextColorStop[]
> = {
	dark: [
		{ chroma: 0.15, hue: 151, lightness: 0.78, offset: 0 },
		{ chroma: 0.15, hue: 133, lightness: 0.8, offset: 34 },
		{ chroma: 0.15, hue: 91, lightness: 0.83, offset: 61 },
		{ chroma: 0.18, hue: 52, lightness: 0.78, offset: 82 },
		{ chroma: 0.21, hue: 25, lightness: 0.72, offset: 100 },
	],
	light: [
		{ chroma: 0.17, hue: 151, lightness: 0.58, offset: 0 },
		{ chroma: 0.17, hue: 133, lightness: 0.64, offset: 34 },
		{ chroma: 0.17, hue: 91, lightness: 0.7, offset: 61 },
		{ chroma: 0.2, hue: 52, lightness: 0.64, offset: 82 },
		{ chroma: 0.24, hue: 25, lightness: 0.56, offset: 100 },
	],
};

function interpolate(start: number, end: number, progress: number) {
	return start + (end - start) * progress;
}

export function getSessionOverviewContextUtilizationColor(
	percentage: number,
	scheme: ContextColorScheme,
) {
	const boundedPercentage = Math.min(100, Math.max(0, percentage));
	const stops = CONTEXT_COLOR_STOPS[scheme];
	const upperIndex = stops.findIndex(
		(stop) => stop.offset >= boundedPercentage,
	);
	const upper = stops[Math.max(upperIndex, 0)] ?? stops.at(-1);
	const lower = stops[Math.max(upperIndex - 1, 0)] ?? stops[0];
	if (!lower || !upper) {
		return "currentColor";
	}

	const span = upper.offset - lower.offset;
	const progress = span <= 0 ? 0 : (boundedPercentage - lower.offset) / span;
	const lightness = interpolate(lower.lightness, upper.lightness, progress);
	const chroma = interpolate(lower.chroma, upper.chroma, progress);
	const hue = interpolate(lower.hue, upper.hue, progress);
	return `oklch(${lightness.toFixed(4)} ${chroma.toFixed(4)} ${hue.toFixed(2)})`;
}
