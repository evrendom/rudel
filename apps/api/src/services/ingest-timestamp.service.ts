export function createMonotonicIngestedAt(
	getCurrentTime: () => number = Date.now,
): () => Date {
	let previousTimestampMs = 0;

	return () => {
		previousTimestampMs = Math.max(getCurrentTime(), previousTimestampMs + 1);
		return new Date(previousTimestampMs);
	};
}

export const getNextIngestedAt = createMonotonicIngestedAt();
