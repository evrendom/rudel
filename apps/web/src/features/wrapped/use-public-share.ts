import { useQuery } from "@tanstack/react-query";
import { orpc } from "@/lib/orpc";

export function usePublicWrappedShare(shareId: string | null) {
	return useQuery({
		...orpc.wrappedShare.getPublic.queryOptions({
			input: {
				shareId: shareId ?? "",
			},
		}),
		enabled: Boolean(shareId),
		retry: false,
	});
}
