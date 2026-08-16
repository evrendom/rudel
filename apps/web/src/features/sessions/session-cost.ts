import type { SessionTurnMetrics } from "./components/session-turn-metadata";

export function getSessionEstimatedCost(
	turnMetrics: readonly SessionTurnMetrics[],
) {
	const turnsWithUsage = turnMetrics.filter(
		(metrics) => metrics.usageEvents.length > 0,
	);
	if (
		turnsWithUsage.length === 0 ||
		turnsWithUsage.some((metrics) => metrics.estimatedCost === undefined)
	) {
		return undefined;
	}

	return turnsWithUsage.reduce(
		(total, metrics) => total + (metrics.estimatedCost ?? 0),
		0,
	);
}
