import { useOrganization } from "@/contexts/OrganizationContext";
import { authClient } from "@/lib/auth-client";

/**
 * Returns whether the current user can view a specific session's details.
 * Admins/owners can view all sessions; regular members can only view their own.
 */
export function useCanViewSession() {
	const { isOrgAdmin } = useOrganization();
	const { data: session } = authClient.useSession();
	const currentUserId = session?.user.id;

	return (sessionUserId: string) => {
		if (isOrgAdmin) return true;
		return currentUserId === sessionUserId;
	};
}
