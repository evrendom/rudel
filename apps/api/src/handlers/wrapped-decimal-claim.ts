import { authMiddleware, os } from "../middleware.js";
import { checkWrappedDecimalClaimRedeemRateLimit } from "../rate-limit.js";
import {
	getDecimalClaimEntitlement,
	redeemDecimalClaim,
} from "../services/wrapped-decimal-claim.service.js";

const redeem = os.wrappedDecimalClaim.redeem
	.use(authMiddleware)
	.handler(async ({ context, input }) => {
		checkWrappedDecimalClaimRedeemRateLimit(context.user.id);

		return redeemDecimalClaim({
			token: input.token,
			userId: context.user.id,
		});
	});

const getMine = os.wrappedDecimalClaim.getMine
	.use(authMiddleware)
	.handler(({ context }) => getDecimalClaimEntitlement(context.user.id));

export const wrappedDecimalClaimRouter = os.wrappedDecimalClaim.router({
	redeem,
	getMine,
});
