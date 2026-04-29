import { useLocation } from "react-router-dom";
import { useOptionalDateRange } from "@/features/analytics/date-range/useDateRange";
import { useOptionalOrganization } from "@/features/workspace/organization/useOrganization";
import { getWebAcquisitionAttribution } from "@/lib/acquisition-attribution";
import { authClient } from "@/lib/auth-client";
import {
	type AppPageName,
	captureAuthenticationActionTriggered,
	captureChartExportTriggered,
	captureDashboardDrilldownOpened,
	captureDashboardFilterChanged,
	captureDashboardLoadFailed,
	captureDashboardNavigationClicked,
	captureOrganizationActionTriggered,
	captureUiUtilityUsed,
	captureWrappedActivationCompleted,
	captureWrappedOnboardingStarted,
	captureWrappedProfileCompleted,
	captureWrappedReferredSignupCompleted,
	captureWrappedShareActionTriggered,
	captureWrappedShareCreated,
	captureWrappedShareCtaClicked,
	captureWrappedShareViewed,
	captureWrappedStoryStarted,
	type DashboardPageName,
	getAnalyticsPageName,
	isDashboardPageName,
} from "@/lib/product-analytics";

export interface UseAnalyticsOptions {
	organizationId?: string | null;
	pageName?: AppPageName | null;
}

type ProductAnalyticsActionResult = "started" | "succeeded" | "failed";

type WrappedGrowthLoopPhase =
	| "exposure"
	| "conversion"
	| "activation"
	| "production"
	| "distribution";

type WrappedGrowthLoopEntrySource =
	| "public_share"
	| "share_redirect"
	| "wrapped_team_card"
	| "direct";

type WrappedShareAction = "copy" | "download" | "share";
type WrappedShareDestination = "clipboard" | "download" | "x";

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

type WrappedGrowthLoopInput = {
	sourceComponent: string;
	entrySource: WrappedGrowthLoopEntrySource;
	sourceShareId?: string;
	shareId?: string;
	redirectTarget?: string;
	archetypeId?: string;
	publicPayloadVersion?: number;
	isAuthenticatedViewer?: boolean;
	isNewUser?: boolean;
	launchChannel?: string;
	referrerDomain?: string;
	resolvedEntryRoute?: string;
	activationState?: string;
	shareAction?: WrappedShareAction;
	shareDestination?: WrappedShareDestination;
	utmCampaign?: string;
	utmContent?: string;
	utmMedium?: string;
	utmSource?: string;
	utmTerm?: string;
} & AnalyticsOverrides;

type WrappedGrowthLoopPayload = AnalyticsPayload & {
	growth_loop: "wrapped_profile_wom";
	loop_phase: WrappedGrowthLoopPhase;
	entry_source: WrappedGrowthLoopEntrySource;
	source_share_id?: string;
	share_id?: string;
	redirect_target?: string;
	archetype_id?: string;
	public_payload_version?: number;
	is_authenticated_viewer?: boolean;
	is_new_user?: boolean;
	launch_channel?: string;
	referrer_domain?: string;
	resolved_entry_route?: string;
	activation_state?: string;
	share_action?: WrappedShareAction;
	share_destination?: WrappedShareDestination;
	utm_campaign?: string;
	utm_content?: string;
	utm_medium?: string;
	utm_source?: string;
	utm_term?: string;
};

const WRAPPED_GROWTH_LOOP_NAME = "wrapped_profile_wom";

function normalizeOptionalString(value: string | null | undefined) {
	if (!value) {
		return undefined;
	}

	return value;
}

export function useAnalyticsContext(options?: UseAnalyticsOptions) {
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
			options?.organizationId ?? organization?.state.activeOrg?.id ?? null,
		userId,
		pageName,
		dateRangeDays: dateRange?.meta.dayCount,
		pathname: location.pathname,
		wrappedAcquisition: getWebAcquisitionAttribution(location.search),
	};
}

