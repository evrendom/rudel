import { ORPCError } from "@orpc/server";
import { getFrontendOrigin } from "../frontend-origin.js";
import { authMiddleware, os } from "../middleware.js";
import {
	acceptTeamInviteLink,
	createTeamInviteLink,
	revokeTeamInviteLink,
} from "../services/team-invite-link.service.js";

const create = os.teamInviteLink.create
	.use(authMiddleware)
	.handler(async ({ context, input }) => {
		const link = await createTeamInviteLink({
			organizationId: input.organizationId,
			userId: context.user.id,
		});

		if (!link) {
			throw new ORPCError("FORBIDDEN", {
				message: "Only organization owners and admins can create team links",
			});
		}

		return {
			expires_at: link.expiresAt,
			invite_url: buildTeamInviteUrl(link.token),
			organization_id: link.organizationId,
			organization_name: link.organizationName,
		};
	});

const revoke = os.teamInviteLink.revoke
	.use(authMiddleware)
	.handler(async ({ context, input }) => {
		const revoked = await revokeTeamInviteLink({
			organizationId: input.organizationId,
			userId: context.user.id,
		});

		if (!revoked) {
			throw new ORPCError("FORBIDDEN", {
				message: "Only organization owners and admins can revoke team links",
			});
		}

		return { success: true as const };
	});

const accept = os.teamInviteLink.accept
	.use(authMiddleware)
	.handler(async ({ context, input }) => {
		const result = await acceptTeamInviteLink({
			token: input.token,
			userId: context.user.id,
		});

		if (result.status === "missing") {
			throw new ORPCError("NOT_FOUND", {
				message: "Team invite link is invalid",
			});
		}

		return {
			organization_id: result.organizationId,
			organization_name: result.organizationName,
			status: result.status,
		};
	});

export const teamInviteLinkRouter = os.teamInviteLink.router({
	accept,
	create,
	revoke,
});

function buildTeamInviteUrl(token: string) {
	return `${getFrontendOrigin()}/team/invite/${encodeURIComponent(token)}`;
}
