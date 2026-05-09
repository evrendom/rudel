import { useQuery } from "@tanstack/react-query";
import { orpc } from "@/lib/orpc";

// Thin query hook for the anonymous wrapped public page. The route shape is
// public-page oriented, but the backend record is still a wrapped share in this
// pass, so this hook translates from public-route id to share lookup input.
export function useWrappedPublicPage(publicId: string | null) {
	return useQuery({
		...orpc.wrappedShare.getPublic.queryOptions({
			input: {
				shareId: publicId ?? "",
			},
		}),
		enabled: Boolean(publicId),
		// A missing or invalid share should settle into the explicit error state
		// immediately instead of retrying in the background.
		retry: false,
	});
}
