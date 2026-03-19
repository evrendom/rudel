import { useLocation } from "react-router-dom";
import { useOptionalDateRange } from "@/contexts/DateRangeContext";
import { useOptionalOrganization } from "@/contexts/OrganizationContext";
import { authClient } from "@/lib/auth-client";
import {
	type AppPageName,
	captureAuthenticationActionTriggered,
	captureChartExportTriggered,
	captureDashboardDrilldownOpened,
	captureDashboardFilterChanged,
	captureDashboardNavigationClicked,
	captureOrganizationActionTriggered,
	captureUiUtilityUsed,
	type DashboardPageName,
	getAnalyticsPageName,
	isDashboardPageName,
} from "@/lib/product-analytics";

interface UseAnalyticsOptions {
	organizationId?: string | null;
	pageName?: AppPageName | null;
}

export function useDashboardAnalytics(options?: UseAnalyticsOptions) {
	const location = useLocation();
	const organization = useOptionalOrganization();
	const dateRange = useOptionalDateRange();
	const { data: session } = authClient.useSession();

	const userId =
		session?.user && "id" in session.user && typeof session.user.id === "string"
			? session.user.id
			: null;
	const pageName =
		options?.pageName ??
		(getAnalyticsPageName(location.pathname) as AppPageName | null);

	return {
		organizationId:
			options?.organizationId ?? organization?.activeOrg?.id ?? null,
		userId,
		pageName,
		dateRangeDays: dateRange?.calculateDays(),
		pathname: location.pathname,
	};
}

type AnalyticsOverrides = {
	dateRangeDays?: number;
	organizationId?: string | null;
	sourceComponent?: string;
	userId?: string | null;
};

type AnalyticsPayload = {
	page_name: AppPageName;
	organization_id?: string;
	user_id?: string;
	date_range_days?: number;
	source_component?: string;
};

type DashboardAnalyticsPayload = AnalyticsPayload & {
	page_name: DashboardPageName;
	organization_id: string;
	user_id: string;
};

function normalizeOptionalString(value: string | null | undefined) {
	if (!value) {
		return undefined;
	}

	return value;
}

