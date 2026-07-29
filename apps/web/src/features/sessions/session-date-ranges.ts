import { addDays, subMonths } from "date-fns";
import { formatIsoDate } from "@/lib/format";

export type SessionDateRangeOptionId =
	| "24-hours"
	| "7-days"
	| "30-days"
	| "6-months";

export type SessionDateRangeOption = {
	id: SessionDateRangeOptionId;
	label: string;
	resolveRange: (today: Date) => { startDate: string; endDate: string };
};

export const SESSION_DATE_RANGE_OPTIONS: readonly SessionDateRangeOption[] = [
	{
		id: "24-hours",
		label: "24 hours",
		resolveRange: (today) => ({
			startDate: formatIsoDate(today),
			endDate: formatIsoDate(today),
		}),
	},
	{
		id: "7-days",
		label: "7 days",
		resolveRange: (today) => ({
			startDate: formatIsoDate(addDays(today, -6)),
			endDate: formatIsoDate(today),
		}),
	},
	{
		id: "30-days",
		label: "30 days",
		resolveRange: (today) => ({
			startDate: formatIsoDate(addDays(today, -29)),
			endDate: formatIsoDate(today),
		}),
	},
	{
		id: "6-months",
		label: "6 months",
		resolveRange: (today) => ({
			startDate: formatIsoDate(subMonths(today, 6)),
			endDate: formatIsoDate(today),
		}),
	},
] as const;

export function resolveActiveSessionDateRangeOptionId({
	endDate,
	startDate,
	today = new Date(),
}: {
	endDate: string;
	startDate: string;
	today?: Date;
}) {
	return (
		SESSION_DATE_RANGE_OPTIONS.find((option) => {
			const resolvedRange = option.resolveRange(today);

			return (
				resolvedRange.startDate === startDate &&
				resolvedRange.endDate === endDate
			);
		})?.id ?? null
	);
}

/**
 * Session list query input for a picked date range.
 *
 * The rolling 24-hour view is the one case that cannot use an absolute window:
 * it spans the last 24 hours rather than a calendar day, so it over-fetches two
 * days by `days` and lets the view filter down to the rolling window. Every
 * other range is sent as explicit start/end dates so a window that does not end
 * today returns that window instead of the last N days.
 */
export function buildSessionListDateInput({
	dayCount,
	endDate,
	startDate,
	today = new Date(),
}: {
	dayCount: number;
	endDate: string;
	startDate: string;
	today?: Date;
}) {
	if (
		resolveActiveSessionDateRangeOptionId({ endDate, startDate, today }) ===
		"24-hours"
	) {
		return { days: 2 };
	}

	return { days: dayCount, startDate, endDate };
}
