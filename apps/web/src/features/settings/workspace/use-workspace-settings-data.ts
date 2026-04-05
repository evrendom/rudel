import { useFullOrganization } from "@/features/workspace/hooks/useFullOrganization";
import { useOrganization } from "@/features/workspace/organization/useOrganization";
import { authClient } from "@/lib/auth-client";

function readSessionUserId(value: unknown) {
	return typeof value === "string" ? value : "";
}

export function useWorkspaceSettingsData() {
	const { state, meta } = useOrganization();
	const { data: session } = authClient.useSession();
	const {
		data: fullOrg,
		isLoading: isFullOrgPending,
		isError,
		invalidate,
	} = useFullOrganization(state.activeOrg?.id);

	const currentUserId = readSessionUserId(session?.user?.id);
	const pendingInvitations =
		fullOrg?.invitations.filter((invitation) => invitation.status === "pending") ??
		[];
	const currentMember = fullOrg?.members.find(
		(member) => member.userId === currentUserId,
	);
	const canManage = meta.isOrgAdmin && Boolean(state.activeOrg);

	return {
		activeOrg: state.activeOrg,
		organizations: state.organizations,
		fullOrg,
		pendingInvitations,
		currentUserId,
		canManage,
		currentUserRole: currentMember?.role ?? null,
		invalidate,
		summaryTiles: [
			{
				id: "members",
				label: "Members",
				displayValue: fullOrg ? String(fullOrg.members.length) : "—",
			},
			{
				id: "pending_invites",
				label: "Pending invites",
				displayValue: fullOrg ? String(pendingInvitations.length) : "—",
			},
			{
				id: "workspace",
				label: "Workspace",
				displayValue: state.activeOrg?.name ?? "No workspace",
			},
		],
		state: {
			hasOrganization: Boolean(state.activeOrg),
			isPending: state.isLoading || isFullOrgPending,
			isError,
			hasData: Boolean(fullOrg),
		},
	};
}
