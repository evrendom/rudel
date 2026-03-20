import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
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

	useEffect(() => {
		const dates = getInitialDates(searchParams);
		setStartDateInternal(dates.start);
		setEndDateInternal(dates.end);
		setIsInitialized(true);
	}, [searchParams]);

	useEffect(() => {
		if (!isInitialized) return;

		try {
			localStorage.setItem(
				STORAGE_KEY,
				JSON.stringify({ start: startDate, end: endDate }),
			);
		} catch {
			// Ignore localStorage errors
		}

		setSearchParams(
			(prev) => {
				prev.set("from", startDate);
				prev.set("to", endDate);
				return prev;
			},
			{ replace: true },
		);
	}, [startDate, endDate, isInitialized, setSearchParams]);

	const setStartDate = (date: string) => {
		setStartDateInternal(date);
	};

	const setEndDate = (date: string) => {
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
	const context = useOptionalDateRange();
	if (context === undefined) {
		throw new Error("useDateRange must be used within a DateRangeProvider");
	}
	return context;
}

export function useOptionalDateRange() {
	return useContext(DateRangeContext);
}
