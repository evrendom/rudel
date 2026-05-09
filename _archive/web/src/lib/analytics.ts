export interface DataPoint {
	date: string;
	value: number;
}

export function calculateRollingAverage(
	data: number[],
	window: number,
): (number | null)[] {
	if (!data || data.length === 0) return [];

	const result: (number | null)[] = [];

	for (let i = 0; i < data.length; i++) {
		if (i < window - 1) {
			result.push(null);
		} else {
			let sum = 0;
			for (let j = i - window + 1; j <= i; j++) {
				sum += data[j];
			}
			result.push(sum / window);
		}
	}

	return result;
}

export function calculateWeekOverWeek(
	currentWeekData: number[],
	previousWeekData: number[],
): number {
	if (!currentWeekData.length || !previousWeekData.length) return 0;

	const currentSum = currentWeekData.reduce((sum, val) => sum + val, 0);
	const previousSum = previousWeekData.reduce((sum, val) => sum + val, 0);

	if (previousSum === 0) return currentSum > 0 ? 100 : 0;

	return ((currentSum - previousSum) / previousSum) * 100;
}

export function detectAnomalies(
	data: number[],
	threshold: number = 50,
): boolean[] {
	if (!data || data.length < 2) return data.map(() => false);

	const result: boolean[] = [false];

	for (let i = 1; i < data.length; i++) {
		const current = data[i];
		const previous = data[i - 1];

		if (previous === 0) {
			result.push(current > 0);
			continue;
		}

		const percentChange = Math.abs(((current - previous) / previous) * 100);
		result.push(percentChange > threshold);
	}

	return result;
}

export function getTrendDirection(data: number[]): "up" | "down" | "stable" {
	if (!data || data.length < 2) return "stable";

	const firstHalf = data.slice(0, Math.floor(data.length / 2));
	const lastHalf = data.slice(Math.floor(data.length / 2));

	const firstAvg =
		firstHalf.reduce((sum, val) => sum + val, 0) / firstHalf.length;
	const lastAvg = lastHalf.reduce((sum, val) => sum + val, 0) / lastHalf.length;

	const percentChange = ((lastAvg - firstAvg) / firstAvg) * 100;

	if (Math.abs(percentChange) < 5) return "stable";
	return percentChange > 0 ? "up" : "down";
}

export function getTrendIcon(direction: "up" | "down" | "stable"): string {
	switch (direction) {
		case "up":
			return "\u2191";
		case "down":
			return "\u2193";
		case "stable":
			return "\u2192";
	}
}

export function getTrendColor(
	direction: "up" | "down" | "stable",
	isPositiveGood: boolean = true,
): string {
	if (direction === "stable") return "text-gray-500";

	const isGood = isPositiveGood ? direction === "up" : direction === "down";
	return isGood ? "text-green-600" : "text-red-600";
}

export function formatWoWChange(percentage: number): string {
	const sign = percentage >= 0 ? "+" : "";
	return `${sign}${percentage.toFixed(1)}%`;
}

export function calculateStats(data: number[]): {
	mean: number;
	median: number;
	stdDev: number;
	min: number;
	max: number;
} {
	if (!data || data.length === 0) {
		return { mean: 0, median: 0, stdDev: 0, min: 0, max: 0 };
	}

	const sorted = [...data].sort((a, b) => a - b);
	const mean = data.reduce((sum, val) => sum + val, 0) / data.length;
	const median = sorted[Math.floor(sorted.length / 2)];

	const variance =
		data.reduce((sum, val) => sum + (val - mean) ** 2, 0) / data.length;
	const stdDev = Math.sqrt(variance);

	return {
		mean,
		median,
		stdDev,
		min: sorted[0],
		max: sorted[sorted.length - 1],
	};
}
