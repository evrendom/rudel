export const MIN_WRAPPED_RECAP_FEATURE_ADOPTION_RATE = 20;
export const MIN_WRAPPED_RECAP_FEATURE_TOP_COUNT = 3;

interface WrappedFeatureSignalInput {
	adoptionRate: number | null;
	topItemCount: number | null;
}

export function hasWrappedRecapFeatureSignal(input: WrappedFeatureSignalInput) {
	return (
		normalizeWrappedFeatureCount(input.topItemCount) >=
			MIN_WRAPPED_RECAP_FEATURE_TOP_COUNT &&
		hasWrappedRecapFeatureAdoptionSignal(input.adoptionRate)
	);
}

export function hasWrappedLowFeatureUsageSignal(
	input: WrappedFeatureSignalInput,
) {
	const adoptionRate = input.adoptionRate;

	return (
		normalizeWrappedFeatureCount(input.topItemCount) > 0 ||
		(adoptionRate !== null && Number.isFinite(adoptionRate) && adoptionRate > 0)
	);
}

function hasWrappedRecapFeatureAdoptionSignal(adoptionRate: number | null) {
	if (adoptionRate === null) {
		return true;
	}

	return (
		Number.isFinite(adoptionRate) &&
		adoptionRate >= MIN_WRAPPED_RECAP_FEATURE_ADOPTION_RATE
	);
}

function normalizeWrappedFeatureCount(count: number | null) {
	if (count === null || !Number.isFinite(count)) {
		return 0;
	}

	return Math.max(0, count);
}
