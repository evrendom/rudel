import { useLocation } from "react-router-dom";
import { useOptionalDateRange } from "@/contexts/DateRangeContext";
import { useOptionalOrganization } from "@/contexts/OrganizationContext";
import { authClient } from "@/lib/auth-client";
import {
	type AppPageName,
	captureUiControlUsed,
	getAnalyticsPageName,
	type UiControlType,
	type UiInteractionType,
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

export function useUiControlTracking(options?: UseAnalyticsOptions) {
	const analytics = useDashboardAnalytics(options);

	const trackUiControl = (input: {
		controlName: string;
		controlType: UiControlType;
		interactionType: UiInteractionType;
		dateRangeDays?: number;
		organizationId?: string;
		targetPath?: string;
		userId?: string;
		value?: boolean | number | string;
	}) => {
		if (!analytics.pageName) {
			return;
		}

		captureUiControlUsed({
			page_name: analytics.pageName,
			control_name: input.controlName,
			control_type: input.controlType,
			interaction_type: input.interactionType,
			organization_id:
				input.organizationId ?? analytics.organizationId ?? undefined,
			user_id: input.userId ?? analytics.userId ?? undefined,
			date_range_days: input.dateRangeDays ?? analytics.dateRangeDays,
			target_path: input.targetPath,
			value: input.value,
		});
	};

	return {
		...analytics,
		trackUiControl,
	};
}
