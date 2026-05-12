import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { authClient } from "@/lib/auth-client";

export interface FullOrganization {
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
		createdAt?: string;
	}[];
}

export function useFullOrganization(orgId: string | undefined) {
	const queryClient = useQueryClient();
	const queryKey = ["full-organization", orgId] as const;

	const { data, isLoading, isError } = useQuery({
		queryKey,
		queryFn: async () => {
			const res = await authClient.organization.getFullOrganization({
				query: { organizationId: orgId as string },
			});
			return (res.data as unknown as FullOrganization) ?? null;
		},
		enabled: !!orgId,
	});

	const invalidate = useCallback(() => {
		return queryClient.invalidateQueries({ queryKey });
	}, [queryClient, queryKey]);

	return { data: data ?? null, isLoading, isError, invalidate };
}
