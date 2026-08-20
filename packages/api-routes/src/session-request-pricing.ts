import { calculateEstimatedCost } from "./model-pricing.js";

export type SessionRequestUsageEvent = {
	at: string;
	cacheCreation1hInputTokens?: number;
	cacheCreation5mInputTokens?: number;
	cacheCreationInputTokens: number;
	cacheReadInputTokens: number;
	inputTokens: number;
	model: string | undefined;
	modelContextWindow?: number;
	outputTokens: number;
};

export type SessionRequestUsageSummary = {
	estimatedCost: number | null;
	inputTokens: number | null;
	outputTokens: number | null;
};

export type SessionRequestCostEntry = {
	estimatedCost: number | null;
	usageEventCount: number;
};

export function summarizeSessionRequestUsage(
	usageEvents: readonly SessionRequestUsageEvent[],
): SessionRequestUsageSummary {
	if (usageEvents.length === 0) {
		return {
			estimatedCost: null,
			inputTokens: null,
			outputTokens: null,
		};
	}

	const costs = usageEvents.map((event) =>
		calculateEstimatedCost({
			at: event.at,
			cacheCreation1hInputTokens:
				event.cacheCreation1hInputTokens ?? event.cacheCreationInputTokens,
			cacheCreationInputTokens: event.cacheCreation5mInputTokens ?? 0,
			cacheReadInputTokens: event.cacheReadInputTokens,
			// The request's full input context selects the long-context rate band
			// for models that price >200k-token requests at a premium.
			contextInputTokens:
				event.inputTokens +
				event.cacheReadInputTokens +
				event.cacheCreationInputTokens,
			inputTokens: event.inputTokens,
			model: event.model,
			outputTokens: event.outputTokens,
		}),
	);

	return {
		estimatedCost: costs.some((cost) => cost === null)
			? null
			: costs.reduce<number>((total, cost) => total + (cost ?? 0), 0),
		inputTokens: usageEvents.reduce(
			(total, event) =>
				total +
				event.inputTokens +
				event.cacheReadInputTokens +
				event.cacheCreationInputTokens,
			0,
		),
		outputTokens: usageEvents.reduce(
			(total, event) => total + event.outputTokens,
			0,
		),
	};
}

export function calculateSessionRequestCost(
	usageEventGroups: readonly (readonly SessionRequestUsageEvent[])[],
) {
	return sumSessionRequestCosts(
		usageEventGroups.map((usageEvents) => ({
			estimatedCost: summarizeSessionRequestUsage(usageEvents).estimatedCost,
			usageEventCount: usageEvents.length,
		})),
	);
}

export function sumSessionRequestCosts(
	entries: readonly SessionRequestCostEntry[],
) {
	const summaries = entries.filter((entry) => entry.usageEventCount > 0);
	if (
		summaries.length === 0 ||
		summaries.some((entry) => entry.estimatedCost === null)
	) {
		return null;
	}

	return summaries.reduce(
		(total, entry) => total + (entry.estimatedCost ?? 0),
		0,
	);
}
