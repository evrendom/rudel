import { useMemo } from "react";
import { ToggleGroup, ToggleGroupItem } from "@/app/ui/toggle-group";
import { useDateRange } from "@/features/analytics/date-range/useDateRange";
import { useAnalyticsTracking } from "@/features/analytics/tracking/useAnalyticsTracking";
import {
	resolveActiveSessionDateRangeOptionId,
	SESSION_DATE_RANGE_OPTIONS,
} from "@/features/sessions/session-date-ranges";

export function SessionsDateRangeControls() {
	const { actions, state } = useDateRange();
	const { trackFilterChange } = useAnalyticsTracking();

	const options = useMemo(() => {
		const today = new Date();

		return SESSION_DATE_RANGE_OPTIONS.map((option) => ({
			...option,
			...option.resolveRange(today),
		}));
	}, []);
	const activeOptionId = resolveActiveSessionDateRangeOptionId({
		endDate: state.endDate,
		startDate: state.startDate,
	});

	return (
		<ToggleGroup
			aria-label="Sessions date range"
			className="dashboardy-toggle-group self-start"
			size="sm"
			spacing={0}
			value={activeOptionId ? [activeOptionId] : []}
			variant="outline"
			onValueChange={(nextValue) => {
				const nextOptionId = nextValue[0];

				if (!nextOptionId) {
					return;
				}

				const nextOption = options.find((option) => option.id === nextOptionId);

				if (!nextOption) {
					return;
				}

				trackFilterChange({
					filterName: "sessions_date_range",
					filterCategory: "time",
					changeAction: "set",
					sourceComponent: "sessions_date_range_buttons",
					valueKey: nextOption.id,
					affectedScope: "page",
				});
				actions.setDateRange(nextOption.startDate, nextOption.endDate);
			}}
		>
			{options.map((option) => (
				<ToggleGroupItem
					key={option.id}
					value={option.id}
					className="dashboardy-toggle-item"
				>
					{option.label}
				</ToggleGroupItem>
			))}
		</ToggleGroup>
	);
}
