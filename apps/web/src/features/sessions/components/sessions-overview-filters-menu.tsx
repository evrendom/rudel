import { ArrowLeft, ChevronRight, ListFilter } from "lucide-react";
import { useState } from "react";
import {
	Popover,
	PopoverContent,
	PopoverTitle,
	PopoverTrigger,
} from "@/app/ui/popover";
import { SessionOverviewFilterOptionsPanel } from "@/features/sessions/components/sessions-overview-filter-menu";
import { SessionOverviewRangeFilterPanel } from "@/features/sessions/components/sessions-overview-range-filter-menu";
import type {
	SessionOverviewExcludedFilterValues,
	SessionOverviewFilterKey,
	SessionOverviewFilterOption,
	SessionOverviewRangeBounds,
	SessionOverviewRangeFilter,
	SessionOverviewRangeFilterKey,
	SessionOverviewRangeFilterValues,
} from "@/features/sessions/components/sessions-overview-table-utils";
import {
	formatCompactNumber,
	formatCurrency,
	formatRoundedDuration,
} from "@/lib/format";
import { cn } from "@/lib/utils";

type ToolbarFilterItem =
	| {
			kind: "options";
			key: SessionOverviewFilterKey;
			label: string;
	  }
	| {
			kind: "range";
			key: SessionOverviewRangeFilterKey;
			label: string;
	  };

const SESSION_OVERVIEW_TOOLBAR_FILTERS = [
	{ key: "repository", kind: "options", label: "Repository" },
	{ key: "user", kind: "options", label: "Member" },
	{ key: "model", kind: "options", label: "Model" },
	{ key: "tokens", kind: "range", label: "Tokens" },
	{ key: "cost", kind: "range", label: "Cost" },
	{ key: "subagents", kind: "range", label: "Subagents Used" },
	{ key: "errors", kind: "range", label: "Tool/API Errors" },
	{ key: "duration", kind: "range", label: "Duration" },
	{ key: "skills", kind: "options", label: "Skills Used" },
] satisfies readonly ToolbarFilterItem[];

type SelectedFilterKey =
	| SessionOverviewFilterKey
	| SessionOverviewRangeFilterKey
	| null;

