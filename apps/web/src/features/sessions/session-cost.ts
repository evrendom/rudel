import { sumSessionRequestCosts } from "@rudel/api-routes";
import type { SessionTurnMetrics } from "./components/session-turn-metadata";

export function getSessionEstimatedCost(
	turnMetrics: readonly SessionTurnMetrics[],
) {
	return (
		sumSessionRequestCosts(
			turnMetrics.map((metrics) => ({
				estimatedCost: metrics.estimatedCost ?? null,
				usageEventCount: metrics.usageEvents.length,
			})),
		) ?? undefined
	);
}
