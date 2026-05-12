import type { FullOrganization } from "@/features/workspace/hooks/useFullOrganization";
import type { Organization } from "@/features/workspace/organization/types";

const EMPTY_SUMMARY_VALUE = "\u2014";

interface WorkspaceSettingsViewModelInput {
	activeOrg: Organization | null;
	organizations: readonly Organization[];
	fullOrg: FullOrganization | null;
	currentUserId: string;
	isOrgAdmin: boolean;
	isWorkspacePending: boolean;
	isFullOrgPending: boolean;
	isError: boolean;
}

export interface WorkspaceSettingsSummaryTile {
	id: "members" | "pending_invites" | "your_role";
	label: string;
	displayValue: string;
}

export interface WorkspaceSettingsViewModel {
	activeOrg: Organization | null;
	organizations: readonly Organization[];
	fullOrg: FullOrganization | null;
	pendingInvitations: FullOrganization["invitations"];
	currentUserId: string;
	canManage: boolean;
	currentUserRole: string | null;
	summaryTiles: WorkspaceSettingsSummaryTile[];
	state: {
		hasOrganization: boolean;
		isPending: boolean;
		isError: boolean;
		hasData: boolean;
	};
}

export function buildWorkspaceSettingsViewModel(
	input: WorkspaceSettingsViewModelInput,
): WorkspaceSettingsViewModel {
	const pendingInvitations =
		input.fullOrg?.invitations.filter(
			(invitation) => invitation.status === "pending",
		) ?? [];
	const currentMember = input.fullOrg?.members.find(
		(member) => member.userId === input.currentUserId,
	);
	const currentUserRole = currentMember?.role ?? null;
	const canManage = input.isOrgAdmin && Boolean(input.activeOrg);

	return {
		activeOrg: input.activeOrg,
		organizations: input.organizations,
		fullOrg: input.fullOrg,
		pendingInvitations,
		currentUserId: input.currentUserId,
		canManage,
		currentUserRole,
		summaryTiles: buildWorkspaceSettingsSummaryTiles({
			fullOrg: input.fullOrg,
			pendingInvitationCount: pendingInvitations.length,
			currentUserRole,
		}),
		state: {
			hasOrganization: Boolean(input.activeOrg),
			isPending: input.isWorkspacePending || input.isFullOrgPending,
			isError: input.isError,
			hasData: Boolean(input.fullOrg),
		},
	};
}

function buildWorkspaceSettingsSummaryTiles(input: {
	fullOrg: FullOrganization | null;
	pendingInvitationCount: number;
	currentUserRole: string | null;
}): WorkspaceSettingsSummaryTile[] {
	return [
		{
			id: "members",
			label: "Members",
			displayValue: input.fullOrg
				? String(input.fullOrg.members.length)
				: EMPTY_SUMMARY_VALUE,
		},
		{
			id: "pending_invites",
			label: "Pending invites",
			displayValue: input.fullOrg
				? String(input.pendingInvitationCount)
				: EMPTY_SUMMARY_VALUE,
		},
		{
			id: "your_role",
			label: "Your role",
			displayValue: input.currentUserRole
				? formatWorkspaceRole(input.currentUserRole)
				: EMPTY_SUMMARY_VALUE,
		},
	];
}

function formatWorkspaceRole(role: string) {
	return role.charAt(0).toUpperCase() + role.slice(1);
}
