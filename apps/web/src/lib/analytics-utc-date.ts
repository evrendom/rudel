const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

export function parseAnalyticsUtcDate(value: string) {
	return new Date(
		DATE_ONLY_PATTERN.test(value) ? `${value}T00:00:00.000Z` : value,
	);
}

export function startOfUtcHour(date: Date) {
	return new Date(
		Date.UTC(
			date.getUTCFullYear(),
			date.getUTCMonth(),
			date.getUTCDate(),
			date.getUTCHours(),
		),
	);
}

export function startOfUtcDay(date: Date) {
	return new Date(
		Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
	);
}

export function startOfUtcWeek(date: Date) {
	const start = startOfUtcDay(date);
	const daysSinceMonday = (start.getUTCDay() + 6) % 7;
	return addUtcDays(start, -daysSinceMonday);
}

export function startOfUtcMonth(date: Date) {
	return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

export function addUtcHours(date: Date, amount: number) {
	return new Date(date.getTime() + amount * 3_600_000);
}

export function addUtcDays(date: Date, amount: number) {
	return new Date(date.getTime() + amount * 86_400_000);
}

export function addUtcWeeks(date: Date, amount: number) {
	return addUtcDays(date, amount * 7);
}

export function addUtcMonths(date: Date, amount: number) {
	return new Date(
		Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + amount, 1),
	);
}

export function formatAnalyticsUtcDate(
	date: Date,
	options: Intl.DateTimeFormatOptions,
) {
	return new Intl.DateTimeFormat("en-US", {
		...options,
		timeZone: "UTC",
	}).format(date);
}

export function formatAnalyticsUtcDateKey(date: Date) {
	return date.toISOString().slice(0, 10);
}
