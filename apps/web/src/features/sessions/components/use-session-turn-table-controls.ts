import { useMemo, useState } from "react";
import type { SessionTurnTableOption } from "./session-turn-table";
import {
	DEFAULT_SESSION_TURN_TABLE_COLUMNS,
	type SessionTurnTableColumnKey,
} from "./session-turn-table-column-options";
import {
	buildSessionTurnTableFilterOptions,
	buildSessionTurnTableRangeBounds,
	createEmptySessionTurnTableExcludedFilterValues,
	createEmptySessionTurnTableRangeFilterValues,
	filterSessionTurnTableOptions,
	getInitialSessionTurnTableSortDirection,
	getSessionTurnTableSortLabel,
	hasActiveSessionTurnTableFilters,
	type IndexedSessionTurnTableOption,
	type SessionTurnTableExcludedFilterValues,
	type SessionTurnTableOptionFilterKey,
	type SessionTurnTableRangeFilter,
	type SessionTurnTableRangeFilterKey,
	type SessionTurnTableRangeFilterValues,
	type SessionTurnTableSortKey,
	type SessionTurnTableSortState,
	sortSessionTurnTableOptions,
} from "./session-turn-table-filters";

export function useSessionTurnTableControls<
	TOption extends SessionTurnTableOption,
>({
	onSelect,
	options,
	selectedIndex,
}: {
	onSelect: (index: number) => void;
	options: readonly TOption[];
	selectedIndex: number;
}) {
	const [sort, setSort] = useState<SessionTurnTableSortState>({
		direction: "asc",
		key: "time",
	});
	const [excludedFilterValues, setExcludedFilterValues] =
		useState<SessionTurnTableExcludedFilterValues>(
			createEmptySessionTurnTableExcludedFilterValues,
		);
	const [rangeFilterValues, setRangeFilterValues] =
		useState<SessionTurnTableRangeFilterValues>(
			createEmptySessionTurnTableRangeFilterValues,
		);
	const [visibleColumnKeys, setVisibleColumnKeys] = useState<
		ReadonlySet<SessionTurnTableColumnKey>
	>(() => new Set(DEFAULT_SESSION_TURN_TABLE_COLUMNS));
	const availableColumnKeys = useMemo(
		() =>
			DEFAULT_SESSION_TURN_TABLE_COLUMNS.filter(
				(columnKey) =>
					columnKey !== "commands" ||
					options.some((option) => option.slashCommands.length > 0),
			),
		[options],
	);
	const effectiveVisibleColumnKeys = useMemo(
		() =>
			availableColumnKeys.some((columnKey) => visibleColumnKeys.has(columnKey))
				? visibleColumnKeys
				: new Set([availableColumnKeys[0] ?? "time"]),
		[availableColumnKeys, visibleColumnKeys],
	);
	const filterOptions = useMemo(
		() => ({
			commands: buildSessionTurnTableFilterOptions(options, "commands"),
			files: buildSessionTurnTableFilterOptions(options, "files"),
			skills: buildSessionTurnTableFilterOptions(options, "skills"),
		}),
		[options],
	);
	const rangeFilterBounds = useMemo(
		() => buildSessionTurnTableRangeBounds(options),
		[options],
	);
	const visibleMatches = useMemo(
		() =>
			sortSessionTurnTableOptions(
				filterSessionTurnTableOptions(
					options,
					excludedFilterValues,
					rangeFilterValues,
				),
				sort,
			),
		[excludedFilterValues, options, rangeFilterValues, sort],
	);
	const hasActiveFilters = hasActiveSessionTurnTableFilters(
		excludedFilterValues,
		rangeFilterValues,
	);
	const activeSortLabel = getSessionTurnTableSortLabel(sort.key);

	function keepSelectionVisible(
		matches: readonly IndexedSessionTurnTableOption<TOption>[],
	) {
		if (
			matches.length > 0 &&
			!matches.some((match) => match.index === selectedIndex)
		) {
			onSelect(matches[0]?.index ?? selectedIndex);
		}
	}

	function getNextMatches(
		nextExcludedFilterValues: SessionTurnTableExcludedFilterValues,
		nextRangeFilterValues: SessionTurnTableRangeFilterValues,
	) {
		return sortSessionTurnTableOptions(
			filterSessionTurnTableOptions(
				options,
				nextExcludedFilterValues,
				nextRangeFilterValues,
			),
			sort,
		);
	}

	function handleSort(sortKey: SessionTurnTableSortKey) {
		setSort((currentSort) => ({
			direction:
				currentSort.key === sortKey
					? currentSort.direction === "asc"
						? "desc"
						: "asc"
					: getInitialSessionTurnTableSortDirection(sortKey),
			key: sortKey,
		}));
	}

	function toggleSortDirection() {
		setSort((currentSort) => ({
			...currentSort,
			direction: currentSort.direction === "asc" ? "desc" : "asc",
		}));
	}

	function setFilterOptionChecked(
		filterKey: SessionTurnTableOptionFilterKey,
		value: string,
		checked: boolean,
	) {
		const nextExcludedValues = new Set(excludedFilterValues[filterKey]);
		if (checked) {
			nextExcludedValues.delete(value);
		} else {
			nextExcludedValues.add(value);
		}
		const nextFilters: SessionTurnTableExcludedFilterValues = {
			...excludedFilterValues,
			[filterKey]: nextExcludedValues,
		};
		setExcludedFilterValues(nextFilters);
		keepSelectionVisible(getNextMatches(nextFilters, rangeFilterValues));
	}

	function clearFilter(filterKey: SessionTurnTableOptionFilterKey) {
		const nextFilters: SessionTurnTableExcludedFilterValues = {
			...excludedFilterValues,
			[filterKey]: new Set<string>(),
		};
		setExcludedFilterValues(nextFilters);
		keepSelectionVisible(getNextMatches(nextFilters, rangeFilterValues));
	}

	function setRangeFilter(
		filterKey: SessionTurnTableRangeFilterKey,
		value: SessionTurnTableRangeFilter,
	) {
		const nextFilters: SessionTurnTableRangeFilterValues = {
			...rangeFilterValues,
			[filterKey]: value,
		};
		setRangeFilterValues(nextFilters);
		keepSelectionVisible(getNextMatches(excludedFilterValues, nextFilters));
	}

	function clearRangeFilter(filterKey: SessionTurnTableRangeFilterKey) {
		setRangeFilter(filterKey, { maximum: null, minimum: null });
	}

	function clearAllFilters() {
		const nextExcludedFilters =
			createEmptySessionTurnTableExcludedFilterValues();
		const nextRangeFilters = createEmptySessionTurnTableRangeFilterValues();
		setExcludedFilterValues(nextExcludedFilters);
		setRangeFilterValues(nextRangeFilters);
		keepSelectionVisible(getNextMatches(nextExcludedFilters, nextRangeFilters));
	}

	return {
		activeSortLabel,
		availableColumnKeys,
		clearAllFilters,
		clearFilter,
		clearRangeFilter,
		effectiveVisibleColumnKeys,
		excludedFilterValues,
		filterOptions,
		handleSort,
		hasActiveFilters,
		rangeFilterBounds,
		rangeFilterValues,
		setFilterOptionChecked,
		setRangeFilter,
		setVisibleColumnKeys,
		sort,
		toggleSortDirection,
		visibleMatches,
	};
}
