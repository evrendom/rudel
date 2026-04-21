import { ORPCError } from "@orpc/server";
import { orgMiddleware, os } from "../middleware.js";
import {
	createWrappedShare,
	getPublicWrappedShare,
} from "../services/wrapped-share.service.js";

const create = os.wrappedShare.create
	.use(orgMiddleware)
	.handler(async ({ context, input }) => {
		return createWrappedShare({
			organizationId: context.organizationId,
			snapshot: input.snapshot,
			userId: context.user.id,
		});
	});

const getPublic = os.wrappedShare.getPublic.handler(async ({ input }) => {
	const share = await getPublicWrappedShare(input.shareId);

	if (!share) {
		throw new ORPCError("NOT_FOUND", {
			message: "Wrapped share not found",
		});
	}

	return share;
});

export const wrappedShareRouter = os.wrappedShare.router({
	create,
	getPublic,
});
