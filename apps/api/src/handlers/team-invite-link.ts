import { ORPCError } from "@orpc/server";
import { getFrontendOrigin } from "../frontend-origin.js";
import { authMiddleware, os } from "../middleware.js";
import {
	acceptTeamInviteLink,
	getTeamInviteLink,
} from "../services/team-invite-link.service.js";

const get = os.teamInviteLink.get
	.use(authMiddleware)
	.handler(async ({ context, input }) => {
		const link = await getTeamInviteLink({
			organizationId: input.organizationId,
			userId: context.user.id,
		});

		if (!link) {
			throw new ORPCError("FORBIDDEN", {
				message: "Only organization owners and admins can create team links",
			});
		}

		return {
			invite_url: buildTeamInviteUrl(link.token),
			organization_id: link.organizationId,
			organization_name: link.organizationName,
			token: link.token,
		};
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
	get,
});

function buildTeamInviteUrl(token: string) {
	return `${getFrontendOrigin()}/team/invite/${encodeURIComponent(token)}`;
}
