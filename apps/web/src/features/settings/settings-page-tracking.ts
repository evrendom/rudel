import type {
	PageViewMetric,
	PageViewSection,
} from "@/features/analytics/tracking/useTrackProductPageView";

export interface SettingsPageTracking {
	isLoading: boolean;
	isError?: boolean;
	hasData: boolean;
	metrics: PageViewMetric[];
	sections: PageViewSection[];
}

interface WorkspaceSettingsTrackingInput {
	hasOrganization: boolean;
	isPending: boolean;
	isError: boolean;
	memberCount: number;
	pendingOutgoingInvitationCount: number;
}

interface MembersSettingsTrackingInput extends WorkspaceSettingsTrackingInput {
	hasWorkspaceData: boolean;
	canManage: boolean;
}

interface AccountSettingsTrackingInput {
	isAccountPending: boolean;
	hasAccountData: boolean;
	linkedProviderCount: number;
	isInvitationsPending: boolean;
	hasInvitationsData: boolean;
	invitationCount: number;
}

export function buildWorkspaceSettingsTracking(
	input: WorkspaceSettingsTrackingInput,
): SettingsPageTracking {
	return {
		isLoading: input.isPending,
		isError: input.isError,
		hasData: input.hasOrganization,
		metrics: buildWorkspaceMembershipMetrics(input),
		sections: [
			{
				id: "organization_identity",
				state: input.hasOrganization ? "populated" : "empty",
			},
			{
				id: "workspace_creation",
				state: "populated",
			},
			{
				id: "workspace_deletion",
				state: input.hasOrganization ? "populated" : "hidden",
			},
		],
	};
}

export function buildMembersSettingsTracking(
	input: MembersSettingsTrackingInput,
): SettingsPageTracking {
	return {
		isLoading: input.isPending,
		isError: input.isError,
		hasData: input.hasOrganization ? input.hasWorkspaceData : false,
		metrics: buildWorkspaceMembershipMetrics(input),
		sections: [
			{
				id: "organization_members",
				state: input.isPending
					? "hidden"
					: input.memberCount > 0
						? "populated"
						: "empty",
				itemCount: input.memberCount,
			},
			{
				id: "invite_member",
				state: input.isPending
					? "hidden"
					: input.canManage
						? "populated"
						: "empty",
			},
			{
				id: "organization_outgoing_invitations",
				state: input.isPending
					? "hidden"
					: input.pendingOutgoingInvitationCount > 0
						? "populated"
						: "empty",
				itemCount: input.pendingOutgoingInvitationCount,
			},
		],
	};
}

export function buildAccountSettingsTracking(
	input: AccountSettingsTrackingInput,
): SettingsPageTracking {
	return {
		isLoading: input.isAccountPending || input.isInvitationsPending,
		hasData: input.hasAccountData,
		metrics: [
			{
				id: "linked_accounts",
				value: input.linkedProviderCount,
			},
			{
				id: "pending_workspace_invitations",
				value: input.invitationCount,
			},
		],
		sections: [
			{
				id: "profile_summary",
				state: input.hasAccountData ? "populated" : "empty",
			},
			{
				id: "linked_accounts",
				state: input.isAccountPending
					? "hidden"
					: input.linkedProviderCount > 0
						? "populated"
						: "empty",
				itemCount: input.linkedProviderCount,
			},
			{
				id: "workspace_invitations",
				state: input.isInvitationsPending
					? "hidden"
					: input.hasInvitationsData
						? "populated"
						: "empty",
				itemCount: input.invitationCount,
			},
			{
				id: "account_deletion",
				state: input.hasAccountData ? "populated" : "hidden",
			},
		],
	};
}

function buildWorkspaceMembershipMetrics(input: {
	memberCount: number;
	pendingOutgoingInvitationCount: number;
}): PageViewMetric[] {
	return [
		{
			id: "members",
			value: input.memberCount,
		},
		{
			id: "pending_outgoing_invitations",
			value: input.pendingOutgoingInvitationCount,
		},
	];
}
