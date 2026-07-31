import { authMiddleware, os } from "../middleware.js";
import { createChatwootIdentity } from "../services/chatwoot-identity.service.js";

const identity = os.chatwoot.identity
	.use(authMiddleware)
	.handler(({ context }) => {
		return createChatwootIdentity({
			identifier: context.user.id,
			secret: process.env.CHATWOOT_IDENTITY_VERIFICATION_SECRET,
		});
	});

export const chatwootRouter = os.chatwoot.router({
	identity,
});
