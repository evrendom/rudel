const numberFormatter = new Intl.NumberFormat();

const compactNumberFormatter = new Intl.NumberFormat(undefined, {
	notation: "compact",
	maximumFractionDigits: 1,
});

const decimalFormatter = new Intl.NumberFormat(undefined, {
	maximumFractionDigits: 2,
});

const currencyFormatter = new Intl.NumberFormat("en-US", {
	style: "currency",
	currency: "USD",
	minimumFractionDigits: 2,
	maximumFractionDigits: 2,
});

const fineCurrencyFormatter = new Intl.NumberFormat("en-US", {
	style: "currency",
	currency: "USD",
	minimumFractionDigits: 4,
	maximumFractionDigits: 4,
});

const compactCurrencyFormatter = new Intl.NumberFormat("en-US", {
	style: "currency",
	currency: "USD",
	notation: "compact",
	minimumFractionDigits: 0,
	maximumFractionDigits: 1,
});

const minuteFormatter = new Intl.NumberFormat(undefined, {
	maximumFractionDigits: 1,
});

const percentFormatter = new Intl.NumberFormat(undefined, {
	maximumFractionDigits: 1,
});

const shortDateFormatter = new Intl.DateTimeFormat(undefined, {
	month: "short",
	day: "numeric",
});

const fullDateFormatter = new Intl.DateTimeFormat(undefined, {
	month: "short",
	day: "numeric",
	year: "numeric",
});

function parseDateValue(value: string) {
	if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
		const [year, month, day] = value.split("-").map(Number);
		return new Date(year, (month ?? 1) - 1, day ?? 1);
	}

	return new Date(value);
}

const INPUT_TOKEN_COST_PER_MILLION = 3;
const OUTPUT_TOKEN_COST_PER_MILLION = 15;

export function formatNumber(value: number) {
	return numberFormatter.format(value);
}

export function formatCompactNumber(value: number) {
	return compactNumberFormatter.format(value);
}

export function formatDecimal(value: number) {
	return decimalFormatter.format(value);
}

export function formatCurrency(value: number) {
	if (value !== 0 && Math.abs(value) < 1) {
		return fineCurrencyFormatter.format(value);
	}

	return currencyFormatter.format(value);
}

export function formatCompactCurrency(value: number) {
	if (Math.abs(value) < 1_000) {
		return formatCurrency(value);
	}

	return compactCurrencyFormatter.format(value);
}

export function formatMinutes(value: number) {
	return `${minuteFormatter.format(value)} min`;
}

export function formatPercent(value: number) {
	return `${percentFormatter.format(value)}%`;
}

export function formatSignedPercent(value: number) {
	const sign = value > 0 ? "+" : "";
	return `${sign}${percentFormatter.format(value)}%`;
}

export function formatDateLabel(value: string) {
	return shortDateFormatter.format(parseDateValue(value));
}

export function formatFullDateLabel(value: string) {
	return fullDateFormatter.format(parseDateValue(value));
}

export function formatDateRangeLabel(startDate: string, endDate: string) {
	return `${formatDateLabel(startDate)} - ${formatFullDateLabel(endDate)}`;
}

export function formatIsoDate(date: Date) {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

export function clampToPositiveZero(value: number) {
	return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function formatUsername(
	userId: string,
	userMap?: Map<string, string> | Record<string, string | undefined>,
) {
	if (userMap instanceof Map) {
		return userMap.get(userId) ?? userId;
	}

	if (userMap && typeof userMap === "object") {
		return userMap[userId] ?? userId;
	}

	return userId;
}

export function calculateCost(inputTokens: number, outputTokens: number) {
	const inputCost = (inputTokens / 1_000_000) * INPUT_TOKEN_COST_PER_MILLION;
	const outputCost = (outputTokens / 1_000_000) * OUTPUT_TOKEN_COST_PER_MILLION;
	return inputCost + outputCost;
}

export function encodeProjectPath(projectPath: string) {
	return encodeURIComponent(projectPath);
}

export function decodeProjectPath(projectPath: string) {
	try {
		return decodeURIComponent(projectPath);
	} catch {
		return projectPath;
	}
}
