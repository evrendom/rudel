import { FilterHorizontalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { useId, useRef, useState } from "react";
import { useMountEffect } from "@/app/hooks/useMountEffect";
import {
	Popover,
	PopoverContent,
	PopoverTitle,
	PopoverTrigger,
} from "@/app/ui/popover";
import { SessionOverviewFilterOptionsPanel } from "@/features/sessions/components/sessions-overview-filter-menu";
import {
	formatSessionOverviewRangeValue,
	getToolbarFilterSummary,
	isToolbarFilterActive,
} from "@/features/sessions/components/sessions-overview-filter-state";
import { SessionOverviewLinearFilterFlyout } from "@/features/sessions/components/sessions-overview-linear-filter-flyout";
import {
	LinearActiveFiltersButton,
	LinearFilterList,
	LinearFilterSearch,
} from "@/features/sessions/components/sessions-overview-linear-filter-menu";
import {
	SessionOverviewRangeFilterPanel,
	SessionOverviewTokenRangeFilterPanel,
} from "@/features/sessions/components/sessions-overview-range-filter-menu";
import type {
	SessionOverviewExcludedFilterValues,
	SessionOverviewFilterKey,
	SessionOverviewFilterOption,
	SessionOverviewRangeBounds,
	SessionOverviewRangeFilter,
	SessionOverviewRangeFilterKey,
	SessionOverviewRangeFilterValues,
} from "@/features/sessions/components/sessions-overview-table-utils";
import { SESSION_OVERVIEW_TOOLBAR_FILTERS } from "@/features/sessions/components/sessions-overview-toolbar-filters";
import { useSessionOverviewFilterWheelContainment } from "@/features/sessions/components/use-session-overview-filter-wheel-containment";
import { cn } from "@/lib/utils";

type SelectedFilterKey =
	| SessionOverviewFilterKey
	| SessionOverviewRangeFilterKey
	| "tokens"
	| null;

export function SessionsOverviewFiltersMenu({
	excludedFilterValues,
	filterOptions,
	iconOnly = false,
	variant = "default",
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
	iconOnly?: boolean;
	variant?: "default" | "linear";
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
	const [filterSearchQuery, setFilterSearchQuery] = useState("");
	const [selectedFilterKey, setSelectedFilterKey] =
		useState<SelectedFilterKey>(null);
	const [linearFlyoutRowTop, setLinearFlyoutRowTop] = useState(0);
	const filterListId = useId();
	const { menuRef: linearMenuRef, setMenuElement: setLinearMenuElement } =
		useSessionOverviewFilterWheelContainment();
	const linearFlyoutCloseTimerRef = useRef<ReturnType<
		typeof setTimeout
	> | null>(null);
	const rangeInteractionRef = useRef(false);
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
	const normalizedFilterSearchQuery = filterSearchQuery
		.trim()
		.toLocaleLowerCase();
	const visibleFilters = SESSION_OVERVIEW_TOOLBAR_FILTERS.filter(
		(filter) =>
			normalizedFilterSearchQuery.length === 0 ||
			filter.label.toLocaleLowerCase().includes(normalizedFilterSearchQuery),
	);
	const linearFlyoutHeight = selectedFilter
		? selectedFilter.kind === "options"
			? Math.min(374, 48 + filterOptions[selectedFilter.key].length * 32)
			: selectedFilter.kind === "token-ranges"
				? 242
				: 174
		: 0;
	const linearFlyoutTop = Math.max(
		0,
		Math.min(linearFlyoutRowTop, 374 - linearFlyoutHeight),
	);

	function cancelLinearFlyoutClose() {
		if (linearFlyoutCloseTimerRef.current !== null) {
			clearTimeout(linearFlyoutCloseTimerRef.current);
			linearFlyoutCloseTimerRef.current = null;
		}
	}

	function scheduleLinearFlyoutClose() {
		cancelLinearFlyoutClose();
		if (rangeInteractionRef.current) {
			return;
		}
		linearFlyoutCloseTimerRef.current = setTimeout(() => {
			setSelectedFilterKey(null);
			linearFlyoutCloseTimerRef.current = null;
		}, 250);
	}

	function startRangeInteraction() {
		rangeInteractionRef.current = true;
		cancelLinearFlyoutClose();
	}

	function endRangeInteraction() {
		rangeInteractionRef.current = false;
	}

	useMountEffect(() => cancelLinearFlyoutClose);

	return (
		<Popover
			open={isOpen}
			onOpenChange={(nextOpen, eventDetails) => {
				if (!nextOpen && rangeInteractionRef.current) {
					eventDetails.cancel();
					return;
				}
				setIsOpen(nextOpen);
				if (!nextOpen) {
					cancelLinearFlyoutClose();
					setSelectedFilterKey(null);
					setFilterSearchQuery("");
				}
			}}
		>
			<PopoverTrigger
				type="button"
				aria-label={triggerLabel}
				title={triggerLabel}
				className={cn(
					"relative flex h-7 shrink-0 items-center gap-1.5 rounded-md text-base font-medium tracking-[-0.01em] text-(--session-overview-muted) outline-none hover:bg-(--session-overview-hover) hover:text-(--session-overview-text) focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-(--session-overview-accent) sm:text-sm",
					iconOnly
						? "w-7 justify-center p-0"
						: "bg-(--session-overview-surface) py-1 pr-2 pl-1.5 shadow-[inset_0_0_0_0.5px_#e6e7ea] dark:shadow-[inset_0_0_0_0.5px_rgba(255,255,255,0.1)]",
					activeFilterCount > 0 &&
						"bg-(--session-overview-hover) text-(--session-overview-accent)",
				)}
			>
				<HugeiconsIcon
					aria-hidden="true"
					className="size-4 h-lh shrink-0"
					icon={FilterHorizontalIcon}
					strokeWidth={1.75}
				/>
				{iconOnly ? null : <span>Filter</span>}
				{activeFilterCount > 0 && !iconOnly ? (
					<span className="min-w-4 rounded-full bg-(--session-overview-accent) px-1 text-center text-[10px] leading-4 font-semibold tabular-nums text-white">
						{activeFilterCount}
					</span>
				) : null}
				<span
					aria-hidden="true"
					className="pointer-fine:hidden absolute top-1/2 left-1/2 size-[max(100%,3rem)] -translate-1/2"
				/>
			</PopoverTrigger>
			{variant === "linear" && iconOnly && activeFilterCount > 0 ? (
				<LinearActiveFiltersButton
					count={activeFilterCount}
					onClick={() => {
						setSelectedFilterKey(null);
						setFilterSearchQuery("");
						setIsOpen(true);
					}}
				/>
			) : null}
			<PopoverContent
				align="start"
				sideOffset={6}
				onMouseEnter={() => {
					if (variant === "linear") {
						cancelLinearFlyoutClose();
					}
				}}
				onMouseLeave={(event) => {
					if (
						variant === "linear" &&
						event.buttons === 0 &&
						!rangeInteractionRef.current
					) {
						scheduleLinearFlyoutClose();
					}
				}}
				onKeyDown={(event) => {
					if (
						variant === "linear" &&
						selectedFilter === undefined &&
						event.key.toLocaleLowerCase() === "f" &&
						!(event.target instanceof HTMLInputElement)
					) {
						event.preventDefault();
						document.getElementById(`${filterListId}-search`)?.focus();
					}
				}}
				className={cn(
					"gap-0",
					variant === "linear"
						? "-m-2 h-[390px] w-[222px] overflow-visible rounded-lg bg-transparent p-2 font-sans text-[#2f2f31] shadow-none ring-0 dark:text-[#e2e3e5]"
						: cn(
								"w-80 rounded-xl p-0",
								selectedFilter !== undefined &&
									selectedFilter.kind !== "options"
									? "overflow-visible"
									: "overflow-hidden",
							),
				)}
			>
				{variant === "linear" ? (
					<PopoverTitle className="sr-only">Session filters</PopoverTitle>
				) : null}
				{variant === "linear" ? (
					<div
						ref={setLinearMenuElement}
						className="relative flex h-full flex-col rounded-lg border border-black/10 bg-[#fefeff] dark:border-white/10 dark:bg-[#1c1c1d]"
					>
						<div>
							<LinearFilterSearch
								controlsId={filterListId}
								onChange={(value) => {
									setFilterSearchQuery(value);
									setSelectedFilterKey(null);
								}}
								value={filterSearchQuery}
							/>
						</div>
						<LinearFilterList
							activeFilterKey={selectedFilterKey}
							filters={visibleFilters}
							getFilterSummary={(filter) =>
								isToolbarFilterActive(
									filter,
									excludedFilterValues,
									rangeFilterValues,
								)
									? getToolbarFilterSummary(
											filter,
											excludedFilterValues,
											rangeFilterBounds,
											rangeFilterValues,
										)
									: null
							}
							isFilterActive={(filter) =>
								isToolbarFilterActive(
									filter,
									excludedFilterValues,
									rangeFilterValues,
								)
							}
							listId={filterListId}
							onActivate={(filterKey, row) => {
								setSelectedFilterKey(filterKey);
								const menuBounds =
									linearMenuRef.current?.getBoundingClientRect();
								if (menuBounds) {
									setLinearFlyoutRowTop(
										row.getBoundingClientRect().top - menuBounds.top,
									);
								}
							}}
						/>
						{selectedFilter ? (
							<SessionOverviewLinearFilterFlyout
								excludedFilterValues={excludedFilterValues}
								filter={selectedFilter}
								filterOptions={filterOptions}
								onFilterOptionChecked={onFilterOptionChecked}
								onInteractionEnd={endRangeInteraction}
								onInteractionStart={startRangeInteraction}
								onMouseEnter={cancelLinearFlyoutClose}
								onRangeFilterChange={onRangeFilterChange}
								rangeFilterBounds={rangeFilterBounds}
								rangeFilterValues={rangeFilterValues}
								top={linearFlyoutTop}
							/>
						) : null}
					</div>
				) : (
					<>
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
									} else if (selectedFilter.kind === "token-ranges") {
										onClearRangeFilter("input");
										onClearRangeFilter("output");
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
							) : selectedFilter.kind === "token-ranges" ? (
								<SessionOverviewTokenRangeFilterPanel
									onChange={onRangeFilterChange}
									onInteractionEnd={endRangeInteraction}
									onInteractionStart={startRangeInteraction}
									rangeFilterBounds={rangeFilterBounds}
									rangeFilterValues={rangeFilterValues}
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
									onInteractionEnd={endRangeInteraction}
									onInteractionStart={startRangeInteraction}
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
					</>
				)}
			</PopoverContent>
		</Popover>
	);
}
