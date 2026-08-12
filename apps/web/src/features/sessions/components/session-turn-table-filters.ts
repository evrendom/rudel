import type { SessionTurnTableOption } from "./session-turn-table";

export const SESSION_TURN_TABLE_OPTION_FILTER_KEYS = [
	"files",
	"skills",
	"commands",
] as const;

export type SessionTurnTableOptionFilterKey =
	(typeof SESSION_TURN_TABLE_OPTION_FILTER_KEYS)[number];

export const SESSION_TURN_TABLE_RANGE_FILTER_KEYS = [
	"input",
	"output",
	"cost",
	"tools",
	"errors",
	"duration",
] as const;

export type SessionTurnTableRangeFilterKey =
	(typeof SESSION_TURN_TABLE_RANGE_FILTER_KEYS)[number];

export const SESSION_TURN_TABLE_SORT_COLUMNS = [
	{ key: "time", label: "Time" },
	{ key: "duration", label: "Duration" },
	{ key: "input", label: "Input" },
	{ key: "output", label: "Output" },
	{ key: "cost", label: "Cost" },
	{ key: "tools", label: "Tools" },
	{ key: "errors", label: "Errors" },
	{ key: "files", label: "Files" },
	{ key: "skills", label: "Skills" },
	{ key: "commands", label: "Commands" },
] as const;

export type SessionTurnTableSortKey =
	(typeof SESSION_TURN_TABLE_SORT_COLUMNS)[number]["key"];
export type SessionTurnTableSortDirection = "asc" | "desc";
export type SessionTurnTableSortState = {
	direction: SessionTurnTableSortDirection;
	key: SessionTurnTableSortKey;
};

export type SessionTurnTableExcludedFilterValues = Record<
	SessionTurnTableOptionFilterKey,
	ReadonlySet<string>
>;
export type SessionTurnTableRangeFilter = {
	maximum: number | null;
	minimum: number | null;
};
export type SessionTurnTableRangeFilterValues = Record<
	SessionTurnTableRangeFilterKey,
	SessionTurnTableRangeFilter
>;
export type SessionTurnTableRangeBounds = Record<
	SessionTurnTableRangeFilterKey,
	{
		maximum: number;
		minimum: number;
		step: number;
	}
>;
export type SessionTurnTableFilterOption = {
	label: string;
	value: string;
};
export type IndexedSessionTurnTableOption<
	TOption extends SessionTurnTableOption,
> = {
	index: number;
	option: TOption;
};

const EMPTY_OPTION_VALUES = {
	commands: "__no_commands__",
	files: "__no_files__",
	skills: "__no_skills__",
} as const;

const EMPTY_OPTION_LABELS = {
	commands: "No commands",
	files: "No files edited",
	skills: "No skills used",
} as const;

export function createEmptySessionTurnTableExcludedFilterValues(): SessionTurnTableExcludedFilterValues {
	return {
		commands: new Set<string>(),
		files: new Set<string>(),
		skills: new Set<string>(),
	};
}

export function createEmptySessionTurnTableRangeFilterValues(): SessionTurnTableRangeFilterValues {
	return {
		cost: { maximum: null, minimum: null },
		duration: { maximum: null, minimum: null },
		errors: { maximum: null, minimum: null },
		input: { maximum: null, minimum: null },
		output: { maximum: null, minimum: null },
		tools: { maximum: null, minimum: null },
	};
}

export function buildSessionTurnTableFilterOptions(
	options: readonly SessionTurnTableOption[],
	filterKey: SessionTurnTableOptionFilterKey,
) {
	const labelsByValue = new Map<string, string>();

	for (const option of options) {
		for (const value of getSessionTurnTableOptionFilterValues(
			option,
			filterKey,
		)) {
			labelsByValue.set(
				value,
				getSessionTurnTableOptionLabel(filterKey, value),
			);
		}
	}

	return [...labelsByValue.entries()]
		.map(([value, label]): SessionTurnTableFilterOption => ({ label, value }))
		.sort(
			(leftOption, rightOption) =>
				compareLabels(leftOption.label, rightOption.label) ||
				compareLabels(leftOption.value, rightOption.value),
		);
}

