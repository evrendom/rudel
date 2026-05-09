import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { authClient } from "@/lib/auth-client";

interface FullOrg {
	id: string;
	name: string;
	slug: string;
	members: readonly {
		id: string;
		userId: string;
		role: string;
		user: { id: string; name: string; email: string; image: string | null };
	}[];
	invitations: readonly {
		id: string;
		email: string;
		role: string | null;
		status: string;
	}[];
}

export function useFullOrganization(orgId: string | undefined) {
	const queryClient = useQueryClient();
	const queryKey = ["full-organization", orgId] as const;

	const { data, isLoading } = useQuery({
		queryKey,
		queryFn: async () => {
			const res = await authClient.organization.getFullOrganization({
				query: { organizationId: orgId as string },
			});
			return (res.data as unknown as FullOrg) ?? null;
		},
		enabled: !!orgId,
	});

	const invalidate = useCallback(() => {
		queryClient.invalidateQueries({ queryKey });
	}, [queryClient, queryKey]);

	return { data: data ?? null, isLoading, invalidate };
}
