import { useUserInvitations } from "@/features/workspace/hooks/useUserInvitations";

export function useInvitationsSettingsData() {
	const { invitations, count, invalidate, isLoading } = useUserInvitations();

	return {
		invitations,
		count,
		invalidate,
		state: {
			isPending: isLoading,
			hasData: invitations.length > 0,
		},
	};
}