export function buildSessionTurnTableRangeBounds(
	options: readonly SessionTurnTableOption[],
): SessionTurnTableRangeBounds {
	return {
		cost: buildRangeBound(options, "cost"),
		duration: buildRangeBound(options, "duration"),
		errors: buildRangeBound(options, "errors"),
		input: buildRangeBound(options, "input"),
		output: buildRangeBound(options, "output"),
		tools: buildRangeBound(options, "tools"),
	};
}

export function filterSessionTurnTableOptions<
	TOption extends SessionTurnTableOption,
>(
	options: readonly TOption[],
	excludedFilterValues: SessionTurnTableExcludedFilterValues,
	rangeFilterValues: SessionTurnTableRangeFilterValues,
): IndexedSessionTurnTableOption<TOption>[] {
	return options.flatMap((option, index) =>
		matchesOptionFilters(option, excludedFilterValues) &&
		matchesRangeFilters(option, rangeFilterValues)
			? [{ index, option }]
			: [],
	);
}

export function sortSessionTurnTableOptions<
	TOption extends SessionTurnTableOption,
>(
	matches: readonly IndexedSessionTurnTableOption<TOption>[],
	sort: SessionTurnTableSortState,
) {
	return [...matches].sort((leftMatch, rightMatch) => {
		const comparison = compareMatches(leftMatch, rightMatch, sort.key);
		const directedComparison =
			sort.direction === "asc" ? comparison : -comparison;
		return directedComparison || leftMatch.index - rightMatch.index;
	});
}

export function getInitialSessionTurnTableSortDirection(
	sortKey: SessionTurnTableSortKey,
): SessionTurnTableSortDirection {
	return sortKey === "time" ? "asc" : "desc";
}

export function getSessionTurnTableSortLabel(sortKey: SessionTurnTableSortKey) {
	return (
		SESSION_TURN_TABLE_SORT_COLUMNS.find((column) => column.key === sortKey)
			?.label ?? "Time"
	);
}

export function hasActiveSessionTurnTableFilters(
	excludedFilterValues: SessionTurnTableExcludedFilterValues,
	rangeFilterValues: SessionTurnTableRangeFilterValues,
) {
	return (
		SESSION_TURN_TABLE_OPTION_FILTER_KEYS.some(
			(filterKey) => excludedFilterValues[filterKey].size > 0,
		) ||
		SESSION_TURN_TABLE_RANGE_FILTER_KEYS.some((filterKey) => {
			const range = rangeFilterValues[filterKey];
			return range.minimum !== null || range.maximum !== null;
		})
	);
}

function matchesOptionFilters(
	option: SessionTurnTableOption,
	excludedFilterValues: SessionTurnTableExcludedFilterValues,
) {
	return SESSION_TURN_TABLE_OPTION_FILTER_KEYS.every((filterKey) =>
		getSessionTurnTableOptionFilterValues(option, filterKey).every(
			(value) => !excludedFilterValues[filterKey].has(value),
		),
	);
}

function matchesRangeFilters(
	option: SessionTurnTableOption,
	rangeFilterValues: SessionTurnTableRangeFilterValues,
) {
	return SESSION_TURN_TABLE_RANGE_FILTER_KEYS.every((filterKey) => {
		const range = rangeFilterValues[filterKey];
		const value = getSessionTurnTableRangeValue(option, filterKey);
		return (
			(range.minimum === null || value >= range.minimum) &&
			(range.maximum === null || value <= range.maximum)
		);
	});
}

