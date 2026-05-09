import { AVATAR_URL_PATH_REGEX } from "@rudel/api-routes";
import type { TeamPageMemberRow } from "@/features/team/use-team-page-data";

const SAFE_EMBEDDED_IMAGE_PROTOCOLS = new Set(["blob:", "data:"]);

// Public replay should keep real account avatars from providers such as GitHub
// and Google, but still reject protocols we would not want to persist into an
// anonymous route.
//
// Rules:
// - HTTPS provider avatar URLs are allowed for public replay
// - data/blob URLs are allowed
// - the relative `/api/avatar/<uuid>` path is allowed (resolved by the
//   share-page origin at render time; never absolutized at write time so prod
//   shares don't capture localhost in dev)
// - everything else (other relatives, http:, untrusted protocols) → null
export function getWrappedShareSafeImageUrl(
	imageUrl: string | null | undefined,
) {
	if (!imageUrl) {
		return null;
	}
	const trimmed = imageUrl.trim();

	if (AVATAR_URL_PATH_REGEX.test(trimmed)) {
		return trimmed;
	}

	let parsedImageUrl: URL;
	try {
		parsedImageUrl = new URL(trimmed);
	} catch {
		return null;
	}

	if (SAFE_EMBEDDED_IMAGE_PROTOCOLS.has(parsedImageUrl.protocol)) {
		return parsedImageUrl.toString();
	}

	if (parsedImageUrl.protocol === "https:") {
		return parsedImageUrl.toString();
	}

	return null;
}

// Keep the export/public-share row transform as a tiny helper so the "safe
// share surface" rule is reusable without spreading image-policy logic across
// page components.
export function buildWrappedShareSafeRow(row: TeamPageMemberRow) {
	return {
		...row,
		imageUrl: getWrappedShareSafeImageUrl(row.imageUrl),
	};
}