export function useAnalyticsTracking(options?: UseAnalyticsOptions) {
	const analytics = useDashboardAnalytics(options);

	const buildBasePayload = (
		overrides?: AnalyticsOverrides,
	): AnalyticsPayload | null => {
		if (!analytics.pageName) {
			return null;
		}

		return {
			page_name: analytics.pageName,
			organization_id:
				normalizeOptionalString(overrides?.organizationId) ??
				normalizeOptionalString(analytics.organizationId),
			user_id:
				normalizeOptionalString(overrides?.userId) ??
				normalizeOptionalString(analytics.userId),
			date_range_days: overrides?.dateRangeDays ?? analytics.dateRangeDays,
			source_component: overrides?.sourceComponent,
		};
	};

	const buildDashboardPayload = (
		overrides?: AnalyticsOverrides,
	): DashboardAnalyticsPayload | null => {
		const basePayload = buildBasePayload(overrides);
		if (!basePayload) {
			return null;
		}

		if (!isDashboardPageName(basePayload.page_name)) {
			return null;
		}

		if (!basePayload.organization_id || !basePayload.user_id) {
			return null;
		}

		return {
			...basePayload,
			page_name: basePayload.page_name,
			organization_id: basePayload.organization_id,
			user_id: basePayload.user_id,
		};
	};

	const trackNavigation = (
		input: {
			navType: string;
			sourceComponent: string;
			targetPath?: string;
			targetType?: string;
			targetId?: string;
			toPageName?: AppPageName;
			rank?: number;
		} & AnalyticsOverrides,
	) => {
		const basePayload = buildBasePayload(input);
		if (!basePayload) {
			return;
		}

		captureDashboardNavigationClicked({
			...basePayload,
			nav_type: input.navType,
			target_path: input.targetPath,
			target_type: input.targetType,
			target_id: input.targetId,
			to_page_name: input.toPageName,
			rank: input.rank,
		});
	};

	const trackFilterChange = (
		input: {
			filterName: string;
			filterCategory: string;
			changeAction: string;
			sourceComponent: string;
			selectionCount?: number;
			valueKey?: string;
			affectedScope?: string;
		} & AnalyticsOverrides,
	) => {
		const dashboardPayload = buildDashboardPayload(input);
		if (!dashboardPayload) {
			return;
		}

		captureDashboardFilterChanged({
			...dashboardPayload,
			filter_name: input.filterName,
			filter_category: input.filterCategory,
			change_action: input.changeAction,
			selection_count: input.selectionCount,
			value_key: input.valueKey,
			affected_scope: input.affectedScope,
		});
	};

	const trackDrilldown = (
		input: {
			drilldownMethod: string;
			sourceComponent: string;
			targetType: string;
			targetPath?: string;
			targetId?: string;
			rank?: number;
		} & AnalyticsOverrides,
	) => {
		const dashboardPayload = buildDashboardPayload(input);
		if (!dashboardPayload) {
			return;
		}

		captureDashboardDrilldownOpened({
			...dashboardPayload,
			drilldown_method: input.drilldownMethod,
			target_type: input.targetType,
			target_path: input.targetPath,
			target_id: input.targetId,
			rank: input.rank,
		});
	};

	const trackChartExport = (
		input: {
			chartId: string;
			exportType: "copy_image" | "download_png" | "share_x";
			sourceComponent?: string;
			chartKind?: string;
			shareDestination?: string;
			visibleSeriesCount?: number;
		} & AnalyticsOverrides,
	) => {
		const dashboardPayload = buildDashboardPayload(input);
		if (!dashboardPayload) {
			return;
		}

		captureChartExportTriggered({
			...dashboardPayload,
			chart_id: input.chartId,
			export_type: input.exportType,
			chart_kind: input.chartKind,
			share_destination: input.shareDestination,
			visible_series_count: input.visibleSeriesCount,
		});
	};

	const trackOrganizationAction = (
		input: {
			actionName: string;
			targetType: string;
			sourceComponent: string;
			targetId?: string;
			targetRole?: string;
			provider?: string;
			result?: "started" | "succeeded" | "failed";
			errorCode?: string;
			httpStatus?: number;
		} & AnalyticsOverrides,
	) => {
		const basePayload = buildBasePayload(input);
		if (!basePayload) {
			return;
		}

		captureOrganizationActionTriggered({
			...basePayload,
			action_name: input.actionName,
			target_type: input.targetType,
			target_id: input.targetId,
			target_role: input.targetRole,
			provider: input.provider,
			result: input.result,
			error_code: input.errorCode,
			http_status: input.httpStatus,
		});
	};

	const trackAuthenticationAction = (
		input: {
			actionName: string;
			sourceComponent: string;
			authMethod?: string;
			entrypoint?: string;
			targetId?: string;
			result?: "started" | "succeeded" | "failed";
			errorCode?: string;
			httpStatus?: number;
		} & AnalyticsOverrides,
	) => {
		const basePayload = buildBasePayload(input);
		if (!basePayload) {
			return;
		}

		captureAuthenticationActionTriggered({
			...basePayload,
			action_name: input.actionName,
			auth_method: input.authMethod,
			entrypoint: input.entrypoint,
			target_id: input.targetId,
			result: input.result,
			error_code: input.errorCode,
			http_status: input.httpStatus,
		});
	};

	const trackUtility = (
		input: {
			utilityName: string;
			componentId: string;
			sourceComponent?: string;
			utilityState?: string;
		} & AnalyticsOverrides,
	) => {
		const basePayload = buildBasePayload(input);
		if (!basePayload) {
			return;
		}

		captureUiUtilityUsed({
			...basePayload,
			utility_name: input.utilityName,
			component_id: input.componentId,
			utility_state: input.utilityState,
		});
	};

	return {
		...analytics,
		trackAuthenticationAction,
		trackChartExport,
		trackDrilldown,
		trackFilterChange,
		trackNavigation,
		trackOrganizationAction,
		trackUtility,
	};
}
