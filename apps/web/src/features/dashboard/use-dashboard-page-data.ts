import { useMemo } from "react";
import { useAnalyticsQuery } from "@/features/analytics/queries/useAnalyticsQuery";
import { useDateRange } from "@/features/analytics/date-range/useDateRange";
import { mergeDashboardSnapshotWithRoi } from "@/features/dashboard/data/dashboard-roi-adapter";
import {
	createDashboardMetrics,
	createDashboardOutputSnapshot,
} from "@/features/dashboard/data/dashboard-static-data";
import { orpc } from "@/lib/orpc";

export function useDashboardPageData() {
	const { state } = useDateRange();
	const { data: roiDashboard } = useAnalyticsQuery(
		orpc.analytics.roi.dashboard.queryOptions({
			input: {
				startDate: state.startDate,
				endDate: state.endDate,
			},
		}),
	);
	const metrics = useMemo(
		() => createDashboardMetrics(state.startDate, state.endDate),
		[state.startDate, state.endDate],
	);
	const baseSnapshot = useMemo(
		() => createDashboardOutputSnapshot(state.startDate, state.endDate),
		[state.startDate, state.endDate],
	);
	const snapshot = useMemo(
		() => mergeDashboardSnapshotWithRoi(baseSnapshot, roiDashboard),
		[baseSnapshot, roiDashboard],
	);

	return {
		endDate: state.endDate,
		metrics,
		snapshot,
	};
}
