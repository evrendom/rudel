import type { SessionTurnTableRow } from "./session-turn-table";

const turnCostFormatter = new Intl.NumberFormat("en-US", {
	currency: "USD",
	maximumFractionDigits: 2,
	minimumFractionDigits: 2,
	style: "currency",
});

export function formatTurnCost(value: number) {
	return turnCostFormatter.format(value);
}

export function formatCompactTurnTokens(value: number) {
	if (value < 1_000) {
		return Math.round(value).toLocaleString();
	}

	if (value < 1_000_000) {
		return `${(value / 1_000).toFixed(value < 10_000 ? 1 : 0)}k`;
	}

	return `${(value / 1_000_000).toFixed(value < 10_000_000 ? 1 : 0)}m`;
}

export function formatCompactTurnDuration(label: string) {
	return label
		.replace(/\s*minutes?\b/gi, "m")
		.replace(/\s*mins?\b/gi, "m")
		.replace(/\s*seconds?\b/gi, "s")
		.replace(/\s*secs?\b/gi, "s");
}

export function formatTotalTurnDuration(value: number) {
	const totalSeconds = Math.max(0, Math.round(value));
	const hours = Math.floor(totalSeconds / 3_600);
	const minutes = Math.floor((totalSeconds % 3_600) / 60);
	const seconds = totalSeconds % 60;

	return [
		hours > 0 ? `${hours}h` : undefined,
		minutes > 0 ? `${minutes}m` : undefined,
		hours === 0 && (seconds > 0 || minutes === 0) ? `${seconds}s` : undefined,
	]
		.filter((part) => part !== undefined)
		.join(" ");
}

export function getMaximumRowValue(
	rows: readonly SessionTurnTableRow[],
	getValue: (row: SessionTurnTableRow) => number | undefined,
) {
	return Math.max(
		0,
		...rows.flatMap((row) => {
			const value = getValue(row);
			return value === undefined || !Number.isFinite(value) ? [] : [value];
		}),
	);
}

export function getRowTotal(
	rows: readonly SessionTurnTableRow[],
	getValue: (row: SessionTurnTableRow) => number | undefined,
) {
	let hasValue = false;
	let total = 0;
	for (const row of rows) {
		const value = getValue(row);
		if (value === undefined || !Number.isFinite(value)) {
			continue;
		}
		hasValue = true;
		total += value;
	}

	return hasValue ? total : undefined;
}

export function getRelativeMagnitude(
	value: number | undefined,
	maximum: number,
) {
	if (value === undefined || !Number.isFinite(value)) {
		return undefined;
	}
	if (maximum <= 0) {
		return 0;
	}

	return Math.min(100, Math.max(0, (value / maximum) * 100));
}
