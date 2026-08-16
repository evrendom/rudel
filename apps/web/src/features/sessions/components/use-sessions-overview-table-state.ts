import type { SessionAnalytics } from "@rudel/api-routes";
import { useCallback, useMemo, useState } from "react";
import { calculateCost } from "@/lib/format";
import {
	buildSessionOverviewFilterOptions,
	buildSessionOverviewRangeBounds,
	compareSessionLabels,
	compareSessions,
	getInitialSortDirection,
	matchesSessionOverviewFilters,
	matchesSessionOverviewRangeFilters,
	SESSION_OVERVIEW_COLUMNS,
	SESSION_OVERVIEW_FILTER_KEYS,
	SESSION_OVERVIEW_RANGE_FILTER_KEYS,
	type SessionOverviewColumnKey,
	type SessionOverviewExcludedFilterValues,
	type SessionOverviewFilterKey,
	type SessionOverviewRangeFilter,
	type SessionOverviewRangeFilterKey,
	type SessionOverviewRangeFilterValues,
	type SessionSortState,
} from "./sessions-overview-table-utils";

const SESSION_ROW_BATCH_SIZE = 50;
const EMPTY_SESSIONS: readonly SessionAnalytics[] = [];
const createEmptyFilters = (): SessionOverviewExcludedFilterValues => ({
	model: new Set<string>(),
	repository: new Set<string>(),
	skills: new Set<string>(),
	user: new Set<string>(),
});
const createEmptyRangeFilters = (): SessionOverviewRangeFilterValues => ({
	cost: { maximum: null, minimum: null },
	duration: { maximum: null, minimum: null },
	errors: { maximum: null, minimum: null },
	subagents: { maximum: null, minimum: null },
	tokens: { maximum: null, minimum: null },
});

