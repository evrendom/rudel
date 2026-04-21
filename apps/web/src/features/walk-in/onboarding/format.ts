const COMPACT_NUMBER_FORMATTER = new Intl.NumberFormat("en", {
	maximumFractionDigits: 1,
	notation: "compact",
});

export function formatCompactNumber(value: number) {
	return COMPACT_NUMBER_FORMATTER.format(value);
}

export function formatDurationMinutes(minutes: number) {
	if (minutes < 60) {
		return `${Math.round(minutes)} min`;
	}

	const hours = Math.floor(minutes / 60);
	const remainingMinutes = Math.round(minutes - hours * 60);

	if (remainingMinutes === 0) {
		return `${hours}h`;
	}

	return `${hours}h ${remainingMinutes}m`;
}

export function formatPercent(value: number | null) {
	if (value === null) {
		return "0%";
	}

	return `${Math.round(value)}%`;
}

export function clampNumber(value: number, min: number, max: number) {
	return Math.min(max, Math.max(min, value));
}
