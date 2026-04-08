// Claude Sonnet 4 rates, used as a default approximation across all models.
// TODO: implement per-model pricing using model_used.
const INPUT_PRICE_PER_MILLION = 3;
const OUTPUT_PRICE_PER_MILLION = 15;

const compactFormatter = new Intl.NumberFormat("en-US", {
	maximumFractionDigits: 1,
	notation: "compact",
});

const compactWholeFormatter = new Intl.NumberFormat("en-US", {
	maximumFractionDigits: 0,
	notation: "compact",
});

const shortMonthDayFormatter = new Intl.DateTimeFormat("en-US", {
	day: "numeric",
	month: "short",
});

const shortMonthDayYearFormatter = new Intl.DateTimeFormat("en-US", {
	day: "numeric",
	month: "short",
	year: "numeric",
});

export function calculateCost(
	inputTokens: number,
	outputTokens: number,
): number {
	return (
		(inputTokens / 1_000_000) * INPUT_PRICE_PER_MILLION +
		(outputTokens / 1_000_000) * OUTPUT_PRICE_PER_MILLION
	);
}

export function formatIsoDate(date: Date) {
	return date.toISOString().slice(0, 10);
}

export function formatDateRangeLabel(startDate: string, endDate: string) {
	const start = new Date(`${startDate}T00:00:00`);
	const end = new Date(`${endDate}T00:00:00`);

	if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
		return "Pick a date";
	}

	const startLabel = shortMonthDayFormatter.format(start);
	const endLabel = shortMonthDayYearFormatter.format(end);

	return `${startLabel} - ${endLabel}`;
}

export function formatCompactNumber(value: number) {
	return compactFormatter.format(value);
}

export function formatCompactWholeNumber(value: number) {
	return compactWholeFormatter.format(value);
}

export function formatPercent(value: number) {
	return `${Math.round(value)}%`;
}

export function formatUsername(
	userId: string,
	userMap?: Record<string, string>,
): string {
	if (userMap?.[userId]) {
		return userMap[userId];
	}
	return userId;
}

export function encodeProjectPath(path: string): string {
	return encodeURIComponent(path);
}

export function decodeProjectPath(encoded: string): string {
	return decodeURIComponent(encoded);
}
