import { resolveRepoIdentity, type SessionAnalytics } from "@rudel/api-routes";
import {
	resolveSessionErrorCount,
	resolveSessionSubagentCount,
} from "@/features/sessions/components/session-overview-metrics";
import { getSessionTimestamp } from "@/features/sessions/session-ordering";
import { calculateCost, formatUsername } from "@/lib/format";

export const SESSION_OVERVIEW_GRID_CLASS_NAME =
	"grid-cols-[64px_40px_264px_180px_112px_184px_112px_112px_112px_112px_88px_88px_104px]";
export const SESSION_OVERVIEW_MIN_WIDTH_CLASS_NAME = "min-w-[1572px]";
export const SESSION_OVERVIEW_COLUMNS = [
	{ align: "left", key: "time", label: "Time" },
	{ align: "left", key: "repository", label: "Repository" },
	{ align: "left", key: "user", label: "Member" },
	{ align: "left", key: "model", label: "Model" },
	{ align: "left", key: "signals", label: "Signals" },
	{ align: "right", key: "duration", label: "Length" },
	{ align: "right", key: "input", label: "Input" },
	{ align: "right", key: "output", label: "Output" },
	{ align: "right", key: "cost", label: "API Cost" },
	{ align: "right", key: "errors", label: "Errors" },
	{ align: "right", key: "skills", label: "Skills" },
	{ align: "right", key: "subagents", label: "Subagent types" },
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
	"input",
	"output",
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
type SortDirection = "asc" | "desc";
export type SessionSortState = {
	key: SessionOverviewColumnKey;
	direction: SortDirection;
};

export function getSessionOverviewCost(
	session: SessionAnalytics,
): number | null {
	if (session.estimated_cost !== undefined) {
		return session.estimated_cost;
	}

	return calculateCost(session.input_tokens, session.output_tokens, {
		at: session.session_date,
		model: session.model_used,
	});
}

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
		input: buildSessionOverviewRangeBound(sessions, "input"),
		output: buildSessionOverviewRangeBound(sessions, "output"),
		subagents: buildSessionOverviewRangeBound(sessions, "subagents"),
	};
}

export function matchesSessionOverviewRangeFilters(
	session: SessionAnalytics,
	rangeFilterValues: SessionOverviewRangeFilterValues,
) {
	return SESSION_OVERVIEW_RANGE_FILTER_KEYS.every((filterKey) => {
		const range = rangeFilterValues[filterKey];
		const value = getSessionOverviewRangeValue(session, filterKey);
		if (value === null) {
			return range.minimum === null && range.maximum === null;
		}

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
		case "signals":
			return (
				getSessionLanguageSignalCount(leftSession) -
				getSessionLanguageSignalCount(rightSession)
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
		case "input":
			return leftSession.input_tokens - rightSession.input_tokens;
		case "output":
			return leftSession.output_tokens - rightSession.output_tokens;
		case "cost":
			return compareNullableNumbers(
				getSessionOverviewCost(leftSession),
				getSessionOverviewCost(rightSession),
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
		case "signals":
		case "subagents":
		case "input":
		case "output":
		case "cost":
		case "errors":
		case "duration":
		case "time":
			return "desc";
		default:
			return "asc";
	}
}

function getSessionLanguageSignalCount(session: SessionAnalytics) {
	return (
		session.member_swears +
		session.member_apologies +
		session.member_positive +
		session.model_swears +
		session.model_apologies +
		session.model_positive
	);
}

export function getRepositoryLabel(session: SessionAnalytics) {
	const repository = session.repository?.trim();
	const isRawRepository =
		repository === session.project_path || repository === session.git_remote;

	if (repository && !isRawRepository) {
		return repository;
	}

	return resolveRepoIdentity({
		gitRemote: session.git_remote ?? null,
		packageName: null,
		projectPath: session.project_path,
	}).repoLabel;
}

export function getSessionBranchLabel(session: SessionAnalytics) {
	const branch = session.git_branch?.trim().replace(/^refs\/heads\//, "");
	if (!branch) {
		return null;
	}

	const repositoryName = getRepositoryLabel(session)
		.split("/")
		.filter(Boolean)
		.at(-1);
	if (!repositoryName) {
		return branch;
	}

	const repositoryNames = [
		repositoryName,
		repositoryName.replace(/[-_.]?v\d+$/i, ""),
	].filter((name, index, names) => name && names.indexOf(name) === index);
	const matchingRepositoryName = repositoryNames.find((name) =>
		branch.toLowerCase().startsWith(`${name.toLowerCase()}/`),
	);

	return matchingRepositoryName
		? branch.slice(matchingRepositoryName.length + 1)
		: branch;
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
	let hasKnownValue = false;

	for (const session of sessions) {
		const value = getSessionOverviewRangeValue(session, filterKey);
		if (value === null) {
			continue;
		}
		hasKnownValue = true;
		minimum = Math.min(minimum, value);
		maximum = Math.max(maximum, value);
	}
	const step = getSessionOverviewRangeStep(filterKey);
	if (!hasKnownValue) {
		return { maximum: 0, minimum: 0, step };
	}

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
		case "input":
			return session.input_tokens;
		case "output":
			return session.output_tokens;
		case "cost":
			return getSessionOverviewCost(session);
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

function compareNullableNumbers(
	leftValue: number | null,
	rightValue: number | null,
) {
	if (leftValue === null) {
		return rightValue === null ? 0 : -1;
	}
	if (rightValue === null) {
		return 1;
	}

	return leftValue - rightValue;
}

export function compareSessionLabels(leftValue: string, rightValue: string) {
	return leftValue.localeCompare(rightValue, undefined, {
		numeric: true,
		sensitivity: "base",
	});
}
