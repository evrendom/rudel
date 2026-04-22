import type { TeamPageMemberRow } from "@/features/team/use-team-page-data";

const SAFE_IMAGE_PROTOCOLS = new Set(["blob:", "data:"]);

// The exported post and the public replay must stay reliable even when the live
// product row points at third-party profile images. Those remote images can be
// blocked by CORS or disappear later, which makes DOM-to-image export brittle.
//
// We keep the rule intentionally conservative for Saturday:
// - same-origin URLs are allowed
// - data/blob URLs are allowed
// - everything else falls back to the no-avatar card treatment
//
// This gives the designer freedom to keep iterating on the live card while the
// share surface stays stable and safe to export.
export function getWrappedShareSafeImageUrl(
	imageUrl: string | null | undefined,
	currentOrigin?: string,
) {
	if (!imageUrl) {
		return null;
	}

	const browserOrigin =
		currentOrigin ??
		(typeof window === "undefined" ? undefined : window.location.origin);

	if (!browserOrigin) {
		return null;
	}

	try {
		const parsedImageUrl = new URL(imageUrl, browserOrigin);

		if (SAFE_IMAGE_PROTOCOLS.has(parsedImageUrl.protocol)) {
			return parsedImageUrl.toString();
		}

		if (parsedImageUrl.origin !== browserOrigin) {
			return null;
		}

		return parsedImageUrl.toString();
	} catch {
		return null;
	}
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
