import type { SessionAnalytics } from "@rudel/api-routes";
import {
	resolveSessionErrorCount,
	resolveSessionSubagentCount,
} from "@/features/sessions/components/session-overview-metrics";
import { getSessionTimestamp } from "@/features/sessions/session-ordering";
import { calculateCost, formatUsername } from "@/lib/format";

export const SESSION_OVERVIEW_GRID_CLASS_NAME =
	"grid-cols-[80px_288px_215px_200px_150px_150px_170px_180px_140px_320px]";
export const SESSION_OVERVIEW_MIN_WIDTH_CLASS_NAME = "min-w-[1893px]";
export const SESSION_OVERVIEW_SECOND_FROZEN_COLUMN_LEFT_CLASS_NAME =
	"left-[80px]";
export const SESSION_OVERVIEW_COLUMNS = [
	{ align: "left", key: "time", label: "Date" },
	{ align: "left", key: "repository", label: "Repository" },
	{ align: "left", key: "user", label: "Member" },
	{ align: "left", key: "model", label: "Model" },
	{ align: "right", key: "tokens", label: "Tokens" },
	{ align: "right", key: "cost", label: "Cost" },
	{ align: "right", key: "subagents", label: "Subagents Used" },
	{ align: "right", key: "errors", label: "Tool/API Errors" },
	{ align: "right", key: "duration", label: "Duration" },
	{ align: "left", key: "skills", label: "Skills Used" },
] as const;

export type SessionOverviewColumnKey =
	(typeof SESSION_OVERVIEW_COLUMNS)[number]["key"];
export const SESSION_OVERVIEW_FILTER_KEYS = [
	"repository",
	"user",
	"model",
	"skills",
] as const;
export type SessionOverviewFilterKey =
	(typeof SESSION_OVERVIEW_FILTER_KEYS)[number];
export const SESSION_OVERVIEW_RANGE_FILTER_KEYS = [
	"tokens",
	"cost",
	"subagents",
	"errors",
	"duration",
] as const;
export type SessionOverviewRangeFilterKey =
	(typeof SESSION_OVERVIEW_RANGE_FILTER_KEYS)[number];
export type SessionOverviewRangeFilter = {
	minimum: number | null;
	maximum: number | null;
};
export type SessionOverviewRangeFilterValues = Record<
	SessionOverviewRangeFilterKey,
	SessionOverviewRangeFilter
>;
export type SessionOverviewRangeBounds = Record<
	SessionOverviewRangeFilterKey,
	{
		minimum: number;
		maximum: number;
		step: number;
	}
>;
export type SessionOverviewFilterOption = {
	label: string;
	value: string;
};
export type SessionOverviewExcludedFilterValues = Record<
	SessionOverviewFilterKey,
	ReadonlySet<string>
>;
export const SESSION_OVERVIEW_NO_SKILLS_FILTER_VALUE = "__no_skills_used__";
export type SortDirection = "asc" | "desc";
export type SessionSortState = {
	key: SessionOverviewColumnKey;
	direction: SortDirection;
};

export function buildSessionOverviewFilterOptions(
	sessions: readonly SessionAnalytics[],
	filterKey: SessionOverviewFilterKey,
	userMap: Record<string, string>,
) {
	const labelsByValue = new Map<string, string>();

	for (const session of sessions) {
		const values = getSessionOverviewFilterValues(session, filterKey);
		for (const value of values) {
			labelsByValue.set(
				value,
				getSessionOverviewFilterLabel(session, filterKey, value, userMap),
			);
		}
	}

	return [...labelsByValue.entries()]
		.map(([value, label]): SessionOverviewFilterOption => ({ label, value }))
		.sort(
			(leftOption, rightOption) =>
				compareSessionLabels(leftOption.label, rightOption.label) ||
				compareSessionLabels(leftOption.value, rightOption.value),
		);
}

export function matchesSessionOverviewFilters(
	session: SessionAnalytics,
	excludedFilterValues: SessionOverviewExcludedFilterValues,
) {
	return SESSION_OVERVIEW_FILTER_KEYS.every((filterKey) =>
		getSessionOverviewFilterValues(session, filterKey).every(
			(value) => !excludedFilterValues[filterKey].has(value),
		),
	);
}

export function buildSessionOverviewRangeBounds(
	sessions: readonly SessionAnalytics[],
): SessionOverviewRangeBounds {
	return {
		cost: buildSessionOverviewRangeBound(sessions, "cost"),
		duration: buildSessionOverviewRangeBound(sessions, "duration"),
		errors: buildSessionOverviewRangeBound(sessions, "errors"),
		subagents: buildSessionOverviewRangeBound(sessions, "subagents"),
		tokens: buildSessionOverviewRangeBound(sessions, "tokens"),
	};
}

export function matchesSessionOverviewRangeFilters(
	session: SessionAnalytics,
	rangeFilterValues: SessionOverviewRangeFilterValues,
) {
	return SESSION_OVERVIEW_RANGE_FILTER_KEYS.every((filterKey) => {
		const range = rangeFilterValues[filterKey];
		const value = getSessionOverviewRangeValue(session, filterKey);

		return (
			(range.minimum === null || value >= range.minimum) &&
			(range.maximum === null || value <= range.maximum)
		);
	});
}

