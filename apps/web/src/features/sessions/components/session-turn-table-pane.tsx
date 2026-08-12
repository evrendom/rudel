import { useId, useMemo, useState } from "react";
import type {
	SessionAdalineMessageRow,
	SessionAdalineMessageSpeaker,
} from "./session-adaline-message-rows";
import { SessionAdalineMessageTable } from "./session-adaline-message-table";
import {
	SessionTurnTable,
	type SessionTurnTableOption,
} from "./session-turn-table";
import { SessionTurnTableColumnComposer } from "./session-turn-table-column-composer";
import { SessionTurnTableControls } from "./session-turn-table-filter";
import type { IndexedSessionTurnTableOption } from "./session-turn-table-filters";
import { buildSessionTurnTableViewRows } from "./session-turn-table-view-rows";
import {
	type SessionTurnTableView,
	SessionTurnTableViewTabs,
} from "./session-turn-table-view-tabs";
import { SessionTurnTableVisibilityButton } from "./session-turn-table-visibility-button";
import type { SessionTurn } from "./session-turns";
import { useSessionTurnTableControls } from "./use-session-turn-table-controls";

export interface SessionTurnTablePaneOption extends SessionTurnTableOption {
	memberPreview: string;
	preview: string;
	turn?: SessionTurn;
}

export type SessionTurnTablePaneMatch =
	IndexedSessionTurnTableOption<SessionTurnTablePaneOption>;

export function SessionTurnTablePane({
	collapseControlsId,
	model,
	onCollapse,
	onSelect,
	onSelectMessage,
	options,
	selectedIndex,
	selectedMessageKey,
	selectedMessageSpeaker,
	showMessageRows,
	userImageUrl,
	userLabel,
}: {
	collapseControlsId: string | undefined;
	model: string | undefined;
	onCollapse: (() => void) | undefined;
	onSelect: (index: number) => void;
	onSelectMessage?: (row: SessionAdalineMessageRow) => void;
	options: readonly SessionTurnTablePaneOption[];
	selectedIndex: number;
	selectedMessageKey?: string;
	selectedMessageSpeaker?: SessionAdalineMessageSpeaker;
	showMessageRows: boolean;
	userImageUrl: string | undefined;
	userLabel: string;
}) {
	const panelId = useId();
	const tabIdPrefix = useId();
	const [activeView, setActiveView] = useState<SessionTurnTableView>("model");
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
	} = useSessionTurnTableControls({ onSelect, options, selectedIndex });
	const tableRows = useMemo(
		() => buildSessionTurnTableViewRows(visibleMatches, activeView),
		[activeView, visibleMatches],
	);

	return (
		<>
			<SessionTurnTableControls
				actions={
					<>
						{activeView !== "member" ? (
							<SessionTurnTableColumnComposer
								availableColumns={availableColumnKeys}
								onVisibleColumnsChange={setVisibleColumnKeys}
								visibleColumns={effectiveVisibleColumnKeys}
							/>
						) : null}
						{collapseControlsId && onCollapse ? (
							<SessionTurnTableVisibilityButton
								controlsId={collapseControlsId}
								expanded
								onClick={onCollapse}
							/>
						) : null}
					</>
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
					<SessionTurnTableViewTabs
						activeView={activeView}
						className={undefined}
						onViewChange={setActiveView}
						panelId={panelId}
						tabIdPrefix={tabIdPrefix}
					/>
				}
			/>
			<div
				role="tabpanel"
				id={panelId}
				aria-labelledby={`${tabIdPrefix}-${activeView}`}
				className="flex min-h-0 flex-1 flex-col"
			>
				{activeView === "model" && showMessageRows ? (
					<SessionAdalineMessageTable
						hasActiveFilters={hasActiveFilters}
						matchedIndices={undefined}
						model={model}
						onSelect={(row) =>
							onSelectMessage ? onSelectMessage(row) : onSelect(row.match.index)
						}
						onSort={handleSort}
						options={options}
						selectedIndex={selectedIndex}
						selectedKey={selectedMessageKey}
						selectedSpeaker={selectedMessageSpeaker}
						sort={sort}
						userImageUrl={userImageUrl}
						userLabel={userLabel}
						viewportRange={undefined}
						visibleColumnKeys={effectiveVisibleColumnKeys}
						visibleOptions={visibleMatches}
					/>
				) : (
					<SessionTurnTable
						hasActiveFilters={hasActiveFilters}
						model={model}
						onSort={handleSort}
						onSelect={onSelect}
						options={options}
						rows={tableRows}
						selectedIndex={selectedIndex}
						sort={sort}
						tableView={activeView}
						userImageUrl={userImageUrl}
						userLabel={userLabel}
						visibleColumnKeys={effectiveVisibleColumnKeys}
						visibleOptions={visibleMatches}
					/>
				)}
			</div>
		</>
	);
}
