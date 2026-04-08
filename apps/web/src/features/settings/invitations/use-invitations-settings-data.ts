import { useUserInvitations } from "@/hooks/useUserInvitations";

export function useInvitationsSettingsData() {
	const { invitations, count, isLoading, invalidate } = useUserInvitations();

	return {
		invitations,
		count,
		invalidate,
		state: {
			hasData: invitations.length > 0,
			isPending: isLoading,
		},
	};
}
