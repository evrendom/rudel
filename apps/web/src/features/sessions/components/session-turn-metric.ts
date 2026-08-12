import type { SessionTurnTableOption } from "./session-turn-table";

export type SessionTurnMetric = "cost" | "duration" | "input" | "output";

export const SESSION_TURN_METRICS: readonly {
	key: SessionTurnMetric;
	label: string;
}[] = [
	{ key: "cost", label: "Cost" },
	{ key: "input", label: "Input" },
	{ key: "output", label: "Output" },
	{ key: "duration", label: "Duration" },
];

const costFormatter = new Intl.NumberFormat("en-US", {
	currency: "USD",
	maximumFractionDigits: 2,
	minimumFractionDigits: 2,
	style: "currency",
});

function formatCompactCount(value: number) {
	if (value < 1_000) {
		return Math.round(value).toLocaleString();
	}

	if (value < 1_000_000) {
		return `${(value / 1_000).toFixed(value < 10_000 ? 1 : 0)}k`;
	}

	return `${(value / 1_000_000).toFixed(value < 10_000_000 ? 1 : 0)}m`;
}

export function getSessionTurnMetricValue(
	option: SessionTurnTableOption,
	metric: SessionTurnMetric,
) {
	switch (metric) {
		case "cost":
			return option.metrics.estimatedCost;
		case "duration":
			return option.timing.durationSeconds;
		case "input":
			return option.metrics.inputTokens;
		case "output":
			return option.metrics.outputTokens;
	}
}

export function formatSessionTurnMetricValue(
	value: number | undefined,
	metric: SessionTurnMetric,
) {
	if (value === undefined) {
		return metric === "cost" ? "$—" : "—";
	}

	if (metric === "cost") {
		return costFormatter.format(value);
	}

	if (metric === "duration") {
		if (value < 60) {
			return `${Math.round(value)}s`;
		}
		if (value < 3_600) {
			return `${Math.round(value / 60)}m`;
		}
		return `${(value / 3_600).toFixed(value < 36_000 ? 1 : 0)}h`;
	}

	return formatCompactCount(value);
}
