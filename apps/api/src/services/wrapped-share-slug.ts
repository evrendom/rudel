interface BuildWrappedShareIdBaseInput {
	fallbackLabel: string;
	username?: string;
}

const WRAPPED_SHARE_FALLBACK_ID_BASE = "wrapped";
const WRAPPED_SHARE_FALLBACK_ID_BASE_MAX_LENGTH = 64;
const WRAPPED_SHARE_ROUTE_SEGMENT_PATTERN = /^[A-Za-z0-9_-]+$/u;

export function buildWrappedShareIdBase(input: BuildWrappedShareIdBaseInput) {
	const username = input.username?.trim().replace(/^@+/u, "");

	if (username && WRAPPED_SHARE_ROUTE_SEGMENT_PATTERN.test(username)) {
		return username;
	}

	return (
		slugifyWrappedShareFallbackLabel(input.fallbackLabel) ??
		WRAPPED_SHARE_FALLBACK_ID_BASE
	);
}

export function getNextWrappedShareIdCandidate(input: {
	baseId: string;
	existingIds: readonly string[];
}) {
	const { baseId, existingIds } = input;
	const existingIdSet = new Set(existingIds);

	if (!existingIdSet.has(baseId)) {
		return baseId;
	}

	let suffix = 1;
	let candidateId = `${baseId}-${suffix}`;

	while (existingIdSet.has(candidateId)) {
		suffix += 1;
		candidateId = `${baseId}-${suffix}`;
	}

	return candidateId;
}

function slugifyWrappedShareFallbackLabel(value: string) {
	const slug = value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9_-]+/gu, "-")
		.replace(/-+/gu, "-")
		.replace(/^-|-$/gu, "")
		.slice(0, WRAPPED_SHARE_FALLBACK_ID_BASE_MAX_LENGTH)
		.replace(/-$/u, "");

	return slug.length > 0 ? slug : null;
}
