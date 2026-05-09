import { useOrganization } from "@/contexts/OrganizationContext";
import { isYcReviewSession } from "@/features/auth/auth-route-utils";
import { authClient } from "@/lib/auth-client";

/**
 * Returns whether the current user can view a specific session's details.
 * Admins/owners can view all sessions; regular members can only view their own.
 */
export function useCanViewSession() {
	const { isOrgAdmin } = useOrganization();
	const { data: session } = authClient.useSession();
	const currentUserId = session?.user.id;
	const isYcReview = isYcReviewSession(session);

	return (sessionUserId: string) => {
		if (isYcReview) return false;
		if (isOrgAdmin) return true;
		return currentUserId === sessionUserId;
	};
}
