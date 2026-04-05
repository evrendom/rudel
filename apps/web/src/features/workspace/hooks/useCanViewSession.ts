import { authClient } from "@/lib/auth-client";
import { useOrganization } from "@/features/workspace/organization/useOrganization";

export function useCanViewSession() {
	const { meta } = useOrganization();
	const { data: session } = authClient.useSession();
	const currentUserId = session?.user.id;

	return (sessionUserId: string) => {
		if (meta.isOrgAdmin) return true;
		return currentUserId === sessionUserId;
	};
}
