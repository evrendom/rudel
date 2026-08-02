import type { SessionAnalytics } from "@rudel/api-routes";
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
] as const;
export type SessionOverviewFilterKey =
	(typeof SESSION_OVERVIEW_FILTER_KEYS)[number];
export const SESSION_OVERVIEW_FILTER_DIMENSIONS = [
	...SESSION_OVERVIEW_FILTER_KEYS,
	"worktree",
] as const;
export type SessionOverviewFilterDimensionKey =
	(typeof SESSION_OVERVIEW_FILTER_DIMENSIONS)[number];
export type SessionOverviewWorktreeFilterOption = {
	label: string;
	value: string;
};
export type SessionOverviewFilterOption = {
	label: string;
	value: string;
	worktrees: readonly SessionOverviewWorktreeFilterOption[];
};
export type SessionOverviewExcludedFilterValues = Record<
	SessionOverviewFilterDimensionKey,
	ReadonlySet<string>
>;
export type SortDirection = "asc" | "desc";
export type SessionSortState = {
	key: SessionOverviewColumnKey;
	direction: SortDirection;
};

export function isSessionOverviewFilterKey(
	columnKey: SessionOverviewColumnKey,
): columnKey is SessionOverviewFilterKey {
	return SESSION_OVERVIEW_FILTER_KEYS.some(
		(filterKey) => filterKey === columnKey,
	);
}

export function buildSessionOverviewFilterOptions(
	sessions: readonly SessionAnalytics[],
	filterKey: SessionOverviewFilterKey,
	userMap: Record<string, string>,
) {
	const labelsByValue = new Map<string, string>();
	const worktreesByRepository = new Map<string, Map<string, string>>();

	for (const session of sessions) {
		const value = getSessionOverviewFilterValue(session, filterKey);
		labelsByValue.set(
			value,
			getSessionOverviewFilterLabel(session, filterKey, userMap),
		);

		if (filterKey === "repository" && session.worktree) {
			const repositoryWorktrees =
				worktreesByRepository.get(value) ?? new Map<string, string>();
			repositoryWorktrees.set(
				getWorktreeFilterValue(value, session.worktree),
				session.worktree,
			);
			worktreesByRepository.set(value, repositoryWorktrees);
		}
	}

	return [...labelsByValue.entries()]
		.map(
			([value, label]): SessionOverviewFilterOption => ({
				label,
				value,
				worktrees: buildWorktreeFilterOptions(worktreesByRepository.get(value)),
			}),
		)
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
	const matchesTopLevelFilters = SESSION_OVERVIEW_FILTER_KEYS.every(
		(filterKey) =>
			!excludedFilterValues[filterKey].has(
				getSessionOverviewFilterValue(session, filterKey),
			),
	);
	const worktreeFilterValue = session.worktree
		? getWorktreeFilterValue(getRepositoryLabel(session), session.worktree)
		: null;

	return (
		matchesTopLevelFilters &&
		(worktreeFilterValue === null ||
			!excludedFilterValues.worktree.has(worktreeFilterValue))
	);
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
			return leftSession.subagent_count - rightSession.subagent_count;
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
			return leftSession.error_count - rightSession.error_count;
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

function getSessionOverviewFilterValue(
	session: SessionAnalytics,
	filterKey: SessionOverviewFilterKey,
) {
	switch (filterKey) {
		case "repository":
			return getRepositoryLabel(session);
		case "user":
			return session.user_id;
		case "model":
			return session.model_used;
	}
}

function buildWorktreeFilterOptions(
	worktreeLabelsByValue: ReadonlyMap<string, string> | undefined,
): readonly SessionOverviewWorktreeFilterOption[] {
	if (!worktreeLabelsByValue || worktreeLabelsByValue.size <= 1) {
		return [];
	}

	return [...worktreeLabelsByValue.entries()]
		.map(
			([value, label]): SessionOverviewWorktreeFilterOption => ({
				label,
				value,
			}),
		)
		.sort(
			(leftOption, rightOption) =>
				compareSessionLabels(leftOption.label, rightOption.label) ||
				compareSessionLabels(leftOption.value, rightOption.value),
		);
}

function getWorktreeFilterValue(repository: string, worktree: string) {
	return `${repository}/${worktree}`;
}

function getSessionOverviewFilterLabel(
	session: SessionAnalytics,
	filterKey: SessionOverviewFilterKey,
	userMap: Record<string, string>,
) {
	switch (filterKey) {
		case "repository":
			return getRepositoryLabel(session);
		case "user":
			return formatUsername(session.user_id, userMap);
		case "model":
			return session.model_used;
	}
}

export function compareSessionLabels(leftValue: string, rightValue: string) {
	return leftValue.localeCompare(rightValue, undefined, {
		numeric: true,
		sensitivity: "base",
	});
}
