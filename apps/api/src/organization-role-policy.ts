const ADMIN_ROLE = "admin";
const OWNER_ROLE = "owner";

export const ORGANIZATION_AUTH_PATHS = {
	addMember: "/api/auth/organization/add-member",
	inviteMember: "/api/auth/organization/invite-member",
	updateMemberRole: "/api/auth/organization/update-member-role",
	removeMember: "/api/auth/organization/remove-member",
	cancelInvitation: "/api/auth/organization/cancel-invitation",
} as const;

export const ONLY_OWNER_CAN_MANAGE_ADMIN_MESSAGE =
	"Only organization owners can manage admin access.";

export function isAdminAccessPath(pathname: string) {
	switch (pathname) {
		case ORGANIZATION_AUTH_PATHS.addMember:
		case ORGANIZATION_AUTH_PATHS.inviteMember:
		case ORGANIZATION_AUTH_PATHS.updateMemberRole:
		case ORGANIZATION_AUTH_PATHS.removeMember:
		case ORGANIZATION_AUTH_PATHS.cancelInvitation:
			return true;
		default:
			return false;
	}
}

export function getRoles(value: unknown): string[] {
	if (typeof value === "string") {
		return splitRoles(value);
	}

	if (!Array.isArray(value)) {
		return [];
	}

	return value.flatMap((item) => {
		if (typeof item !== "string") {
			return [];
		}

		return splitRoles(item);
	});
}

export function hasAdminRole(value: unknown) {
	return getRoles(value).includes(ADMIN_ROLE);
}

export function isOwnerRole(value: string | null | undefined) {
	if (!value) {
		return false;
	}

	return getRoles(value).includes(OWNER_ROLE);
}

export function getAdminAccessBlockMessage(input: {
	pathname: string;
	actorRole: string | null | undefined;
	requestedRole?: unknown;
	targetMemberRole?: string | null;
	targetInvitationRole?: string | null;
}) {
	if (isOwnerRole(input.actorRole)) {
		return null;
	}

	switch (input.pathname) {
		case ORGANIZATION_AUTH_PATHS.addMember:
		case ORGANIZATION_AUTH_PATHS.inviteMember:
			return hasAdminRole(input.requestedRole)
				? ONLY_OWNER_CAN_MANAGE_ADMIN_MESSAGE
				: null;
		case ORGANIZATION_AUTH_PATHS.updateMemberRole:
			if (hasAdminRole(input.requestedRole)) {
				return ONLY_OWNER_CAN_MANAGE_ADMIN_MESSAGE;
			}

			return hasAdminRole(input.targetMemberRole)
				? ONLY_OWNER_CAN_MANAGE_ADMIN_MESSAGE
				: null;
		case ORGANIZATION_AUTH_PATHS.removeMember:
			return hasAdminRole(input.targetMemberRole)
				? ONLY_OWNER_CAN_MANAGE_ADMIN_MESSAGE
				: null;
		case ORGANIZATION_AUTH_PATHS.cancelInvitation:
			return hasAdminRole(input.targetInvitationRole)
				? ONLY_OWNER_CAN_MANAGE_ADMIN_MESSAGE
				: null;
		default:
			return null;
	}
}

function splitRoles(value: string) {
	return value
		.split(",")
		.map((role) => role.trim())
		.filter(Boolean);
}
