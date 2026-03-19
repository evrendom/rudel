import { useEffect, useRef } from "react";
import { useDateRange } from "@/contexts/DateRangeContext";
import {
	captureDashboardViewed,
	isDashboardPageName,
} from "@/lib/product-analytics";
import { useDashboardAnalytics } from "./useDashboardAnalytics";

export function useTrackDashboardView(options: {
	isLoading: boolean;
	isError?: boolean;
	hasData: boolean;
	insightCount?: number;
}) {
	const { startDate, endDate, calculateDays } = useDateRange();
	const { organizationId, userId, pageName } = useDashboardAnalytics();
	const viewedRangeKeyRef = useRef<string | null>(null);
	const dateRangeDays = calculateDays();

	useEffect(() => {
		if (
			!organizationId ||
			!userId ||
			!isDashboardPageName(pageName) ||
			options.isLoading ||
			options.isError
		) {
			return;
		}

		const viewedRangeKey = `${organizationId}:${pageName}:${startDate}:${endDate}`;
		if (viewedRangeKeyRef.current === viewedRangeKey) {
			return;
		}

		viewedRangeKeyRef.current = viewedRangeKey;
		captureDashboardViewed({
			organization_id: organizationId,
			user_id: userId,
			page_name: pageName,
			has_data: options.hasData,
			date_range_days: dateRangeDays,
			insight_count: options.insightCount ?? 0,
		});
	}, [
		dateRangeDays,
		endDate,
		options.hasData,
		options.insightCount,
		options.isError,
		options.isLoading,
		organizationId,
		pageName,
		startDate,
		userId,
	]);
}
