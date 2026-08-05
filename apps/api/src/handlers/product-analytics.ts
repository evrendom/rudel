import { PRODUCT_ANALYTICS_EVENTS } from "@rudel/api-routes";
import { captureApiProductAnalyticsEvent } from "../lib/product-analytics.js";
import { orgMiddleware, os } from "../middleware.js";

const dashboardViewed = os.productAnalytics.dashboardViewed
	.use(orgMiddleware)
	.handler(({ context, input }) => {
		captureApiProductAnalyticsEvent({
			distinctId: context.user.id,
			event: PRODUCT_ANALYTICS_EVENTS.DASHBOARD_VIEWED,
			payload: {
				...input,
				organization_id: context.organizationId,
				user_id: context.user.id,
			},
		});

		return { success: true as const };
	});

const dashboardFilterChanged = os.productAnalytics.dashboardFilterChanged
	.use(orgMiddleware)
	.handler(({ context, input }) => {
		captureApiProductAnalyticsEvent({
			distinctId: context.user.id,
			event: PRODUCT_ANALYTICS_EVENTS.DASHBOARD_FILTER_CHANGED,
			payload: {
				...input,
				organization_id: context.organizationId,
				user_id: context.user.id,
			},
		});

		return { success: true as const };
	});

const dashboardDrilldownOpened = os.productAnalytics.dashboardDrilldownOpened
	.use(orgMiddleware)
	.handler(({ context, input }) => {
		captureApiProductAnalyticsEvent({
			distinctId: context.user.id,
			event: PRODUCT_ANALYTICS_EVENTS.DASHBOARD_DRILLDOWN_OPENED,
			payload: {
				...input,
				organization_id: context.organizationId,
				user_id: context.user.id,
			},
		});

		return { success: true as const };
	});

export const productAnalyticsRouter = os.productAnalytics.router({
	dashboardViewed,
	dashboardFilterChanged,
	dashboardDrilldownOpened,
});
