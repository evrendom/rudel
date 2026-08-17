import { type Ref, useMemo, useState } from "react";
import {
	type SessionContinuousTurnViewportStore,
	useSessionContinuousTurnTrailingActiveSelection,
	useSessionContinuousTurnVisibleRange,
} from "./session-continuous-turn-viewport-store";
import {
	SessionTurnTable,
	type SessionTurnTableOption,
	type SessionTurnTableSpeaker,
	type SessionTurnTableVirtualizerHandle,
} from "./session-turn-table";
import { SessionTurnTableColumnComposer } from "./session-turn-table-column-composer";
import { SessionTurnTableControls } from "./session-turn-table-filter";
import type { IndexedSessionTurnTableOption } from "./session-turn-table-filters";
import {
	getVisibleSessionTurnSpeaker,
	type SessionTurnSelection,
} from "./session-turn-table-selection";
import { buildSessionTurnTableViewRows } from "./session-turn-table-view-rows";
import { SessionTurnTableSpeakerVisibilityControls } from "./session-turn-table-view-tabs";
import type { SessionTurn } from "./session-turns";
import { useSessionTurnTableControls } from "./use-session-turn-table-controls";

export interface SessionTurnTablePaneOption extends SessionTurnTableOption {
	hasBody?: boolean;
	memberPreview: string;
	preview: string;
	turn?: SessionTurn;
}

export type SessionTurnTablePaneMatch =
	IndexedSessionTurnTableOption<SessionTurnTablePaneOption>;

export function SessionTurnTablePane({
	model,
	onSelect,
	options,
	selection,
	userImageUrl,
	userLabel,
	viewportStore,
	virtualizerRef,
}: {
	model: string | undefined;
	onSelect: (selection: SessionTurnSelection) => void;
	options: readonly SessionTurnTablePaneOption[];
	selection: SessionTurnSelection;
	userImageUrl: string | undefined;
	userLabel: string;
	viewportStore: SessionContinuousTurnViewportStore;
	virtualizerRef?: Ref<SessionTurnTableVirtualizerHandle>;
}) {
	const activeSelection =
		useSessionContinuousTurnTrailingActiveSelection(viewportStore);
	const viewportRange = useSessionContinuousTurnVisibleRange(viewportStore);
	const effectiveSelection = activeSelection ?? selection;
	const [primarySpeaker, setPrimarySpeaker] =
		useState<SessionTurnTableSpeaker>("model");
	const [visibleSpeakers, setVisibleSpeakers] = useState<
		ReadonlySet<SessionTurnTableSpeaker>
	>(() => new Set(["model"]));
	const {
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
	} = useSessionTurnTableControls({
		onSelect: (index) => onSelect({ ...effectiveSelection, index }),
		options,
		selectedIndex: effectiveSelection.index,
	});
	const tableRows = useMemo(
		() =>
			buildSessionTurnTableViewRows(
				visibleMatches,
				visibleSpeakers,
				primarySpeaker,
			),
		[primarySpeaker, visibleMatches, visibleSpeakers],
	);

	function handleVisibleSpeakersChange(
		nextVisibleSpeakers: ReadonlySet<SessionTurnTableSpeaker>,
	) {
		setVisibleSpeakers(nextVisibleSpeakers);
		const nextSpeaker = getVisibleSessionTurnSpeaker(
			effectiveSelection.speaker,
			nextVisibleSpeakers,
		);
		if (nextSpeaker !== effectiveSelection.speaker) {
			onSelect({ ...effectiveSelection, speaker: nextSpeaker });
		}
	}

	return (
		<>
			<SessionTurnTableControls
				actions={
					primarySpeaker === "model" ? (
						<SessionTurnTableColumnComposer
							availableColumns={availableColumnKeys}
							onVisibleColumnsChange={setVisibleColumnKeys}
							visibleColumns={effectiveVisibleColumnKeys}
						/>
					) : null
				}
				activeSortLabel={activeSortLabel}
				className={undefined}
				excludedFilterValues={excludedFilterValues}
				filterOptions={filterOptions}
				onClearAll={clearAllFilters}
				onClearFilter={clearFilter}
				onClearRangeFilter={clearRangeFilter}
				onFilterOptionChecked={setFilterOptionChecked}
				onRangeFilterChange={setRangeFilter}
				onToggleSortDirection={toggleSortDirection}
				rangeFilterBounds={rangeFilterBounds}
				rangeFilterValues={rangeFilterValues}
				resultCount={visibleMatches.length}
				sort={sort}
				totalCount={options.length}
				viewControls={
					<SessionTurnTableSpeakerVisibilityControls
						className={undefined}
						model={model}
						onPrimarySpeakerChange={setPrimarySpeaker}
						onVisibleSpeakersChange={handleVisibleSpeakersChange}
						primarySpeaker={primarySpeaker}
						userImageUrl={userImageUrl}
						visibleSpeakers={visibleSpeakers}
					/>
				}
			/>
			<div className="flex min-h-0 flex-1 flex-col">
				<SessionTurnTable
					hasActiveFilters={hasActiveFilters}
					model={model}
					onPrimarySpeakerChange={setPrimarySpeaker}
					onSort={handleSort}
					onSelect={onSelect}
					options={options}
					primarySpeaker={primarySpeaker}
					rows={tableRows}
					selection={effectiveSelection}
					sort={sort}
					userImageUrl={userImageUrl}
					userLabel={userLabel}
					visibleColumnKeys={effectiveVisibleColumnKeys}
					visibleOptions={visibleMatches}
					visibleSpeakers={visibleSpeakers}
					viewportRange={viewportRange}
					virtualizerRef={virtualizerRef}
				/>
			</div>
		</>
	);
}
