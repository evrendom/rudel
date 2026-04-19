import type { WrappedV1 } from "@rudel/api-routes";
import { walkInHandoverData } from "@/features/walk-in/data/walk-in-handover-data";
import type {
	WalkInHandover,
	WalkInMetricCandidate,
	WalkInWrappedDataState,
} from "@/features/walk-in/lib/walk-in-handover-schema";

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

export interface BuildWalkInHandoverOptions {
	state: WalkInWrappedDataState;
	wrappedData: WrappedV1 | null;
}

export function buildWalkInHandover(
	options: BuildWalkInHandoverOptions,
): WalkInHandover {
	const { state, wrappedData } = options;
	const isLive = state === "live" && wrappedData !== null;
	const description = getPreviewDescription(state, wrappedData);

	return {
		...walkInHandoverData,
		preview: {
			...walkInHandoverData.preview,
			description,
			metricCandidates: isLive
				? applyLiveMetricCandidates(
						walkInHandoverData.preview.metricCandidates,
						wrappedData,
					)
				: walkInHandoverData.preview.metricCandidates,
		},
		wrapped: {
			data: wrappedData,
			state,
		},
	};
}

function applyLiveMetricCandidates(
	metricCandidates: readonly WalkInMetricCandidate[],
	wrappedData: WrappedV1,
): WalkInMetricCandidate[] {
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
	state: WalkInWrappedDataState,
	wrappedData: WrappedV1 | null,
): string {
	if (state === "loading") {
		return "Loading 8 verified metrics from live analytics for this workspace.";
	}

	if (state === "error") {
		return "Using the seed handover while the live analytics adapter is unavailable.";
	}

	if (state === "live" && wrappedData !== null) {
		if (wrappedData.metrics.total_sessions === 0) {
			return "Live analytics are wired, but this workspace does not have enough session history yet.";
		}

		return "8 verified metrics are now wired from live analytics for this workspace. The rest stay on the wishlist until their semantics are stable.";
	}

	return walkInHandoverData.preview.description;
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
