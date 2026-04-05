import { useMemo } from "react";
import { useDateRange } from "@/features/analytics/date-range/useDateRange";
import {
	createDashboardMetrics,
	dashboardBreakdownGroups,
	dashboardComparisonNotes,
	dashboardTimeComposition,
	dashboardToolCards,
} from "@/features/dashboard/data/dashboard-static-data";

export function useDashboardPageData() {
	const { state } = useDateRange();
	const metrics = useMemo(
		() => createDashboardMetrics(state.endDate),
		[state.endDate],
	);

	return {
		endDate: state.endDate,
		metrics,
		breakdownGroups: dashboardBreakdownGroups,
		timeComposition: dashboardTimeComposition,
		comparisonNotes: dashboardComparisonNotes,
		toolCards: dashboardToolCards,
	};
}
