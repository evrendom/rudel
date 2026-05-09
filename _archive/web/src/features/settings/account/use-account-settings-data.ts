import { useAccounts } from "@/features/workspace/hooks/useAccounts";
import { authClient } from "@/lib/auth-client";

function readSessionString(value: unknown, fallback = ""): string {
	return typeof value === "string" ? value : fallback;
}

export function useAccountSettingsData() {
	const { data: session, isPending: isSessionPending } =
		authClient.useSession();
	const { accounts, isLoading: areAccountsPending } = useAccounts();

	const user = {
		id: readSessionString(session?.user?.id),
		name: readSessionString(session?.user?.name, "Your profile"),
		email: readSessionString(session?.user?.email),
		image: typeof session?.user?.image === "string" ? session.user.image : null,
	};

	const linkedProviders = new Set(
		accounts.map((account) => account.providerId),
	);

	return {
		user,
		linkedProviders,
		state: {
			isPending: isSessionPending || areAccountsPending,
			hasData: Boolean(user.id),
		},
	};
}
