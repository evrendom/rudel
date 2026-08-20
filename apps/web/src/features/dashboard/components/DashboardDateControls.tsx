"use client";

import { AnalyticsDateRangePicker } from "@/features/analytics/date-range/components/AnalyticsDateRangePicker";
import { useDateRange } from "@/features/analytics/date-range/useDateRange";
import { cn } from "@/lib/utils";

export function DashboardDateControls({
	className,
	sourceComponent = "dashboard_date_picker",
	variant = "default",
}: {
	className?: string;
	sourceComponent?: string;
	variant?: "default" | "linear";
}) {
	const { state, actions } = useDateRange();

	return (
		<AnalyticsDateRangePicker
			startDate={state.startDate}
			endDate={state.endDate}
			onDateRangeApply={actions.setDateRange}
			align="end"
			sourceComponent={sourceComponent}
			variant={variant}
			triggerClassName={cn(
				"dashboardy-action-button h-8 px-2.5 text-[13px] sm:h-8",
				className,
			)}
		/>
	);
}
