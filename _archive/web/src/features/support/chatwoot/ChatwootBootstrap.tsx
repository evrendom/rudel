import { useMountEffect } from "@/app/hooks/useMountEffect";
import { useOrganization } from "@/features/workspace/organization/useOrganization";
import { authClient } from "@/lib/auth-client";
import { ensureChatwootLoaded, syncChatwootUser } from "@/lib/chatwoot";

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
	identifier,
	name,
	organizationName,
}: {
	avatarUrl?: string;
	email?: string;
	identifier: string;
	name?: string;
	organizationName?: string;
}) {
	useMountEffect(() => {
		void syncChatwootUser({
			identifier,
			email,
			name,
			avatarUrl,
			organizationName,
		});
	});

	return null;
}

export function ChatwootBootstrap() {
	const { data: session } = authClient.useSession();
	const { state } = useOrganization();
	const identifier =
		session?.user &&
		(("id" in session.user && typeof session.user.id === "string"
			? session.user.id
			: undefined) ??
			("email" in session.user && typeof session.user.email === "string"
				? session.user.email
				: undefined));
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
			{identifier ? (
				<ChatwootUserSyncMount
					key={`${identifier}:${email ?? ""}:${name ?? ""}:${avatarUrl ?? ""}:${organizationName ?? ""}`}
					avatarUrl={avatarUrl}
					email={email}
					identifier={identifier}
					name={name}
					organizationName={organizationName}
				/>
			) : null}
		</>
	);
}
