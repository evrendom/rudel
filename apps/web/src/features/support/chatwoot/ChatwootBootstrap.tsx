import { useMountEffect } from "@/app/hooks/useMountEffect";
import { useOrganization } from "@/features/workspace/organization/useOrganization";
import { authClient } from "@/lib/auth-client";
import {
	ensureChatwootLoaded,
	isChatwootEnabled,
	syncChatwootUser,
} from "@/lib/chatwoot";
import { client } from "@/lib/orpc";

function ChatwootLoaderMount() {
	useMountEffect(() => {
		void ensureChatwootLoaded().catch(() => {
			// Keep the dashboard usable even if Chatwoot is unavailable.
		});
	});

	return null;
}

function ChatwootUserSyncMount({
	avatarUrl,
	email,
	name,
	organizationName,
}: {
	avatarUrl?: string;
	email?: string;
	name?: string;
	organizationName?: string;
}) {
	useMountEffect(() => {
		if (!isChatwootEnabled()) {
			return;
		}

		let cancelled = false;
		async function syncCurrentUser() {
			const identity = await client.chatwoot.identity();
			if (!identity || cancelled) {
				return;
			}

			await syncChatwootUser({
				...identity,
				email,
				name,
				avatarUrl,
				organizationName,
			});
		}

		void syncCurrentUser().catch(() => {
			// Keep the dashboard usable if signed identity is unavailable.
		});

		return () => {
			cancelled = true;
		};
	});

	return null;
}

export function ChatwootBootstrap() {
	const { data: session } = authClient.useSession();
	const { state } = useOrganization();
	const userId =
		session?.user && "id" in session.user && typeof session.user.id === "string"
			? session.user.id
			: undefined;
	const email =
		session?.user &&
		"email" in session.user &&
		typeof session.user.email === "string"
			? session.user.email
			: undefined;
	const name =
		typeof session?.user?.name === "string" ? session.user.name : undefined;
	const avatarUrl =
		typeof session?.user?.image === "string" ? session.user.image : undefined;
	const organizationName = state.activeOrg?.name;

	return (
		<>
			<ChatwootLoaderMount />
			{userId ? (
				<ChatwootUserSyncMount
					key={`${userId}:${email ?? ""}:${name ?? ""}:${avatarUrl ?? ""}:${organizationName ?? ""}`}
					avatarUrl={avatarUrl}
					email={email}
					name={name}
					organizationName={organizationName}
				/>
			) : null}
		</>
	);
}
