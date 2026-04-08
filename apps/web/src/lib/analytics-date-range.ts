export const MAX_ANALYTICS_DAYS = 365;

const MILLISECONDS_PER_DAY = 1000 * 60 * 60 * 24;

export function getInclusiveDateRangeDays(startDate: string, endDate: string) {
	const startTime = new Date(startDate).getTime();
	const endTime = new Date(endDate).getTime();

	if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) {
		return 1;
	}

	const inclusiveDayCount =
		Math.floor((endTime - startTime) / MILLISECONDS_PER_DAY) + 1;

	return Math.max(1, inclusiveDayCount);
}

export function isAnalyticsRangeTooLarge(days: number) {
	return days > MAX_ANALYTICS_DAYS;
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