export function compareSessions(
	leftSession: SessionAnalytics,
	rightSession: SessionAnalytics,
	sortKey: SessionOverviewColumnKey,
	userMap: Record<string, string>,
) {
	switch (sortKey) {
		case "user":
			return compareSessionLabels(
				formatUsername(leftSession.user_id, userMap),
				formatUsername(rightSession.user_id, userMap),
			);
		case "repository":
			return compareSessionLabels(
				getRepositoryLabel(leftSession),
				getRepositoryLabel(rightSession),
			);
		case "model":
			return compareSessionLabels(
				leftSession.model_used,
				rightSession.model_used,
			);
		case "skills":
			return leftSession.skills.length - rightSession.skills.length;
		case "subagents":
			return (
				resolveSessionSubagentCount(
					leftSession.subagent_count,
					leftSession.subagent_types,
				) -
				resolveSessionSubagentCount(
					rightSession.subagent_count,
					rightSession.subagent_types,
				)
			);
		case "tokens":
			return leftSession.total_tokens - rightSession.total_tokens;
		case "cost":
			return (
				calculateCost(leftSession.input_tokens, leftSession.output_tokens, {
					at: leftSession.session_date,
					model: leftSession.model_used,
				}) -
				calculateCost(rightSession.input_tokens, rightSession.output_tokens, {
					at: rightSession.session_date,
					model: rightSession.model_used,
				})
			);
		case "errors":
			return (
				resolveSessionErrorCount(leftSession.error_count) -
				resolveSessionErrorCount(rightSession.error_count)
			);
		case "duration":
			return leftSession.duration_min - rightSession.duration_min;
		case "time":
			return (
				getSessionTimestamp(leftSession.session_date).getTime() -
				getSessionTimestamp(rightSession.session_date).getTime()
			);
	}
}

export function getInitialSortDirection(
	sortKey: SessionOverviewColumnKey,
): SortDirection {
	switch (sortKey) {
		case "skills":
		case "subagents":
		case "tokens":
		case "cost":
		case "errors":
		case "duration":
		case "time":
			return "desc";
		default:
			return "asc";
	}
}

export function getRepositoryLabel(session: SessionAnalytics) {
	return session.repository || "Untitled project";
}

function getSessionOverviewFilterValues(
	session: SessionAnalytics,
	filterKey: SessionOverviewFilterKey,
) {
	switch (filterKey) {
		case "repository":
			return [getRepositoryLabel(session)];
		case "user":
			return [session.user_id];
		case "model":
			return [session.model_used];
		case "skills":
			return session.skills.length > 0
				? session.skills
				: [SESSION_OVERVIEW_NO_SKILLS_FILTER_VALUE];
	}
}

function getSessionOverviewFilterLabel(
	session: SessionAnalytics,
	filterKey: SessionOverviewFilterKey,
	value: string,
	userMap: Record<string, string>,
) {
	switch (filterKey) {
		case "repository":
			return getRepositoryLabel(session);
		case "user":
			return formatUsername(session.user_id, userMap);
		case "model":
			return session.model_used;
		case "skills":
			return value === SESSION_OVERVIEW_NO_SKILLS_FILTER_VALUE
				? "No skills used"
				: value;
	}
}

function buildSessionOverviewRangeBound(
	sessions: readonly SessionAnalytics[],
	filterKey: SessionOverviewRangeFilterKey,
) {
	if (sessions.length === 0) {
		return {
			minimum: 0,
			maximum: 0,
			step: getSessionOverviewRangeStep(filterKey),
		};
	}

	let minimum = Number.POSITIVE_INFINITY;
	let maximum = Number.NEGATIVE_INFINITY;

	for (const session of sessions) {
		const value = getSessionOverviewRangeValue(session, filterKey);
		minimum = Math.min(minimum, value);
		maximum = Math.max(maximum, value);
	}
	const step = getSessionOverviewRangeStep(filterKey);

	return {
		minimum: normalizeRangeBoundary(minimum, step, "minimum"),
		maximum: normalizeRangeBoundary(maximum, step, "maximum"),
		step,
	};
}

function getSessionOverviewRangeValue(
	session: SessionAnalytics,
	filterKey: SessionOverviewRangeFilterKey,
) {
	switch (filterKey) {
		case "tokens":
			return session.total_tokens;
		case "cost":
			return calculateCost(session.input_tokens, session.output_tokens, {
				at: session.session_date,
				model: session.model_used,
			});
		case "subagents":
			return resolveSessionSubagentCount(
				session.subagent_count,
				session.subagent_types,
			);
		case "errors":
			return resolveSessionErrorCount(session.error_count);
		case "duration":
			return session.duration_min;
	}
}

function getSessionOverviewRangeStep(filterKey: SessionOverviewRangeFilterKey) {
	switch (filterKey) {
		case "cost":
			return 0.0001;
		case "duration":
			return 0.1;
		default:
			return 1;
	}
}

function normalizeRangeBoundary(
	value: number,
	step: number,
	direction: "minimum" | "maximum",
) {
	const scaledValue = value / step;
	const normalizedValue =
		direction === "minimum"
			? Math.floor(scaledValue) * step
			: Math.ceil(scaledValue) * step;
	const precision = Math.max(0, Math.ceil(-Math.log10(step)));

	return Number(normalizedValue.toFixed(precision));
}

export function compareSessionLabels(leftValue: string, rightValue: string) {
	return leftValue.localeCompare(rightValue, undefined, {
		numeric: true,
		sensitivity: "base",
	});
}
