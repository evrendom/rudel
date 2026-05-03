interface BuildWrappedShareIdBaseInput {
	displayName: string;
}

const WRAPPED_SHARE_FALLBACK_ID_BASE = "wrapped";
const WRAPPED_SHARE_FALLBACK_ID_BASE_MAX_LENGTH = 64;
const WRAPPED_SHARE_DUPLICATE_ADJECTIVES = [
	"atomic",
	"brilliant",
	"clever",
	"cosmic",
	"electric",
	"fearless",
	"golden",
	"kinetic",
	"legendary",
	"luminous",
	"magnetic",
	"moonlit",
	"mythic",
	"neon",
	"nova",
	"prime",
	"radiant",
	"sapphire",
	"solar",
	"stellar",
	"turbo",
	"velvet",
	"vivid",
	"wild",
] as const;

export function buildWrappedShareIdBase(input: BuildWrappedShareIdBaseInput) {
	return (
		slugifyWrappedShareDisplayName(input.displayName) ??
		WRAPPED_SHARE_FALLBACK_ID_BASE
	);
}

export function isWrappedShareIdAlignedWithBase(input: {
	baseId: string;
	shareId: string;
}) {
	const { baseId, shareId } = input;

	return (
		shareId === baseId ||
		shareId.endsWith(`-${baseId}`) ||
		shareId.includes(`-${baseId}-`)
	);
}

export function getNextWrappedShareIdCandidate(input: {
	baseId: string;
	existingIds: readonly string[];
	randomValue?: number;
}) {
	const { baseId, existingIds } = input;
	const existingIdSet = new Set(existingIds);

	if (!existingIdSet.has(baseId)) {
		return baseId;
	}

	const availableAdjectives = WRAPPED_SHARE_DUPLICATE_ADJECTIVES.filter(
		(adjective) => !existingIdSet.has(`${adjective}-${baseId}`),
	);

	if (availableAdjectives.length > 0) {
		const randomValue = input.randomValue ?? Math.random();
		const normalizedRandomValue = Number.isFinite(randomValue)
			? Math.abs(randomValue % 1)
			: 0;
		const adjectiveIndex = Math.floor(
			normalizedRandomValue * availableAdjectives.length,
		);
		const adjective = availableAdjectives[adjectiveIndex];

		if (adjective) {
			return `${adjective}-${baseId}`;
		}
	}

	let suffix = 2;

	while (true) {
		for (const adjective of WRAPPED_SHARE_DUPLICATE_ADJECTIVES) {
			const candidateId = `${adjective}-${baseId}-${suffix}`;

			if (!existingIdSet.has(candidateId)) {
				return candidateId;
			}
		}

		suffix += 1;
	}
}

function slugifyWrappedShareDisplayName(value: string) {
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
