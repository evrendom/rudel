import { useAccounts } from "@/hooks/useAccounts";
import { authClient } from "@/lib/auth-client";

function readSessionString(value: unknown, fallback = "") {
	return typeof value === "string" ? value : fallback;
}

export function useAccountSettingsData() {
	const { data: session, isPending: isSessionPending } =
		authClient.useSession();
	const { accounts, isLoading: areAccountsPending } = useAccounts();

	const user = {
		email: readSessionString(session?.user?.email),
		id: readSessionString(session?.user?.id),
		image: typeof session?.user?.image === "string" ? session.user.image : null,
		name: readSessionString(session?.user?.name, "Your profile"),
	};
	const linkedProviders = new Set(
		accounts.map((account) => account.providerId),
	);

	return {
		linkedProviders,
		state: {
			hasData: Boolean(user.id),
			isPending: isSessionPending || areAccountsPending,
		},
		user,
	};
}
