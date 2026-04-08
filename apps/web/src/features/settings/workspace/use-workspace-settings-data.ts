import { useOrganization } from "@/contexts/OrganizationContext";
import { useFullOrganization } from "@/hooks/useFullOrganization";
import { authClient } from "@/lib/auth-client";

function readSessionUserId(value: unknown) {
	return typeof value === "string" ? value : "";
}

function formatRoleLabel(value: string | null | undefined) {
	if (!value) {
		return "—";
	}

	return value.charAt(0).toUpperCase() + value.slice(1);
}

export function useWorkspaceSettingsData() {
	const { activeOrg, organizations, isLoading, isOrgAdmin, switchOrg } =
		useOrganization();
	const { data: session } = authClient.useSession();
	const {
		data: fullOrg,
		isLoading: isFullOrgLoading,
		invalidate,
	} = useFullOrganization(activeOrg?.id);

	const currentUserId = readSessionUserId(session?.user?.id);
	const currentMember =
		fullOrg?.members.find((member) => member.userId === currentUserId) ?? null;
	const pendingInvitations =
		fullOrg?.invitations.filter(
			(invitation) => invitation.status === "pending",
		) ?? [];
	const canManage = Boolean(activeOrg) && isOrgAdmin;
	const currentUserRole = currentMember?.role ?? null;

	return {
		activeOrg,
		canManage,
		currentUserId,
		currentUserRole,
		fullOrg,
		invalidate,
		organizations,
		pendingInvitations,
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
				id: "your_role",
				label: "Your role",
				displayValue: formatRoleLabel(currentUserRole),
			},
		],
		switchOrg,
		state: {
			hasOrganization: Boolean(activeOrg),
			hasData: Boolean(fullOrg),
			isPending: isLoading || isFullOrgLoading,
		},
	};
}
