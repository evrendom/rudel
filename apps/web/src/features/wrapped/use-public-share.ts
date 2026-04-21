import { useQuery } from "@tanstack/react-query";
import { orpc } from "@/lib/orpc";

// Thin query hook for the anonymous wrapped replay page. We keep this separate
// from the authenticated wrapped data hooks so public rendering never drifts
// into private/session-bound query logic by accident.
export function usePublicWrappedShare(shareId: string | null) {
	return useQuery({
		...orpc.wrappedShare.getPublic.queryOptions({
			input: {
				shareId: shareId ?? "",
			},
		}),
		enabled: Boolean(shareId),
		// A missing or invalid share should settle into the explicit error state
		// immediately instead of retrying in the background.
		retry: false,
	});
}
