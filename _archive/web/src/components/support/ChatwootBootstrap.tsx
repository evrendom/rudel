import { useEffect } from "react";
import { useOrganization } from "../../contexts/OrganizationContext";
import { authClient } from "../../lib/auth-client";
import { ensureChatwootLoaded, syncChatwootUser } from "../../lib/chatwoot";

export function ChatwootBootstrap() {
	const { data: session } = authClient.useSession();
	const { activeOrg } = useOrganization();

	useEffect(() => {
		void ensureChatwootLoaded().catch(() => {
			// Keep the dashboard usable even if Chatwoot is unavailable.
		});
	}, []);

	useEffect(() => {
		if (!session?.user) {
			return;
		}

		const identifier =
			("id" in session.user && typeof session.user.id === "string"
				? session.user.id
				: undefined) ??
			("email" in session.user && typeof session.user.email === "string"
				? session.user.email
				: undefined);

		if (!identifier) {
			return;
		}

		void syncChatwootUser({
			identifier,
			email:
				"email" in session.user && typeof session.user.email === "string"
					? session.user.email
					: undefined,
			name: session.user.name,
			avatarUrl: session.user.image,
			organizationName: activeOrg?.name,
		});
	}, [activeOrg?.name, session?.user]);

	return null;
}
