import { calculateEstimatedCost as calculateEstimatedModelCost } from "@rudel/api-routes";

const compactFormatter = new Intl.NumberFormat("en-US", {
	maximumFractionDigits: 1,
	notation: "compact",
});

const compactWholeFormatter = new Intl.NumberFormat("en-US", {
	maximumFractionDigits: 0,
	notation: "compact",
});

const currencyFormatter = new Intl.NumberFormat("en-US", {
	currency: "USD",
	maximumFractionDigits: 2,
	minimumFractionDigits: 2,
	style: "currency",
});

const fineCurrencyFormatter = new Intl.NumberFormat("en-US", {
	currency: "USD",
	maximumFractionDigits: 4,
	minimumFractionDigits: 4,
	style: "currency",
});

const wholeCurrencyFormatter = new Intl.NumberFormat("en-US", {
	currency: "USD",
	maximumFractionDigits: 0,
	minimumFractionDigits: 0,
	style: "currency",
});

const compactWholeCurrencyFormatter = new Intl.NumberFormat("en-US", {
	currency: "USD",
	maximumFractionDigits: 0,
	minimumFractionDigits: 0,
	notation: "compact",
	style: "currency",
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
	options?:
		| string
		| null
		| {
				cacheCreationInputTokens?: number;
				cacheReadInputTokens?: number;
				model?: string | null;
		  },
): number {
	const model =
		typeof options === "string" ? options : (options?.model ?? null);

	return calculateEstimatedModelCost({
		cacheCreationInputTokens:
			typeof options === "string"
				? 0
				: (options?.cacheCreationInputTokens ?? 0),
		cacheReadInputTokens:
			typeof options === "string" ? 0 : (options?.cacheReadInputTokens ?? 0),
		inputTokens,
		model,
		outputTokens,
	});
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

export function formatCurrency(value: number) {
	if (value !== 0 && Math.abs(value) < 1) {
		return fineCurrencyFormatter.format(value);
	}

	return currencyFormatter.format(value);
}

export function formatWholeCurrency(value: number) {
	return wholeCurrencyFormatter.format(value);
}

export function formatCompactWholeCurrency(value: number) {
	if (Math.abs(value) < 1_000) {
		return formatWholeCurrency(value);
	}

	return compactWholeCurrencyFormatter.format(value);
}

export function formatMinutes(value: number) {
	return `${value.toFixed(1)} min`;
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
