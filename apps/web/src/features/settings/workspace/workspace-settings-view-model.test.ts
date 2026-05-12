import { describe, expect, it } from "vitest";
import type { FullOrganization } from "@/features/workspace/hooks/useFullOrganization";
import type { Organization } from "@/features/workspace/organization/types";
import { buildWorkspaceSettingsViewModel } from "./workspace-settings-view-model";

const activeOrg = {
	id: "org-1",
	name: "Rudel",
	slug: "rudel",
} satisfies Organization;

const fullOrg = {
	id: "org-1",
	name: "Rudel",
	slug: "rudel",
	members: [
		{
			id: "member-1",
			userId: "user-1",
			role: "admin",
			user: {
				id: "user-1",
				name: "Ada",
				email: "ada@example.com",
				image: null,
			},
		},
		{
			id: "member-2",
			userId: "user-2",
			role: "member",
			user: {
				id: "user-2",
				name: "Grace",
				email: "grace@example.com",
				image: null,
			},
		},
	],
	invitations: [
		{
			id: "invite-1",
			email: "pending@example.com",
			role: "member",
			status: "pending",
			createdAt: "2026-05-12T10:00:00.000Z",
		},
		{
			id: "invite-2",
			email: "accepted@example.com",
			role: "member",
			status: "accepted",
			createdAt: "2026-05-11T10:00:00.000Z",
		},
	],
} satisfies FullOrganization;

describe("buildWorkspaceSettingsViewModel", () => {
	it("derives workspace members, pending invitations, role, and summary tiles", () => {
		const model = buildWorkspaceSettingsViewModel({
			activeOrg,
			organizations: [activeOrg],
			fullOrg,
			currentUserId: "user-1",
			isOrgAdmin: true,
			isWorkspacePending: false,
			isFullOrgPending: false,
			isError: false,
		});

		expect(model.activeOrg).toBe(activeOrg);
		expect(model.organizations).toEqual([activeOrg]);
		expect(model.pendingInvitations.map((invitation) => invitation.id)).toEqual(
			["invite-1"],
		);
		expect(model.currentUserRole).toBe("admin");
		expect(model.canManage).toBe(true);
		expect(model.summaryTiles).toEqual([
			{ id: "members", label: "Members", displayValue: "2" },
			{ id: "pending_invites", label: "Pending invites", displayValue: "1" },
			{ id: "your_role", label: "Your role", displayValue: "Admin" },
		]);
		expect(model.state).toEqual({
			hasOrganization: true,
			isPending: false,
			isError: false,
			hasData: true,
		});
	});

	it("uses stable empty-state fallbacks when there is no organization data", () => {
		const model = buildWorkspaceSettingsViewModel({
			activeOrg: null,
			organizations: [],
			fullOrg: null,
			currentUserId: "",
			isOrgAdmin: true,
			isWorkspacePending: true,
			isFullOrgPending: false,
			isError: true,
		});

		expect(model.pendingInvitations).toEqual([]);
		expect(model.currentUserRole).toBeNull();
		expect(model.canManage).toBe(false);
		expect(model.summaryTiles).toEqual([
			{ id: "members", label: "Members", displayValue: "\u2014" },
			{
				id: "pending_invites",
				label: "Pending invites",
				displayValue: "\u2014",
			},
			{ id: "your_role", label: "Your role", displayValue: "\u2014" },
		]);
		expect(model.state).toEqual({
			hasOrganization: false,
			isPending: true,
			isError: true,
			hasData: false,
		});
	});
});
