import {
	differenceInCalendarDays,
	eachDayOfInterval,
	format,
	isValid,
	parseISO,
	subDays,
} from "date-fns";

export const MAX_ANALYTICS_DAYS = 365;

export function getInclusiveDateRangeDays(startDate: string, endDate: string) {
	const range = parseDateRange(startDate, endDate);

	if (!range) {
		return 1;
	}

	return differenceInCalendarDays(range.end, range.start) + 1;
}

export function isAnalyticsRangeTooLarge(days: number) {
	return days > MAX_ANALYTICS_DAYS;
}

export function normalizeAnalyticsDateRange(
	startDate: string,
	endDate: string,
) {
	const range = parseDateRange(startDate, endDate);

	if (!range) {
		return null;
	}

	const earliestSupportedDate = subDays(range.end, MAX_ANALYTICS_DAYS - 1);
	const normalizedStart =
		range.start < earliestSupportedDate ? earliestSupportedDate : range.start;

	return {
		start: format(normalizedStart, "yyyy-MM-dd"),
		end: format(range.end, "yyyy-MM-dd"),
	};
}

/**
 * Expands a trusted analytics interval while keeping the allocation bounded.
 * Oversized and malformed intervals are rejected instead of silently clamped so
 * callers remain safe if upstream normalization ever regresses.
 */
export function expandAnalyticsDateRange(
	startDate: string,
	endDate: string,
): Date[] {
	const range = parseDateRange(startDate, endDate);

	if (!range) {
		return [];
	}

	const dayCount = differenceInCalendarDays(range.end, range.start) + 1;

	if (isAnalyticsRangeTooLarge(dayCount)) {
		return [];
	}

	return eachDayOfInterval(range);
}

export function getSupportedAnalyticsDateRange(endDate = new Date()) {
	const normalizedEndDate = new Date(endDate);
	const supportedStartDate = new Date(normalizedEndDate);

	supportedStartDate.setDate(
		normalizedEndDate.getDate() - (MAX_ANALYTICS_DAYS - 1),
	);

	return {
		end: normalizedEndDate,
		start: supportedStartDate,
	};
}

type ParsedDateRange = {
	start: Date;
	end: Date;
};

function parseDateRange(
	startDate: string,
	endDate: string,
): ParsedDateRange | null {
	const parsedStartDate = parseDateOnly(startDate);
	const parsedEndDate = parseDateOnly(endDate);

	if (!parsedStartDate || !parsedEndDate) {
		return null;
	}

	return parsedStartDate <= parsedEndDate
		? { start: parsedStartDate, end: parsedEndDate }
		: { start: parsedEndDate, end: parsedStartDate };
}

function parseDateOnly(value: string) {
	if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
		return null;
	}

	const parsedDate = parseISO(value);
	if (!isValid(parsedDate) || format(parsedDate, "yyyy-MM-dd") !== value) {
		return null;
	}

	return parsedDate;
}
