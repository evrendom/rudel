import { describe, expect, test } from "bun:test";
import {
	getAdminAccessBlockMessage,
	getRoles,
	hasAdminRole,
	isAdminAccessPath,
	isOwnerRole,
	ONLY_OWNER_CAN_MANAGE_ADMIN_MESSAGE,
	ORGANIZATION_AUTH_PATHS,
} from "../organization-role-policy.js";

describe("organization role policy", () => {
	test("recognizes endpoints that touch admin access", () => {
		expect(isAdminAccessPath(ORGANIZATION_AUTH_PATHS.addMember)).toBe(true);
		expect(isAdminAccessPath(ORGANIZATION_AUTH_PATHS.inviteMember)).toBe(true);
		expect(isAdminAccessPath(ORGANIZATION_AUTH_PATHS.updateMemberRole)).toBe(
			true,
		);
		expect(isAdminAccessPath(ORGANIZATION_AUTH_PATHS.removeMember)).toBe(true);
		expect(isAdminAccessPath(ORGANIZATION_AUTH_PATHS.cancelInvitation)).toBe(
			true,
		);
		expect(isAdminAccessPath("/api/auth/organization/list-members")).toBe(
			false,
		);
	});

	test("normalizes role input from strings and arrays", () => {
		expect(getRoles("admin")).toEqual(["admin"]);
		expect(getRoles("member, admin")).toEqual(["member", "admin"]);
		expect(getRoles(["member", "admin"])).toEqual(["member", "admin"]);
		expect(getRoles(["member,admin", 123])).toEqual(["member", "admin"]);
		expect(getRoles(null)).toEqual([]);
	});

	test("detects admin and owner roles", () => {
		expect(hasAdminRole("admin")).toBe(true);
		expect(hasAdminRole(["member", "admin"])).toBe(true);
		expect(hasAdminRole("member")).toBe(false);
		expect(isOwnerRole("owner")).toBe(true);
		expect(isOwnerRole("admin,owner")).toBe(true);
		expect(isOwnerRole("admin")).toBe(false);
	});

	test("blocks non-owners from assigning admin", () => {
		const message = getAdminAccessBlockMessage({
			pathname: ORGANIZATION_AUTH_PATHS.updateMemberRole,
			actorRole: "admin",
			requestedRole: "admin",
		});

		expect(message).toBe(ONLY_OWNER_CAN_MANAGE_ADMIN_MESSAGE);
	});

	test("blocks non-owners from demoting an existing admin", () => {
		const message = getAdminAccessBlockMessage({
			pathname: ORGANIZATION_AUTH_PATHS.updateMemberRole,
			actorRole: "admin",
			requestedRole: "member",
			targetMemberRole: "admin",
		});

		expect(message).toBe(ONLY_OWNER_CAN_MANAGE_ADMIN_MESSAGE);
	});

	test("blocks non-owners from removing an admin member", () => {
		const message = getAdminAccessBlockMessage({
			pathname: ORGANIZATION_AUTH_PATHS.removeMember,
			actorRole: "admin",
			targetMemberRole: "admin",
		});

		expect(message).toBe(ONLY_OWNER_CAN_MANAGE_ADMIN_MESSAGE);
	});

	test("blocks non-owners from canceling an admin invitation", () => {
		const message = getAdminAccessBlockMessage({
			pathname: ORGANIZATION_AUTH_PATHS.cancelInvitation,
			actorRole: "admin",
			targetInvitationRole: "admin",
		});

		expect(message).toBe(ONLY_OWNER_CAN_MANAGE_ADMIN_MESSAGE);
	});

	test("allows owners to manage admin access", () => {
		const message = getAdminAccessBlockMessage({
			pathname: ORGANIZATION_AUTH_PATHS.updateMemberRole,
			actorRole: "owner",
			requestedRole: "admin",
			targetMemberRole: "admin",
		});

		expect(message).toBeNull();
	});

	test("allows non-admin changes to pass through", () => {
		const message = getAdminAccessBlockMessage({
			pathname: ORGANIZATION_AUTH_PATHS.removeMember,
			actorRole: "admin",
			targetMemberRole: "member",
		});

		expect(message).toBeNull();
	});
});
