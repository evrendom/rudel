import { ORPCError } from "@orpc/server";

type SessionDetailAccessContext = {
	isOrgAdmin: boolean;
	requesterUserId: string;
};

export function requireSessionDetailOwnerAccess(
	ownerId: string | null | undefined,
	context: SessionDetailAccessContext,
) {
	if (!ownerId) {
		throw new ORPCError("NOT_FOUND");
	}
	if (!context.isOrgAdmin && ownerId !== context.requesterUserId) {
		throw new ORPCError("FORBIDDEN", {
			message: "You can only view your own sessions",
		});
	}

	return ownerId;
}
