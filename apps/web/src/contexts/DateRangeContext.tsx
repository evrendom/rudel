import type { ReactNode } from "react";
import {
	DateRangeProvider as AnalyticsDateRangeProvider,
	useOptionalDateRange as useOptionalAnalyticsDateRange,
} from "@/features/analytics/date-range/DateRangeProvider";

interface DateRangeContextType {
	startDate: string;
	endDate: string;
	setStartDate: (date: string) => void;
	setEndDate: (date: string) => void;
	calculateDays: () => number;
}

function toLegacyDateRangeContext(
	context: ReturnType<typeof useOptionalAnalyticsDateRange>,
): DateRangeContextType | undefined {
	if (context === undefined) {
		return undefined;
	}

	return {
		startDate: context.state.startDate,
		endDate: context.state.endDate,
		setStartDate: context.actions.setStartDate,
		setEndDate: context.actions.setEndDate,
		calculateDays: () => context.meta.dayCount,
	};
}

export function DateRangeProvider({ children }: { children: ReactNode }) {
	return <AnalyticsDateRangeProvider>{children}</AnalyticsDateRangeProvider>;
}

export function useDateRange() {
	const context = useOptionalDateRange();
	if (context === undefined) {
		throw new Error("useDateRange must be used within a DateRangeProvider");
	}
	return context;
}

export function useOptionalDateRange() {
	return toLegacyDateRangeContext(useOptionalAnalyticsDateRange());
}