export function useAnalyticsTracking(options?: UseAnalyticsOptions) {
	const analytics = useAnalyticsContext(options);

	function buildBasePayload(
		overrides?: AnalyticsOverrides,
	): AnalyticsPayload | null {
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
	}

	function buildDashboardPayload(
		overrides?: AnalyticsOverrides,
	): DashboardAnalyticsPayload | null {
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
	}

	function buildWrappedGrowthLoopPayload(
		input: WrappedGrowthLoopInput,
		loopPhase: WrappedGrowthLoopPhase,
	): WrappedGrowthLoopPayload | null {
		const payload = buildBasePayload(input);

		if (!payload) {
			return null;
		}

		return {
			...payload,
			growth_loop: WRAPPED_GROWTH_LOOP_NAME,
			loop_phase: loopPhase,
			entry_source: input.entrySource,
			source_share_id: input.sourceShareId,
			share_id: input.shareId,
			redirect_target: input.redirectTarget,
			archetype_id: input.archetypeId,
			public_payload_version: input.publicPayloadVersion,
			is_authenticated_viewer: input.isAuthenticatedViewer,
			is_new_user: input.isNewUser,
			launch_channel:
				input.launchChannel ?? analytics.wrappedAcquisition.launch_channel,
			referrer_domain:
				input.referrerDomain ?? analytics.wrappedAcquisition.referrer_domain,
			resolved_entry_route: input.resolvedEntryRoute,
			activation_state: input.activationState,
			share_action: input.shareAction,
			share_destination: input.shareDestination,
			utm_campaign:
				input.utmCampaign ?? analytics.wrappedAcquisition.utm_campaign,
			utm_content: input.utmContent ?? analytics.wrappedAcquisition.utm_content,
			utm_medium: input.utmMedium ?? analytics.wrappedAcquisition.utm_medium,
			utm_source: input.utmSource ?? analytics.wrappedAcquisition.utm_source,
			utm_term: input.utmTerm ?? analytics.wrappedAcquisition.utm_term,
		};
	}

	function trackNavigation(
		input: {
			navType: string;
			sourceComponent: string;
			targetPath?: string;
			targetType?: string;
			targetId?: string;
			toPageName?: AppPageName;
			rank?: number;
		} & AnalyticsOverrides,
	) {
		const payload = buildBasePayload(input);

		if (!payload) {
			return;
		}

		captureDashboardNavigationClicked({
			...payload,
			nav_type: input.navType,
			target_path: input.targetPath,
			target_type: input.targetType,
			target_id: input.targetId,
			to_page_name: input.toPageName,
			rank: input.rank,
		});
	}

	function trackDashboardLoadFailed(
		input: {
			queryName: string;
			errorCode: string;
			isBlocking: boolean;
			httpStatus?: number;
		} & AnalyticsOverrides,
	) {
		const payload = buildDashboardPayload(input);

		if (!payload || payload.date_range_days == null) {
			return;
		}

		captureDashboardLoadFailed({
			...payload,
			query_name: input.queryName,
			error_code: input.errorCode,
			date_range_days: payload.date_range_days,
			is_blocking: input.isBlocking,
			http_status: input.httpStatus,
		});
	}

	function trackFilterChange(
		input: {
			filterName: string;
			filterCategory: string;
			changeAction: string;
			sourceComponent: string;
			selectionCount?: number;
			valueKey?: string;
			affectedScope?: string;
		} & AnalyticsOverrides,
	) {
		const payload = buildDashboardPayload(input);

		if (!payload) {
			return;
		}

		captureDashboardFilterChanged({
			...payload,
			filter_name: input.filterName,
			filter_category: input.filterCategory,
			change_action: input.changeAction,
			selection_count: input.selectionCount,
			value_key: input.valueKey,
			affected_scope: input.affectedScope,
		});
	}

	function trackDrilldown(
		input: {
			drilldownMethod: string;
			sourceComponent: string;
			targetType: string;
			targetPath?: string;
			targetId?: string;
			rank?: number;
		} & AnalyticsOverrides,
	) {
		const payload = buildDashboardPayload(input);

		if (!payload) {
			return;
		}

		captureDashboardDrilldownOpened({
			...payload,
			drilldown_method: input.drilldownMethod,
			target_type: input.targetType,
			target_path: input.targetPath,
			target_id: input.targetId,
			rank: input.rank,
		});
	}

	function trackChartExport(
		input: {
			chartId: string;
			exportType: "copy_image" | "download_png" | "share_x";
			sourceComponent?: string;
			chartKind?: string;
			shareDestination?: string;
			visibleSeriesCount?: number;
		} & AnalyticsOverrides,
	) {
		const payload = buildDashboardPayload(input);

		if (!payload) {
			return;
		}

		captureChartExportTriggered({
			...payload,
			chart_id: input.chartId,
			export_type: input.exportType,
			chart_kind: input.chartKind,
			share_destination: input.shareDestination,
			visible_series_count: input.visibleSeriesCount,
		});
	}

	function trackAuthenticationAction(
		input: {
			actionName: string;
			sourceComponent: string;
			authMethod?: string;
			entrypoint?: string;
			targetId?: string;
			result?: ProductAnalyticsActionResult;
			errorCode?: string;
			httpStatus?: number;
		} & AnalyticsOverrides,
	) {
		const payload = buildBasePayload(input);

		if (!payload) {
			return;
		}

		captureAuthenticationActionTriggered({
			...payload,
			action_name: input.actionName,
			auth_method: input.authMethod,
			entrypoint: input.entrypoint,
			target_id: input.targetId,
			result: input.result,
			error_code: input.errorCode,
			http_status: input.httpStatus,
		});
	}

	function trackOrganizationAction(
		input: {
			actionName: string;
			targetType: string;
			sourceComponent: string;
			targetId?: string;
			targetRole?: string;
			provider?: string;
			result?: ProductAnalyticsActionResult;
			errorCode?: string;
			httpStatus?: number;
		} & AnalyticsOverrides,
	) {
		const payload = buildBasePayload(input);

		if (!payload) {
			return;
		}

		captureOrganizationActionTriggered({
			...payload,
			action_name: input.actionName,
			target_type: input.targetType,
			target_id: input.targetId,
			target_role: input.targetRole,
			provider: input.provider,
			result: input.result,
			error_code: input.errorCode,
			http_status: input.httpStatus,
		});
	}

	function trackUtility(
		input: {
			utilityName: string;
			componentId: string;
			sourceComponent?: string;
			utilityState?: string;
		} & AnalyticsOverrides,
	) {
		const payload = buildBasePayload(input);

		if (!payload) {
			return;
		}

		captureUiUtilityUsed({
			...payload,
			utility_name: input.utilityName,
			component_id: input.componentId,
			utility_state: input.utilityState,
		});
	}

	function trackUtilityUsed(
		input: {
			utilityName: string;
			sourceComponent: string;
			targetId?: string;
			shareId?: string;
			entrySource?: string;
			redirectTarget?: string;
			archetypeId?: string;
			publicPayloadVersion?: number;
			isAuthenticatedViewer?: boolean;
			isNewUser?: boolean;
			resolvedEntryRoute?: string;
			utilityState?: string;
		} & AnalyticsOverrides,
	) {
		const payload = buildBasePayload(input);

		if (!payload) {
			return;
		}

		captureUiUtilityUsed({
			...payload,
			utility_name: input.utilityName,
			component_id: input.sourceComponent,
			target_id: input.targetId,
			share_id: input.shareId,
			entry_source: input.entrySource,
			redirect_target: input.redirectTarget,
			archetype_id: input.archetypeId,
			public_payload_version: input.publicPayloadVersion,
			is_authenticated_viewer: input.isAuthenticatedViewer,
			is_new_user: input.isNewUser,
			resolved_entry_route: input.resolvedEntryRoute,
			utility_state: input.utilityState,
		});
	}

	function trackWrappedShareViewed(input: WrappedGrowthLoopInput) {
		const payload = buildWrappedGrowthLoopPayload(input, "exposure");

		if (!payload) {
			return;
		}

		captureWrappedShareViewed(payload);
	}

	function trackWrappedShareCtaClicked(input: WrappedGrowthLoopInput) {
		const payload = buildWrappedGrowthLoopPayload(input, "conversion");

		if (!payload) {
			return;
		}

		captureWrappedShareCtaClicked(payload);
	}

	function trackWrappedOnboardingStarted(input: WrappedGrowthLoopInput) {
		const payload = buildWrappedGrowthLoopPayload(input, "conversion");

		if (!payload) {
			return;
		}

		captureWrappedOnboardingStarted(payload);
	}

	function trackWrappedReferredSignupCompleted(input: WrappedGrowthLoopInput) {
		const payload = buildWrappedGrowthLoopPayload(input, "conversion");

		if (!payload) {
			return;
		}

		captureWrappedReferredSignupCompleted(payload);
	}

	function trackWrappedProfileCompleted(input: WrappedGrowthLoopInput) {
		const payload = buildWrappedGrowthLoopPayload(input, "activation");

		if (!payload) {
			return;
		}

		captureWrappedProfileCompleted(payload);
	}

	function trackWrappedActivationCompleted(input: WrappedGrowthLoopInput) {
		const payload = buildWrappedGrowthLoopPayload(input, "activation");

		if (!payload) {
			return;
		}

		captureWrappedActivationCompleted(payload);
	}

	function trackWrappedStoryStarted(input: WrappedGrowthLoopInput) {
		const payload = buildWrappedGrowthLoopPayload(input, "production");

		if (!payload) {
			return;
		}

		captureWrappedStoryStarted(payload);
	}

	function trackWrappedShareCreated(input: WrappedGrowthLoopInput) {
		const payload = buildWrappedGrowthLoopPayload(input, "production");

		if (!payload) {
			return;
		}

		captureWrappedShareCreated(payload);
	}

	function trackWrappedShareActionTriggered(input: WrappedGrowthLoopInput) {
		const payload = buildWrappedGrowthLoopPayload(input, "distribution");

		if (!payload) {
			return;
		}

		captureWrappedShareActionTriggered(payload);
	}

	return {
		...analytics,
		trackAuthenticationAction,
		trackChartExport,
		trackDashboardLoadFailed,
		trackDrilldown,
		trackFilterChange,
		trackNavigation,
		trackOrganizationAction,
		trackUtility,
		trackUtilityUsed,
		trackWrappedActivationCompleted,
		trackWrappedOnboardingStarted,
		trackWrappedProfileCompleted,
		trackWrappedReferredSignupCompleted,
		trackWrappedShareActionTriggered,
		trackWrappedShareCreated,
		trackWrappedShareCtaClicked,
		trackWrappedShareViewed,
		trackWrappedStoryStarted,
	};
}
