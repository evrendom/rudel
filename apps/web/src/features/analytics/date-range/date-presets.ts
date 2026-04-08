import {
	addDays,
	startOfMonth,
	startOfQuarter,
	startOfWeek,
	startOfYear,
} from "date-fns";
import { getSupportedAnalyticsDateRange } from "@/lib/analytics-date-range";
import { formatDateRangeLabel, formatIsoDate } from "@/lib/format";

export type AnalyticsDatePresetId =
	| "last-7-days"
	| "last-30-days"
	| "last-60-days"
	| "last-90-days"
	| "this-week"
	| "this-month"
	| "this-quarter"
	| "this-year";

export type AnalyticsDatePreset = {
	id: AnalyticsDatePresetId;
	label: string;
	resolveRange: (today: Date) => { startDate: string; endDate: string };
};

function clampStartDate(startDate: Date, endDate: Date) {
	const supportedDateRange = getSupportedAnalyticsDateRange(endDate);

	return startDate < supportedDateRange.start
		? supportedDateRange.start
		: startDate;
}

function buildResolvedRange(startDate: Date, endDate: Date) {
	const clampedStartDate = clampStartDate(startDate, endDate);

	return {
		startDate: formatIsoDate(clampedStartDate),
		endDate: formatIsoDate(endDate),
	};
}

function createRelativeDaysPreset(
	id: AnalyticsDatePresetId,
	label: string,
	daysToSubtract: number,
): AnalyticsDatePreset {
	return {
		id,
		label,
		resolveRange: (today) =>
			buildResolvedRange(addDays(today, -daysToSubtract), today),
	};
}

export function getAnalyticsDatePresets(): AnalyticsDatePreset[] {
	return [
		createRelativeDaysPreset("last-7-days", "Last 7 days", 7),
		createRelativeDaysPreset("last-30-days", "Last 30 days", 30),
		createRelativeDaysPreset("last-60-days", "Last 60 days", 60),
		createRelativeDaysPreset("last-90-days", "Last 90 days", 90),
		{
			id: "this-week",
			label: "This week",
			resolveRange: (today) =>
				buildResolvedRange(startOfWeek(today, { weekStartsOn: 1 }), today),
		},
		{
			id: "this-month",
			label: "This month",
			resolveRange: (today) => buildResolvedRange(startOfMonth(today), today),
		},
		{
			id: "this-quarter",
			label: "This quarter",
			resolveRange: (today) => buildResolvedRange(startOfQuarter(today), today),
		},
		{
			id: "this-year",
			label: "This year",
			resolveRange: (today) => buildResolvedRange(startOfYear(today), today),
		},
	];
}

export function parseIsoDateOnly(value: string) {
	const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

	if (!dateMatch) {
		return null;
	}

	const year = Number(dateMatch[1]);
	const month = Number(dateMatch[2]);
	const day = Number(dateMatch[3]);
	const parsedDate = new Date(year, month - 1, day);

	if (
		Number.isNaN(parsedDate.getTime()) ||
		parsedDate.getFullYear() !== year ||
		parsedDate.getMonth() !== month - 1 ||
		parsedDate.getDate() !== day
	) {
		return null;
	}

	return parsedDate;
}

export function resolveMatchingAnalyticsPreset(
	startDate: string,
	endDate: string,
	today: Date,
) {
	return (
		getAnalyticsDatePresets().find((preset) => {
			const resolvedRange = preset.resolveRange(today);

			return (
				resolvedRange.startDate === startDate &&
				resolvedRange.endDate === endDate
			);
		}) ?? null
	);
}

export function formatDashboardDateRangeTriggerLabel(
	startDate: string,
	endDate: string,
) {
	return formatDateRangeLabel(startDate, endDate);
}
