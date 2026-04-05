import { orgMiddleware, os } from "../../middleware.js";
import { getCostsDashboard } from "../../services/costs.service.js";

const dashboard = os.analytics.costs.dashboard
	.use(orgMiddleware)
	.handler(async ({ context }) => {
		return getCostsDashboard(context.organizationId);
	});

export const costsRouter = os.analytics.costs.router({
	dashboard,
});
