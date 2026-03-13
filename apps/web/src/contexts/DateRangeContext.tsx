import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useRef,
	useState,
} from "react";
import { useSearchParams } from "react-router-dom";

interface DateRangeContextType {
	startDate: string;
	endDate: string;
	setStartDate: (date: string) => void;
	setEndDate: (date: string) => void;
	calculateDays: () => number;
}

const DateRangeContext = createContext<DateRangeContextType | undefined>(
	undefined,
);

const STORAGE_KEY = "dateRange";

const getDefaultDates = () => {
	const end = new Date();
	const start = new Date();
	start.setDate(start.getDate() - 7);
	return {
		start: start.toISOString().split("T")[0],
		end: end.toISOString().split("T")[0],
	};
};

const getInitialDates = (searchParams: URLSearchParams) => {
	const fromParam = searchParams.get("from");
	const toParam = searchParams.get("to");
	if (fromParam && toParam) {
		return { start: fromParam, end: toParam };
	}

	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored) {
			const parsed = JSON.parse(stored);
			if (parsed.start && parsed.end) {
				return parsed;
			}
		}
	} catch {
		// Ignore localStorage errors
	}

	return getDefaultDates();
};

export function DateRangeProvider({ children }: { children: ReactNode }) {
	const [searchParams, setSearchParams] = useSearchParams();

	const initialDates = getInitialDates(searchParams);
	const [startDate, setStartDateInternal] = useState(initialDates.start);
	const [endDate, setEndDateInternal] = useState(initialDates.end);
	const [isInitialized, setIsInitialized] = useState(false);
	// Track whether the user has explicitly changed dates (not just syncing from URL)
	const userChangedDates = useRef(false);

	useEffect(() => {
		const dates = getInitialDates(searchParams);
		setStartDateInternal(dates.start);
		setEndDateInternal(dates.end);
		setIsInitialized(true);
	}, [searchParams]);

	useEffect(() => {
		if (!isInitialized) return;
		// Only update URL when user explicitly changed dates via setStartDate/setEndDate
		// This prevents URL updates during back navigation (when state was synced from URL)
		if (!userChangedDates.current) return;

		// Reset the flag after we've handled the user's change
		userChangedDates.current = false;

		try {
			localStorage.setItem(
				STORAGE_KEY,
				JSON.stringify({ start: startDate, end: endDate }),
			);
		} catch {
			// Ignore localStorage errors
		}

		// Only update URL if the params actually differ from current state
		// This avoids unnecessary history changes
		const currentFrom = searchParams.get("from");
		const currentTo = searchParams.get("to");
		if (currentFrom === startDate && currentTo === endDate) {
			return;
		}

		setSearchParams(
			(prev) => {
				prev.set("from", startDate);
				prev.set("to", endDate);
				return prev;
			},
			{ replace: true },
		);
	}, [startDate, endDate, isInitialized, setSearchParams, searchParams]);

	const setStartDate = (date: string) => {
		userChangedDates.current = true;
		setStartDateInternal(date);
	};

	const setEndDate = (date: string) => {
		userChangedDates.current = true;
		setEndDateInternal(date);
	};

	const calculateDays = () => {
		const startTime = new Date(startDate).getTime();
		const endTime = new Date(endDate).getTime();
		return Math.ceil((endTime - startTime) / (1000 * 60 * 60 * 24));
	};

	return (
		<DateRangeContext.Provider
			value={{
				startDate,
				endDate,
				setStartDate,
				setEndDate,
				calculateDays,
			}}
		>
			{children}
		</DateRangeContext.Provider>
	);
}

export function useDateRange() {
	const context = useContext(DateRangeContext);
	if (context === undefined) {
		throw new Error("useDateRange must be used within a DateRangeProvider");
	}
	return context;
}
