import type { WrappedV1 } from "@rudel/api-routes";
import { wrappedHandoverData } from "@/features/wrapped/data/handover-data";
import type {
	WrappedDataState,
	WrappedHandover,
	WrappedMetricCandidate,
} from "@/features/wrapped/lib/handover-schema";

const COMPACT_NUMBER_FORMATTER = new Intl.NumberFormat("en", {
	maximumFractionDigits: 1,
	notation: "compact",
});

const CURRENCY_FORMATTER = new Intl.NumberFormat("en-US", {
	currency: "USD",
	maximumFractionDigits: 2,
	minimumFractionDigits: 2,
	style: "currency",
});

export interface BuildWrappedHandoverOptions {
	state: WrappedDataState;
	wrappedData: WrappedV1 | null;
}

export function buildWrappedHandover(
	options: BuildWrappedHandoverOptions,
): WrappedHandover {
	const { state, wrappedData } = options;
	const isLive = state === "live" && wrappedData !== null;
	const description = getPreviewDescription(state, wrappedData);

	return {
		...wrappedHandoverData,
		preview: {
			...wrappedHandoverData.preview,
			description,
			metricCandidates: isLive
				? applyLiveMetricCandidates(
						wrappedHandoverData.preview.metricCandidates,
						wrappedData,
					)
				: wrappedHandoverData.preview.metricCandidates,
		},
		wrapped: {
			data: wrappedData,
			state,
		},
	};
}

function applyLiveMetricCandidates(
	metricCandidates: readonly WrappedMetricCandidate[],
	wrappedData: WrappedV1,
): WrappedMetricCandidate[] {
	return metricCandidates.map((metricCandidate) => {
		switch (metricCandidate.id) {
			case "days-since-first-use":
				return {
					...metricCandidate,
					status: "available",
					notes: getDaysSinceFirstUseNote(wrappedData),
				};
			case "favorite-model":
				return {
					...metricCandidate,
					status: "available",
					notes: getFavoriteModelNote(wrappedData),
				};
			case "total-tokens":
				return {
					...metricCandidate,
					status: "available",
					notes: getTotalTokensNote(wrappedData),
				};
			case "total-spend":
				return {
					...metricCandidate,
					status: "available",
					notes: getEstimatedSpendNote(wrappedData),
				};
			default:
				return metricCandidate;
		}
	});
}

function getPreviewDescription(
	state: WrappedDataState,
	wrappedData: WrappedV1 | null,
): string {
	if (state === "loading") {
		return "Scanning your workspace history to turn Claude Code and Codex usage into a live trading card.";
	}

	if (state === "error") {
		return "Showing the seed trading card while live analytics are temporarily unavailable.";
	}

	if (state === "live" && wrappedData !== null) {
		if (wrappedData.metrics.total_sessions === 0) {
			return "The card engine is ready, but this workspace needs a few recorded sessions before the usage story appears.";
		}

		return "Live workspace history is driving this card: sessions, favorite model, Claude-vs-Codex split, token volume, longest lock-in, and estimated spend.";
	}

	return wrappedHandoverData.preview.description;
}

function getDaysSinceFirstUseNote(wrappedData: WrappedV1): string {
	const firstSessionDate = wrappedData.metrics.first_session_at?.slice(0, 10);

	if (!firstSessionDate) {
		return "Live adapter is wired, but no qualifying sessions have been found yet.";
	}

	return `${wrappedData.metrics.days_since_first_session} days since ${firstSessionDate}.`;
}

function getFavoriteModelNote(wrappedData: WrappedV1): string {
	const favoriteModel = wrappedData.metrics.favorite_model;

	if (!favoriteModel) {
		return "Live adapter is wired, but there is no stable model preference yet.";
	}

	return `${favoriteModel} is currently leading for this active workspace.`;
}

function getTotalTokensNote(wrappedData: WrappedV1): string {
	return `${formatCompactNumber(wrappedData.metrics.total_tokens)} tokens across ${wrappedData.metrics.total_sessions} sessions.`;
}

function getEstimatedSpendNote(wrappedData: WrappedV1): string {
	return `${CURRENCY_FORMATTER.format(wrappedData.metrics.estimated_spend_usd)} estimated from the model pricing catalog.`;
}

function formatCompactNumber(value: number): string {
	return COMPACT_NUMBER_FORMATTER.format(value);
}
