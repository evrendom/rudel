import { isYcReviewSession } from "@/features/auth/auth-route-utils";
import { useOrganization } from "@/features/workspace/organization/useOrganization";
import { authClient } from "@/lib/auth-client";

export function useCanViewSession() {
	const { meta } = useOrganization();
	const { data: session } = authClient.useSession();
	const currentUserId = session?.user.id;
	const isYcReview = isYcReviewSession(session);

	return (sessionUserId: string) => {
		if (isYcReview) return false;
		if (meta.isOrgAdmin) return true;
		return currentUserId === sessionUserId;
	};
}
