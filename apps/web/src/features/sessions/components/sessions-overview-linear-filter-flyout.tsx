import { SessionOverviewFilterOptionsPanel } from "@/features/sessions/components/sessions-overview-filter-menu";
import { formatSessionOverviewRangeValue } from "@/features/sessions/components/sessions-overview-filter-state";
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

type LinearFlyoutFilter =
	| {
			key: SessionOverviewFilterKey;
			kind: "options";
			label: string;
	  }
	| {
			key: SessionOverviewRangeFilterKey;
			kind: "range";
			label: string;
	  }
	| {
			key: "tokens";
			kind: "token-ranges";
			label: string;
	  };

export function SessionOverviewLinearFilterFlyout({
	excludedFilterValues,
	filter,
	filterOptions,
	onFilterOptionChecked,
	onInteractionEnd,
	onInteractionStart,
	onMouseEnter,
	onRangeFilterChange,
	rangeFilterBounds,
	rangeFilterValues,
	top,
}: {
	excludedFilterValues: SessionOverviewExcludedFilterValues;
	filter: LinearFlyoutFilter;
	filterOptions: Record<
		SessionOverviewFilterKey,
		readonly SessionOverviewFilterOption[]
	>;
	onFilterOptionChecked: (
		filterKey: SessionOverviewFilterKey,
		value: string,
		checked: boolean,
	) => void;
	onInteractionEnd: () => void;
	onInteractionStart: () => void;
	onMouseEnter: () => void;
	onRangeFilterChange: (
		filterKey: SessionOverviewRangeFilterKey,
		value: SessionOverviewRangeFilter,
	) => void;
	rangeFilterBounds: SessionOverviewRangeBounds;
	rangeFilterValues: SessionOverviewRangeFilterValues;
	top: number;
}) {
	return (
		<div className="absolute left-full z-10 -m-2 p-2 pl-3" style={{ top }}>
			<div
				role="dialog"
				aria-label={`${filter.label} filter`}
				className={`flex max-h-[374px] w-[216px] flex-col rounded-xl border border-black/10 bg-[#fefeff] text-[#2f2f31] shadow-[0_12px_30px_rgba(0,0,0,0.12),0_2px_8px_rgba(0,0,0,0.08)] animate-in fade-in-0 zoom-in-95 slide-in-from-left-1 duration-100 dark:border-white/10 dark:bg-[#1c1c1d] dark:text-[#e2e3e5] ${filter.kind === "options" ? "overflow-hidden" : "overflow-visible"}`}
				onMouseEnter={onMouseEnter}
			>
				{filter.kind === "options" ? (
					<SessionOverviewFilterOptionsPanel
						key={filter.key}
						excludedValues={excludedFilterValues[filter.key]}
						label={filter.label}
						onOptionChecked={(value, checked) =>
							onFilterOptionChecked(filter.key, value, checked)
						}
						options={filterOptions[filter.key]}
						variant="linear-side"
					/>
				) : filter.kind === "token-ranges" ? (
					<>
						<div className="flex h-9 shrink-0 items-center border-b border-black/6 px-2.5 text-[0.8125rem]/5 font-[500] dark:border-white/8">
							{filter.label}
						</div>
						<SessionOverviewTokenRangeFilterPanel
							onChange={onRangeFilterChange}
							onInteractionEnd={onInteractionEnd}
							onInteractionStart={onInteractionStart}
							rangeFilterBounds={rangeFilterBounds}
							rangeFilterValues={rangeFilterValues}
							variant="linear"
						/>
					</>
				) : (
					<>
						<div className="flex h-9 shrink-0 items-center border-b border-black/6 px-2.5 text-[0.8125rem]/5 font-[500] dark:border-white/8">
							{filter.label}
						</div>
						<SessionOverviewRangeFilterPanel
							bounds={rangeFilterBounds[filter.key]}
							formatValue={(value) =>
								formatSessionOverviewRangeValue(filter.key, value)
							}
							label={filter.label}
							onChange={(value) => onRangeFilterChange(filter.key, value)}
							onInteractionEnd={onInteractionEnd}
							onInteractionStart={onInteractionStart}
							value={rangeFilterValues[filter.key]}
							variant="linear"
						/>
					</>
				)}
			</div>
		</div>
	);
}
