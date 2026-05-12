import { describe, expect, it } from "vitest";
import {
	buildAccountSettingsTracking,
	buildMembersSettingsTracking,
	buildWorkspaceSettingsTracking,
} from "./settings-page-tracking";

describe("settings page tracking builders", () => {
	it("builds workspace settings tracking for populated and empty workspaces", () => {
		expect(
			buildWorkspaceSettingsTracking({
				hasOrganization: true,
				isPending: false,
				isError: false,
				memberCount: 3,
				pendingOutgoingInvitationCount: 2,
			}),
		).toEqual({
			isLoading: false,
			isError: false,
			hasData: true,
			metrics: [
				{ id: "members", value: 3 },
				{ id: "pending_outgoing_invitations", value: 2 },
			],
			sections: [
				{ id: "organization_identity", state: "populated" },
				{ id: "workspace_creation", state: "populated" },
				{ id: "workspace_deletion", state: "populated" },
			],
		});

		expect(
			buildWorkspaceSettingsTracking({
				hasOrganization: false,
				isPending: false,
				isError: false,
				memberCount: 0,
				pendingOutgoingInvitationCount: 0,
			}).sections,
		).toEqual([
			{ id: "organization_identity", state: "empty" },
			{ id: "workspace_creation", state: "populated" },
			{ id: "workspace_deletion", state: "hidden" },
		]);
	});

	it("builds member settings tracking without changing section states", () => {
		expect(
			buildMembersSettingsTracking({
				hasOrganization: true,
				hasWorkspaceData: true,
				isPending: false,
				isError: false,
				memberCount: 2,
				pendingOutgoingInvitationCount: 1,
				canManage: true,
			}),
		).toEqual({
			isLoading: false,
			isError: false,
			hasData: true,
			metrics: [
				{ id: "members", value: 2 },
				{ id: "pending_outgoing_invitations", value: 1 },
			],
			sections: [
				{ id: "organization_members", state: "populated", itemCount: 2 },
				{ id: "invite_member", state: "populated" },
				{
					id: "organization_outgoing_invitations",
					state: "populated",
					itemCount: 1,
				},
			],
		});

		expect(
			buildMembersSettingsTracking({
				hasOrganization: false,
				hasWorkspaceData: true,
				isPending: true,
				isError: false,
				memberCount: 0,
				pendingOutgoingInvitationCount: 0,
				canManage: false,
			}),
		).toMatchObject({
			isLoading: true,
			hasData: false,
			sections: [
				{ id: "organization_members", state: "hidden", itemCount: 0 },
				{ id: "invite_member", state: "hidden" },
				{
					id: "organization_outgoing_invitations",
					state: "hidden",
					itemCount: 0,
				},
			],
		});
	});

	it("builds account settings tracking across profile and invitation states", () => {
		expect(
			buildAccountSettingsTracking({
				isAccountPending: false,
				hasAccountData: true,
				linkedProviderCount: 2,
				isInvitationsPending: true,
				hasInvitationsData: false,
				invitationCount: 0,
			}),
		).toEqual({
			isLoading: true,
			hasData: true,
			metrics: [
				{ id: "linked_accounts", value: 2 },
				{ id: "pending_workspace_invitations", value: 0 },
			],
			sections: [
				{ id: "profile_summary", state: "populated" },
				{ id: "linked_accounts", state: "populated", itemCount: 2 },
				{ id: "workspace_invitations", state: "hidden", itemCount: 0 },
				{ id: "account_deletion", state: "populated" },
			],
		});

		expect(
			buildAccountSettingsTracking({
				isAccountPending: false,
				hasAccountData: false,
				linkedProviderCount: 0,
				isInvitationsPending: false,
				hasInvitationsData: true,
				invitationCount: 1,
			}).sections,
		).toEqual([
			{ id: "profile_summary", state: "empty" },
			{ id: "linked_accounts", state: "empty", itemCount: 0 },
			{ id: "workspace_invitations", state: "populated", itemCount: 1 },
			{ id: "account_deletion", state: "hidden" },
		]);
	});
});
