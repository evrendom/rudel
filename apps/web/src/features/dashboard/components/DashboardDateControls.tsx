import { DatePicker } from "@/components/analytics/DatePicker";
import { useDateRange } from "@/contexts/DateRangeContext";

export function DashboardDateControls() {
	const { endDate, setEndDate, setStartDate, startDate } = useDateRange();

	return (
		<DatePicker
			startDate={startDate}
			endDate={endDate}
			onStartDateChange={setStartDate}
			onEndDateChange={setEndDate}
		/>
	);
}
