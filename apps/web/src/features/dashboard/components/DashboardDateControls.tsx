"use client";

import { AnalyticsDateRangePicker } from "@/features/analytics/date-range/components/AnalyticsDateRangePicker";
import { useDateRange } from "@/features/analytics/date-range/useDateRange";
import { cn } from "@/lib/utils";

export function DashboardDateControls({ className }: { className?: string }) {
	const { state, actions } = useDateRange();

	return (
		<AnalyticsDateRangePicker
			startDate={state.startDate}
			endDate={state.endDate}
			onDateRangeApply={actions.setDateRange}
			align="end"
			sourceComponent="dashboard_date_picker"
			triggerClassName={cn(
				"dashboardy-action-button h-8 px-2.5 text-[13px] sm:h-8",
				className,
			)}
		/>
	);
}
