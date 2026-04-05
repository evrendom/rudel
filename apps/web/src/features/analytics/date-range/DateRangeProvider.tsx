import { createContext, type ReactNode, useContext } from "react";
import { useSearchParams } from "react-router-dom";
import { getInclusiveDateRangeDays } from "@/lib/analytics-date-range";
import type {
	DateRangeContextValue,
	DateRangeSource,
} from "@/features/analytics/date-range/types";

type StoredDateRange = {
	start: string;
	end: string;
};

const DateRangeContext = createContext<DateRangeContextValue | undefined>(
	undefined,
);

const STORAGE_KEY = "dateRange";

function getDefaultDateRange(): StoredDateRange {
	const end = new Date();
	const start = new Date();
	start.setDate(start.getDate() - 7);
	return {
		start: start.toISOString().split("T")[0],
		end: end.toISOString().split("T")[0],
	};
}

function readDateRangeFromSearchParams(
	searchParams: URLSearchParams,
): StoredDateRange | null {
	const fromParam = searchParams.get("from");
	const toParam = searchParams.get("to");

	if (fromParam && toParam) {
		return { start: fromParam, end: toParam };
	}

	return null;
}

function readStoredDateRange(): StoredDateRange | null {
	if (typeof window === "undefined") {
		return null;
	}

	try {
		const stored = window.localStorage.getItem(STORAGE_KEY);
		if (stored) {
			const parsed = JSON.parse(stored) as Partial<StoredDateRange>;
			if (parsed.start && parsed.end) {
				return {
					start: parsed.start,
					end: parsed.end,
				};
			}
		}
	} catch {
		// Ignore localStorage errors
	}

	return null;
}

function resolveDateRange(searchParams: URLSearchParams): {
	dateRange: StoredDateRange;
	source: DateRangeSource;
} {
	const searchDateRange = readDateRangeFromSearchParams(searchParams);
	if (searchDateRange) {
		return { dateRange: searchDateRange, source: "url" };
	}

	const storedDateRange = readStoredDateRange();
	if (storedDateRange) {
		return { dateRange: storedDateRange, source: "storage" };
	}

	return { dateRange: getDefaultDateRange(), source: "default" };
}

function writeStoredDateRange(dateRange: StoredDateRange) {
	if (typeof window === "undefined") {
		return;
	}

	try {
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify(dateRange));
	} catch {
		// Ignore localStorage errors
	}
}

export function DateRangeProvider({ children }: { children: ReactNode }) {
	const [searchParams, setSearchParams] = useSearchParams();
	const { dateRange, source } = resolveDateRange(searchParams);

	const updateDateRange = (
		updater: (currentDateRange: StoredDateRange) => StoredDateRange,
	) => {
		setSearchParams(
			(prev) => {
				const { dateRange: currentDateRange } = resolveDateRange(prev);
				const nextDateRange = updater(currentDateRange);
				const nextSearchParams = new URLSearchParams(prev);

				nextSearchParams.set("from", nextDateRange.start);
				nextSearchParams.set("to", nextDateRange.end);
				writeStoredDateRange(nextDateRange);

				return nextSearchParams;
			},
			{ replace: true },
		);
	};

	const contextValue: DateRangeContextValue = {
		state: {
			startDate: dateRange.start,
			endDate: dateRange.end,
		},
		actions: {
			setStartDate: (date: string) => {
				updateDateRange((currentDateRange) => ({
					...currentDateRange,
					start: date,
				}));
			},
			setEndDate: (date: string) => {
				updateDateRange((currentDateRange) => ({
					...currentDateRange,
					end: date,
				}));
			},
			setDateRange: (startDate: string, endDate: string) => {
				updateDateRange(() => ({
					start: startDate,
					end: endDate,
				}));
			},
		},
		meta: {
			dayCount: getInclusiveDateRangeDays(dateRange.start, dateRange.end),
			source,
		},
	};

	return (
		<DateRangeContext.Provider value={contextValue}>
			{children}
		</DateRangeContext.Provider>
	);
}

export function useDateRange() {
	const context = useOptionalDateRange();
	if (context === undefined) {
		throw new Error("useDateRange must be used within a DateRangeProvider");
	}
	return context;
}

export function useOptionalDateRange() {
	return useContext(DateRangeContext);
}
