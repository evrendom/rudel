import { describe, expect, test } from "bun:test";
import {
	PRODUCT_ANALYTICS_EVENTS,
	parseProductAnalyticsEvent,
} from "../product-analytics.js";

describe("server-owned dashboard product analytics", () => {
	test("accepts Dashboard Viewed from the API without browser metadata", () => {
		const payload = {
			date_range_days: 30,
			environment: "production",
			event_version: 1,
			has_data: true,
			insight_count: null,
			organization_id: "org-1",
			page_name: "overview",
			surface: "api",
			user_id: "user-1",
		} as const;

		expect(
			parseProductAnalyticsEvent(
				PRODUCT_ANALYTICS_EVENTS.DASHBOARD_VIEWED,
				payload,
			),
		).toEqual(payload);
	});

	test("accepts Dashboard Filter Changed from the API", () => {
		const payload = {
			affected_scope: "page",
			change_action: "preset",
			date_range_days: 30,
			environment: "production",
			event_version: 1,
			filter_category: "date",
			filter_name: "date_range",
			organization_id: "org-1",
			page_name: "overview",
			source_component: "analytics_date_range_picker",
			surface: "api",
			user_id: "user-1",
			value_key: "last_30_days",
		} as const;

		expect(
			parseProductAnalyticsEvent(
				PRODUCT_ANALYTICS_EVENTS.DASHBOARD_FILTER_CHANGED,
				payload,
			),
		).toEqual(payload);
	});

	test("accepts Dashboard Drilldown Opened from the API", () => {
		const payload = {
			date_range_days: 30,
			drilldown_method: "table_row",
			environment: "production",
			event_version: 1,
			organization_id: "org-1",
			page_name: "sessions",
			source_component: "sessions_table",
			surface: "api",
			target_id: "session-1",
			target_type: "session",
			user_id: "user-1",
		} as const;

		expect(
			parseProductAnalyticsEvent(
				PRODUCT_ANALYTICS_EVENTS.DASHBOARD_DRILLDOWN_OPENED,
				payload,
			),
		).toEqual(payload);
	});
});
