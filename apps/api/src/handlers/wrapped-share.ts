import { ORPCError } from "@orpc/server";
import { orgMiddleware, os } from "../middleware.js";
import {
	checkWrappedShareCreateRateLimit,
	checkWrappedShareLookupRateLimit,
} from "../rate-limit.js";
import {
	createWrappedShare,
	getPublicWrappedShare,
} from "../services/wrapped-share.service.js";

// Create is authenticated because only the signed-in owner of the current card
// should mint a new public share record.
const create = os.wrappedShare.create
	.use(orgMiddleware)
	.handler(async ({ context, input }) => {
		// Saturday only needs a simple authenticated backstop here. This keeps one
		// user from spamming share creation without introducing a bigger abuse
		// system before launch.
		checkWrappedShareCreateRateLimit(context.user.id);

		return createWrappedShare({
			organizationId: context.organizationId,
			snapshot: input.snapshot,
			userId: context.user.id,
		});
	});

// Public replay is intentionally anonymous. The only contract is the share id
// and the persisted public snapshot returned by the service layer.
const getPublic = os.wrappedShare.getPublic.handler(async ({ input }) => {
	// The service intentionally collapses "missing", "expired", and "unsupported
	// payload version" into the same null result so the public route can fail
	// closed without leaking implementation details.
	// Lookup rate limiting is keyed by share id for now. It is a minimal hot-link
	// guard, not a replacement for future edge or IP-based throttling.
	checkWrappedShareLookupRateLimit(input.shareId);

	const share = await getPublicWrappedShare(input.shareId);

	if (!share) {
		throw new ORPCError("NOT_FOUND", {
			message: "Wrapped share not found",
		});
	}

	return share;
});

// Keep the router surface tiny: one authenticated create, one anonymous read.
export const wrappedShareRouter = os.wrappedShare.router({
	create,
	getPublic,
});