export function SessionsOverviewFiltersMenu({
	excludedFilterValues,
	filterOptions,
	onClearAll,
	onClearFilter,
	onClearRangeFilter,
	onFilterOptionChecked,
	onRangeFilterChange,
	rangeFilterBounds,
	rangeFilterValues,
}: {
	excludedFilterValues: SessionOverviewExcludedFilterValues;
	filterOptions: Record<
		SessionOverviewFilterKey,
		readonly SessionOverviewFilterOption[]
	>;
	onClearAll: () => void;
	onClearFilter: (filterKey: SessionOverviewFilterKey) => void;
	onClearRangeFilter: (filterKey: SessionOverviewRangeFilterKey) => void;
	onFilterOptionChecked: (
		filterKey: SessionOverviewFilterKey,
		value: string,
		checked: boolean,
	) => void;
	onRangeFilterChange: (
		filterKey: SessionOverviewRangeFilterKey,
		value: SessionOverviewRangeFilter,
	) => void;
	rangeFilterBounds: SessionOverviewRangeBounds;
	rangeFilterValues: SessionOverviewRangeFilterValues;
}) {
	const [isOpen, setIsOpen] = useState(false);
	const [selectedFilterKey, setSelectedFilterKey] =
		useState<SelectedFilterKey>(null);
	const selectedFilter = SESSION_OVERVIEW_TOOLBAR_FILTERS.find(
		(filter) => filter.key === selectedFilterKey,
	);
	const activeFilterCount = SESSION_OVERVIEW_TOOLBAR_FILTERS.reduce(
		(count, filter) =>
			count +
			(isToolbarFilterActive(filter, excludedFilterValues, rangeFilterValues)
				? 1
				: 0),
		0,
	);
	const triggerLabel =
		activeFilterCount > 0
			? `Filter sessions, ${activeFilterCount} active`
			: "Filter sessions";

	return (
		<Popover
			open={isOpen}
			onOpenChange={(nextOpen) => {
				setIsOpen(nextOpen);
				if (!nextOpen) {
					setSelectedFilterKey(null);
				}
			}}
		>
			<PopoverTrigger
				type="button"
				aria-label={triggerLabel}
				title={triggerLabel}
				className={cn(
					"relative flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-(--session-overview-surface) py-1 pr-2 pl-1.5 text-base font-medium tracking-[-0.01em] text-(--session-overview-muted) shadow-[inset_0_0_0_1px_#e6e7ea] outline-none hover:bg-(--session-overview-hover) hover:text-(--session-overview-text) focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-(--session-overview-accent) sm:h-7 sm:text-sm dark:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.1)]",
					activeFilterCount > 0 &&
						"bg-(--session-overview-hover) text-(--session-overview-accent)",
				)}
			>
				<ListFilter aria-hidden="true" className="size-4 h-lh shrink-0" />
				<span>Filter</span>
				{activeFilterCount > 0 ? (
					<span className="min-w-4 rounded-full bg-(--session-overview-accent) px-1 text-center text-[10px] leading-4 font-semibold tabular-nums text-white">
						{activeFilterCount}
					</span>
				) : null}
				<span
					aria-hidden="true"
					className="pointer-fine:hidden absolute top-1/2 left-1/2 size-[max(100%,3rem)] -translate-1/2"
				/>
			</PopoverTrigger>
			<PopoverContent
				align="start"
				sideOffset={6}
				className="w-80 gap-0 overflow-hidden rounded-xl p-0"
			>
				<div className="flex h-11 items-center justify-between gap-2 border-b border-border/60 px-2.5">
					<div className="flex min-w-0 items-center gap-1.5">
						{selectedFilter ? (
							<button
								type="button"
								aria-label="Back to all filters"
								className="relative flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
								onClick={() => setSelectedFilterKey(null)}
							>
								<ArrowLeft aria-hidden="true" className="size-4" />
								<span
									aria-hidden="true"
									className="pointer-fine:hidden absolute top-1/2 left-1/2 size-12 -translate-1/2"
								/>
							</button>
						) : null}
						<PopoverTitle className="truncate text-sm font-semibold">
							{selectedFilter ? selectedFilter.label : "Filters"}
						</PopoverTitle>
					</div>
					<button
						type="button"
						aria-label={
							selectedFilter
								? `Clear ${selectedFilter.label} filter`
								: "Clear all filters"
						}
						className="shrink-0 rounded-md px-1.5 py-1 text-xs font-medium text-primary outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-40"
						disabled={
							selectedFilter
								? !isToolbarFilterActive(
										selectedFilter,
										excludedFilterValues,
										rangeFilterValues,
									)
								: activeFilterCount === 0
						}
						onClick={() => {
							if (!selectedFilter) {
								onClearAll();
								return;
							}

							if (selectedFilter.kind === "options") {
								onClearFilter(selectedFilter.key);
							} else {
								onClearRangeFilter(selectedFilter.key);
							}
						}}
					>
						{selectedFilter ? "Clear" : "Clear all"}
					</button>
				</div>

				{selectedFilter ? (
					selectedFilter.kind === "options" ? (
						<SessionOverviewFilterOptionsPanel
							key={selectedFilter.key}
							excludedValues={excludedFilterValues[selectedFilter.key]}
							label={selectedFilter.label}
							onOptionChecked={(value, checked) =>
								onFilterOptionChecked(selectedFilter.key, value, checked)
							}
							options={filterOptions[selectedFilter.key]}
						/>
					) : (
						<SessionOverviewRangeFilterPanel
							bounds={rangeFilterBounds[selectedFilter.key]}
							formatValue={(value) =>
								formatSessionOverviewRangeValue(selectedFilter.key, value)
							}
							label={selectedFilter.label}
							onChange={(value) =>
								onRangeFilterChange(selectedFilter.key, value)
							}
							value={rangeFilterValues[selectedFilter.key]}
						/>
					)
				) : (
					<div className="max-h-96 overflow-y-auto p-1.5">
						{SESSION_OVERVIEW_TOOLBAR_FILTERS.map((filter) => {
							const isActive = isToolbarFilterActive(
								filter,
								excludedFilterValues,
								rangeFilterValues,
							);

							return (
								<button
									key={filter.key}
									type="button"
									aria-label={`Configure ${filter.label} filter`}
									className="flex min-h-9 w-full items-center gap-3 rounded-lg px-2.5 py-1.5 text-left text-sm font-medium outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
									onClick={() => setSelectedFilterKey(filter.key)}
								>
									<span className="min-w-0 flex-1 truncate">
										{filter.label}
									</span>
									<span
										className={cn(
											"max-w-32 truncate text-xs font-normal tabular-nums text-muted-foreground",
											isActive && "text-primary",
										)}
									>
										{getToolbarFilterSummary(
											filter,
											excludedFilterValues,
											rangeFilterBounds,
											rangeFilterValues,
										)}
									</span>
									<ChevronRight
										aria-hidden="true"
										className="size-4 shrink-0 text-muted-foreground"
									/>
								</button>
							);
						})}
					</div>
				)}
			</PopoverContent>
		</Popover>
	);
}

function isToolbarFilterActive(
	filter: ToolbarFilterItem,
	excludedFilterValues: SessionOverviewExcludedFilterValues,
	rangeFilterValues: SessionOverviewRangeFilterValues,
) {
	if (filter.kind === "options") {
		return excludedFilterValues[filter.key].size > 0;
	}

	const range = rangeFilterValues[filter.key];
	return range.minimum !== null || range.maximum !== null;
}

function getToolbarFilterSummary(
	filter: ToolbarFilterItem,
	excludedFilterValues: SessionOverviewExcludedFilterValues,
	rangeFilterBounds: SessionOverviewRangeBounds,
	rangeFilterValues: SessionOverviewRangeFilterValues,
) {
	if (filter.kind === "options") {
		const excludedCount = excludedFilterValues[filter.key].size;
		return excludedCount > 0
			? `${excludedCount.toLocaleString()} excluded`
			: "All values";
	}

	const range = rangeFilterValues[filter.key];
	if (range.minimum === null && range.maximum === null) {
		return "Any range";
	}

	const bounds = rangeFilterBounds[filter.key];
	return `${formatSessionOverviewRangeValue(
		filter.key,
		range.minimum ?? bounds.minimum,
	)}–${formatSessionOverviewRangeValue(
		filter.key,
		range.maximum ?? bounds.maximum,
	)}`;
}

function formatSessionOverviewRangeValue(
	filterKey: SessionOverviewRangeFilterKey,
	value: number,
) {
	switch (filterKey) {
		case "tokens":
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
