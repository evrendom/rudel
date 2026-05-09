import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { authClient } from "../lib/auth-client";

export const USER_INVITATIONS_KEY = ["user-invitations"] as const;

export function useUserInvitations() {
	const queryClient = useQueryClient();

	const { data, isLoading } = useQuery({
		queryKey: USER_INVITATIONS_KEY,
		queryFn: async () => {
			const res = await authClient.organization.listUserInvitations();
			return res.data ?? [];
		},
	});

	const invitations = data ?? [];

	const invalidate = useCallback(() => {
		queryClient.invalidateQueries({ queryKey: USER_INVITATIONS_KEY });
	}, [queryClient]);

	return { invitations, count: invitations.length, isLoading, invalidate };
}
