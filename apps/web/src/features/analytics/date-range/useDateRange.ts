import { useSearchParams } from "react-router-dom";
import { useDateRange as useLegacyDateRange } from "@/contexts/DateRangeContext";
import { getInclusiveDateRangeDays } from "@/lib/analytics-date-range";

const STORAGE_KEY = "dateRange";

type DateRangeSource = "default" | "storage" | "url";

function readStoredDateRange() {
	if (typeof window === "undefined") {
		return null;
	}

	try {
		const stored = window.localStorage.getItem(STORAGE_KEY);

		return stored ? JSON.parse(stored) : null;
	} catch {
		return null;
	}
}

function getDateRangeSource(searchParams: URLSearchParams): DateRangeSource {
	if (searchParams.get("from") && searchParams.get("to")) {
		return "url";
	}

	const storedRange = readStoredDateRange();
	if (storedRange?.start && storedRange?.end) {
		return "storage";
	}

	return "default";
}

export function useDateRange() {
	const [searchParams] = useSearchParams();
	const { endDate, setEndDate, setStartDate, startDate } = useLegacyDateRange();

	return {
		state: {
			endDate,
			startDate,
		},
		actions: {
			setDateRange: (nextStartDate: string, nextEndDate: string) => {
				setStartDate(nextStartDate);
				setEndDate(nextEndDate);
			},
			setEndDate,
			setStartDate,
		},
		meta: {
			dayCount: getInclusiveDateRangeDays(startDate, endDate),
			source: getDateRangeSource(searchParams),
		},
	};
}
