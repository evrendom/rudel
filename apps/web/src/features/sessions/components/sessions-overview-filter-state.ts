import type {
	SessionOverviewExcludedFilterValues,
	SessionOverviewFilterKey,
	SessionOverviewRangeBounds,
	SessionOverviewRangeFilterKey,
	SessionOverviewRangeFilterValues,
} from "@/features/sessions/components/sessions-overview-table-utils";
import {
	formatCompactNumber,
	formatCurrency,
	formatRoundedDuration,
} from "@/lib/format";

type ToolbarFilterDescriptor =
	| { key: SessionOverviewFilterKey; kind: "options" }
	| { key: SessionOverviewRangeFilterKey; kind: "range" }
	| { key: "tokens"; kind: "token-ranges" };

export function isToolbarFilterActive(
	filter: ToolbarFilterDescriptor,
	excludedFilterValues: SessionOverviewExcludedFilterValues,
	rangeFilterValues: SessionOverviewRangeFilterValues,
) {
	if (filter.kind === "token-ranges") {
		return (["input", "output"] as const).some((filterKey) => {
			const range = rangeFilterValues[filterKey];
			return range.minimum !== null || range.maximum !== null;
		});
	}

	if (filter.kind === "options") {
		return excludedFilterValues[filter.key].size > 0;
	}

	const range = rangeFilterValues[filter.key];
	return range.minimum !== null || range.maximum !== null;
}

export function getToolbarFilterSummary(
	filter: ToolbarFilterDescriptor,
	excludedFilterValues: SessionOverviewExcludedFilterValues,
	rangeFilterBounds: SessionOverviewRangeBounds,
	rangeFilterValues: SessionOverviewRangeFilterValues,
) {
	if (filter.kind === "token-ranges") {
		return (["input", "output"] as const)
			.map((filterKey) => {
				const label = filterKey === "input" ? "In" : "Out";
				return `${label} ${getRangeFilterSummary(
					filterKey,
					rangeFilterBounds,
					rangeFilterValues,
				)}`;
			})
			.join(" · ");
	}

	if (filter.kind === "options") {
		const excludedCount = excludedFilterValues[filter.key].size;
		return excludedCount > 0
			? `${excludedCount.toLocaleString()} excluded`
			: "All values";
	}

	return getRangeFilterSummary(
		filter.key,
		rangeFilterBounds,
		rangeFilterValues,
	);
}

function getRangeFilterSummary(
	filterKey: SessionOverviewRangeFilterKey,
	rangeFilterBounds: SessionOverviewRangeBounds,
	rangeFilterValues: SessionOverviewRangeFilterValues,
) {
	const range = rangeFilterValues[filterKey];
	if (range.minimum === null && range.maximum === null) {
		return "Any range";
	}

	const bounds = rangeFilterBounds[filterKey];
	return `${formatSessionOverviewRangeValue(
		filterKey,
		range.minimum ?? bounds.minimum,
	)}–${formatSessionOverviewRangeValue(
		filterKey,
		range.maximum ?? bounds.maximum,
	)}`;
}

export function formatSessionOverviewRangeValue(
	filterKey: SessionOverviewRangeFilterKey,
	value: number,
) {
	switch (filterKey) {
		case "input":
		case "output":
			return formatCompactNumber(value);
		case "cost":
			return formatCurrency(value);
		case "duration":
			return formatRoundedDuration(value);
		case "subagents":
		case "errors":
			return value.toLocaleString();
	}
}