export function useSessionsOverviewTableState({
	sessionCountLabel,
	sessions,
	totalSessionCount,
	userMap,
}: {
	sessionCountLabel: number;
	sessions: readonly SessionAnalytics[] | undefined;
	totalSessionCount: number;
	userMap: Record<string, string>;
}) {
	const [sort, setSort] = useState<SessionSortState>({
		direction: "desc",
		key: "time",
	});
	const [excludedFilterValues, setExcludedFilterValues] =
		useState<SessionOverviewExcludedFilterValues>(createEmptyFilters);
	const [rangeFilterValues, setRangeFilterValues] =
		useState<SessionOverviewRangeFilterValues>(createEmptyRangeFilters);
	const [visibleRowCount, setVisibleRowCount] = useState(
		SESSION_ROW_BATCH_SIZE,
	);
	const recentSessions = sessions ?? EMPTY_SESSIONS;
	const filterOptions = useMemo(
		() => ({
			model: buildSessionOverviewFilterOptions(
				recentSessions,
				"model",
				userMap,
			),
			repository: buildSessionOverviewFilterOptions(
				recentSessions,
				"repository",
				userMap,
			),
			skills: buildSessionOverviewFilterOptions(
				recentSessions,
				"skills",
				userMap,
			),
			user: buildSessionOverviewFilterOptions(recentSessions, "user", userMap),
		}),
		[recentSessions, userMap],
	);
	const rangeFilterBounds = useMemo(
		() => buildSessionOverviewRangeBounds(recentSessions),
		[recentSessions],
	);
	const hasActiveFilters =
		SESSION_OVERVIEW_FILTER_KEYS.some(
			(filterKey) => excludedFilterValues[filterKey].size > 0,
		) ||
		SESSION_OVERVIEW_RANGE_FILTER_KEYS.some((filterKey) => {
			const range = rangeFilterValues[filterKey];
			return range.minimum !== null || range.maximum !== null;
		});
	const filteredSessions = useMemo(
		() =>
			recentSessions.filter(
				(session) =>
					matchesSessionOverviewFilters(session, excludedFilterValues) &&
					matchesSessionOverviewRangeFilters(session, rangeFilterValues),
			),
		[excludedFilterValues, rangeFilterValues, recentSessions],
	);
	const sortedSessions = useMemo(
		() =>
			[...filteredSessions].sort((leftSession, rightSession) => {
				const comparison = compareSessions(
					leftSession,
					rightSession,
					sort.key,
					userMap,
				);
				const directedComparison =
					sort.direction === "asc" ? comparison : -comparison;
				return (
					directedComparison ||
					compareSessionLabels(leftSession.session_id, rightSession.session_id)
				);
			}),
		[filteredSessions, sort.direction, sort.key, userMap],
	);
	const visibleSessions = sortedSessions.slice(0, visibleRowCount);
	const maximumSessionTokens = useMemo(
		() =>
			filteredSessions.reduce(
				(maximum, session) => Math.max(maximum, session.total_tokens),
				0,
			),
		[filteredSessions],
	);
	const maximumSessionCost = useMemo(
		() =>
			filteredSessions.reduce(
				(maximum, session) =>
					Math.max(
						maximum,
						calculateCost(session.input_tokens, session.output_tokens, {
							at: session.session_date,
							model: session.model_used,
						}),
					),
				0,
			),
		[filteredSessions],
	);
	const remainingLoadedSessionCount = Math.max(
		sortedSessions.length - visibleSessions.length,
		0,
	);
	const loadNextSessionBatch = useCallback(() => {
		setVisibleRowCount((count) =>
			Math.min(count + SESSION_ROW_BATCH_SIZE, sortedSessions.length),
		);
	}, [sortedSessions.length]);
	const resetVisibleRows = () => setVisibleRowCount(SESSION_ROW_BATCH_SIZE);

	function handleSort(sortKey: SessionOverviewColumnKey) {
		setSort((current) => ({
			direction:
				current.key === sortKey
					? current.direction === "asc"
						? "desc"
						: "asc"
					: getInitialSortDirection(sortKey),
			key: sortKey,
		}));
	}

	function setFilterOptionChecked(
		filterKey: SessionOverviewFilterKey,
		value: string,
		checked: boolean,
	) {
		setExcludedFilterValues((current) => {
			const next = new Set(current[filterKey]);
			if (checked) next.delete(value);
			else next.add(value);
			return { ...current, [filterKey]: next };
		});
		resetVisibleRows();
	}

	return {
		activeSortLabel:
			SESSION_OVERVIEW_COLUMNS.find((column) => column.key === sort.key)
				?.label ?? "Date",
		clearAllFilters: () => {
			setExcludedFilterValues(createEmptyFilters());
			setRangeFilterValues(createEmptyRangeFilters());
			resetVisibleRows();
		},
		clearFilter: (filterKey: SessionOverviewFilterKey) => {
			setExcludedFilterValues((current) => ({
				...current,
				[filterKey]: new Set<string>(),
			}));
			resetVisibleRows();
		},
		clearRangeFilter: (filterKey: SessionOverviewRangeFilterKey) => {
			setRangeFilterValues((current) => ({
				...current,
				[filterKey]: { maximum: null, minimum: null },
			}));
			resetVisibleRows();
		},
		excludedFilterValues,
		filterOptions,
		filteredSessions,
		handleSort,
		hasActiveFilters,
		loadNextSessionBatch,
		maximumSessionCost,
		maximumSessionTokens,
		rangeFilterBounds,
		rangeFilterValues,
		recentSessions,
		remainingLoadedSessionCount,
		setFilterOptionChecked,
		setRangeFilter: (
			filterKey: SessionOverviewRangeFilterKey,
			value: SessionOverviewRangeFilter,
		) => {
			setRangeFilterValues((current) => ({
				...current,
				[filterKey]: value,
			}));
			resetVisibleRows();
		},
		sort,
		toggleSortDirection: () =>
			setSort((current) => ({
				...current,
				direction: current.direction === "asc" ? "desc" : "asc",
			})),
		unloadedSessionCount: Math.max(
			totalSessionCount - recentSessions.length,
			0,
		),
		visibleSessionCountLabel: hasActiveFilters
			? filteredSessions.length
			: sessionCountLabel,
		visibleSessions,
	};
}
