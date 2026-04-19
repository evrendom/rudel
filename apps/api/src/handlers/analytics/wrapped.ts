import { orgMiddleware, os } from "../../middleware.js";
import { getWrappedV1Data } from "../../services/wrapped.service.js";

const v1 = os.analytics.wrapped.v1
	.use(orgMiddleware)
	.handler(async ({ context }) => {
		return getWrappedV1Data(context.organizationId, context.user.id);
	});

export const wrappedRouter = os.analytics.wrapped.router({
	v1,
});
