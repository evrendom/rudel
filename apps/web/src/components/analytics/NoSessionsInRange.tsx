import { CalendarX } from "lucide-react";
import { useDateRange } from "@/contexts/DateRangeContext";
import { useAnalyticsTracking } from "@/hooks/useDashboardAnalytics";
import { AnalyticsCard } from "./AnalyticsCard";

export function NoSessionsInRange() {
	const { setStartDate, setEndDate } = useDateRange();
	const { trackFilterChange } = useAnalyticsTracking();

	const handleViewAllTime = () => {
		trackFilterChange({
			filterName: "date_range",
			filterCategory: "date",
			changeAction: "expand_range",
			sourceComponent: "no_sessions_in_range",
			valueKey: "all_time",
			affectedScope: "page",
		});
		setStartDate("2024-01-01");
		setEndDate(new Date().toISOString().split("T")[0]);
	};

	return (
		<AnalyticsCard className="mt-4">
			<div className="flex flex-col items-center justify-center py-20 px-4 text-center">
				<div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-6">
					<CalendarX className="w-8 h-8 text-muted-foreground" />
				</div>
				<h3 className="text-lg font-semibold text-foreground mb-3">
					No sessions in this time range
				</h3>
				<p className="text-sm text-muted-foreground max-w-lg mb-6">
					There are no sessions matching the selected dates. Try expanding the
					date range or view all sessions.
				</p>
				<button
					type="button"
					onClick={handleViewAllTime}
					className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
				>
					View all time
				</button>
			</div>
		</AnalyticsCard>
	);
}