function getSessionTurnTableOptionFilterValues(
	option: SessionTurnTableOption,
	filterKey: SessionTurnTableOptionFilterKey,
) {
	let values: readonly string[];

	switch (filterKey) {
		case "commands":
			values = option.slashCommands;
			break;
		case "files":
			values = option.metrics.editedFiles;
			break;
		case "skills":
			values = option.metrics.skills;
			break;
	}

	return values.length > 0 ? values : [EMPTY_OPTION_VALUES[filterKey]];
}

function getSessionTurnTableOptionLabel(
	filterKey: SessionTurnTableOptionFilterKey,
	value: string,
) {
	if (value === EMPTY_OPTION_VALUES[filterKey]) {
		return EMPTY_OPTION_LABELS[filterKey];
	}

	return filterKey === "files" ? getFileName(value) : value;
}

function getSessionTurnTableRangeValue(
	option: SessionTurnTableOption,
	filterKey: SessionTurnTableRangeFilterKey,
) {
	switch (filterKey) {
		case "input":
			return option.metrics.inputTokens ?? 0;
		case "output":
			return option.metrics.outputTokens ?? 0;
		case "cost":
			return option.metrics.estimatedCost ?? 0;
		case "tools":
			return option.toolCallCount;
		case "errors":
			return option.metrics.errorCount;
		case "duration":
			return option.timing.durationSeconds ?? 0;
	}
}

function buildRangeBound(
	options: readonly SessionTurnTableOption[],
	filterKey: SessionTurnTableRangeFilterKey,
) {
	const step = getRangeStep(filterKey);
	if (options.length === 0) {
		return { maximum: 0, minimum: 0, step };
	}

	let minimum = Number.POSITIVE_INFINITY;
	let maximum = Number.NEGATIVE_INFINITY;
	for (const option of options) {
		const value = getSessionTurnTableRangeValue(option, filterKey);
		minimum = Math.min(minimum, value);
		maximum = Math.max(maximum, value);
	}

	return {
		maximum: normalizeRangeBoundary(maximum, step, "maximum"),
		minimum: normalizeRangeBoundary(minimum, step, "minimum"),
		step,
	};
}

function getRangeStep(filterKey: SessionTurnTableRangeFilterKey) {
	return filterKey === "cost" ? 0.0001 : 1;
}

function normalizeRangeBoundary(
	value: number,
	step: number,
	direction: "maximum" | "minimum",
) {
	const scaledValue = value / step;
	const normalizedValue =
		direction === "minimum"
			? Math.floor(scaledValue) * step
			: Math.ceil(scaledValue) * step;
	const precision = Math.max(0, Math.ceil(-Math.log10(step)));
	return Number(normalizedValue.toFixed(precision));
}

function compareMatches<TOption extends SessionTurnTableOption>(
	leftMatch: IndexedSessionTurnTableOption<TOption>,
	rightMatch: IndexedSessionTurnTableOption<TOption>,
	sortKey: SessionTurnTableSortKey,
) {
	if (sortKey === "time") {
		return leftMatch.index - rightMatch.index;
	}

	if (sortKey === "files") {
		return (
			leftMatch.option.metrics.editedFiles.length -
			rightMatch.option.metrics.editedFiles.length
		);
	}

	if (sortKey === "skills") {
		return (
			leftMatch.option.metrics.skills.length -
			rightMatch.option.metrics.skills.length
		);
	}

	if (sortKey === "commands") {
		return (
			leftMatch.option.slashCommands.length -
			rightMatch.option.slashCommands.length
		);
	}

	return (
		getSessionTurnTableRangeValue(leftMatch.option, sortKey) -
		getSessionTurnTableRangeValue(rightMatch.option, sortKey)
	);
}

function getFileName(filePath: string) {
	return filePath.split(/[\\/]/u).at(-1) || filePath;
}

function compareLabels(leftValue: string, rightValue: string) {
	return leftValue.localeCompare(rightValue, undefined, {
		numeric: true,
		sensitivity: "base",
	});
}
