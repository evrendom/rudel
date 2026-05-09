import { useQuery } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";

interface Account {
	id: string;
	providerId: string;
}

const ACCOUNTS_KEY = ["accounts"] as const;

export function useAccounts() {
	const { data, isLoading } = useQuery({
		queryKey: ACCOUNTS_KEY,
		queryFn: async () => {
			const res = await authClient.listAccounts();
			return (res.data as readonly Account[]) ?? [];
		},
	});

	return { accounts: data ?? [], isLoading };
}
