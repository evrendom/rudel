import { Activity, ListTree } from "lucide-react";
import { type RefObject, useEffectEvent, useId, useState } from "react";
import { useMountEffect } from "@/app/hooks/useMountEffect";
import { cn } from "@/lib/utils";
import { SessionContinuousTurnThread } from "./session-continuous-turn-thread";
import type { buildSessionDetailViewModel } from "./session-detail-view-model";
import type { SelectedTurnOption } from "./session-selected-turn";
import { SessionTracePane } from "./session-trace-pane";
import { SessionTurnLensChips } from "./session-turn-lens-chips";
import type { SessionTurnLensInput } from "./session-turn-lenses";
import { SessionTurnMetricSwitcher } from "./session-turn-metric-switcher";
import { SessionTurnMinimap } from "./session-turn-minimap";
import { SessionTurnStickyHeader } from "./session-turn-sticky-header";
import { SessionTurnTable } from "./session-turn-table";
import { SessionTurnTableColumnComposer } from "./session-turn-table-column-composer";
import { SessionTurnTableControls } from "./session-turn-table-filter";
import { SessionTurnTableVisibilityButton } from "./session-turn-table-visibility-button";
import {
	type SessionTurnV2PaneTab,
	useSessionTurnV2State,
} from "./use-session-turn-v2-state";

type SessionDetailViewModel = ReturnType<typeof buildSessionDetailViewModel>;
type SessionTurnV2Option = SelectedTurnOption & SessionTurnLensInput;

function isEditableTarget(target: EventTarget | null) {
	if (!(target instanceof HTMLElement)) {
		return false;
	}
	return (
		target.isContentEditable ||
		target.closest(
			'input, textarea, select, [contenteditable="true"], [role="textbox"], [role="menu"]',
		) !== null
	);
}

export function SessionTurnV2Layout({
	activeIndex,
	bottomPaddingClassName,
	onContinuousTurnFocus,
	onSelect,
	options,
	responseScrollRef,
	turnTableSectionRef,
	userImageUrl,
	viewModel,
}: {
	activeIndex: number;
	bottomPaddingClassName: string;
	onContinuousTurnFocus: (index: number) => void;
	onSelect: (index: number) => void;
	options: readonly SessionTurnV2Option[];
	responseScrollRef: RefObject<HTMLDivElement | null>;
	turnTableSectionRef: RefObject<HTMLElement | null>;
	userImageUrl: string | undefined;
	viewModel: SessionDetailViewModel;
}) {
	const tableId = useId();
	const [tableCollapsed, setTableCollapsed] = useState(false);
	const [viewportRange, setViewportRange] = useState<
		readonly [number, number] | undefined
	>();
	const state = useSessionTurnV2State({
		onSelect,
		options,
		selectedIndex: activeIndex,
	});

	function revealTurn(index: number) {
		const hiddenSegment = state.threadSegments.find(
			(segment) => segment.type === "hidden" && segment.indices.includes(index),
		);
		if (hiddenSegment?.type === "hidden") {
			state.toggleHiddenSegment(hiddenSegment.key);
		}
		state.revealContainingEpisode(index);
		window.requestAnimationFrame(() => {
			window.requestAnimationFrame(() => onSelect(index));
		});
	}

	const handleLensNavigation = useEffectEvent((event: KeyboardEvent) => {
		if (
			event.defaultPrevented ||
			event.metaKey ||
			event.ctrlKey ||
			event.altKey ||
			isEditableTarget(event.target) ||
			(event.key !== "n" && event.key !== "p") ||
			!state.activeLensId
		) {
			return;
		}

		const indices = [...(state.matchedIndices ?? [])].sort(
			(left, right) => left - right,
		);
		if (indices.length === 0) {
			return;
		}
		event.preventDefault();
		const currentPosition = indices.indexOf(activeIndex);
		const direction = event.key === "n" ? 1 : -1;
		const nextPosition =
			(currentPosition + direction + indices.length) % indices.length;
		const nextIndex = indices[nextPosition];
		if (nextIndex !== undefined) {
			revealTurn(nextIndex);
		}
	});

	useMountEffect(() => {
		window.addEventListener("keydown", handleLensNavigation);
		return () => window.removeEventListener("keydown", handleLensNavigation);
	});

	return (
		<div
			className={cn(
				"grid h-full min-h-0 min-w-0 transition-[grid-template-columns] duration-300 ease-out motion-reduce:transition-none",
				tableCollapsed
					? "grid-cols-[0_minmax(0,1fr)]"
					: "grid-cols-[minmax(30rem,36rem)_minmax(24rem,1fr)]",
			)}
		>
			<section
				ref={turnTableSectionRef}
				id={tableId}
				aria-hidden={tableCollapsed || undefined}
				aria-label="Turn explorer"
				inert={tableCollapsed}
				className={cn(
					"flex min-h-0 min-w-0 flex-col overflow-hidden bg-(--session-overview-surface)",
					!tableCollapsed && "border-r border-(--session-overview-border)",
				)}
			>
				<SessionTurnV2Tabs onChange={state.setPaneTab} value={state.paneTab} />
				<SessionTurnLensChips
					activeLensId={state.activeLensId}
					onToggle={state.toggleLens}
					options={options}
				/>
				{state.paneTab === "turns" ? (
					<>
						<SessionTurnTableControls
							activeSortLabel={state.controls.activeSortLabel}
							actions={
								<>
									<SessionTurnTableColumnComposer
										availableColumns={state.controls.availableColumnKeys}
										onVisibleColumnsChange={state.controls.setVisibleColumnKeys}
										visibleColumns={state.controls.effectiveVisibleColumnKeys}
									/>
									<SessionTurnTableVisibilityButton
										controlsId={tableId}
										expanded
										onClick={() => setTableCollapsed(true)}
									/>
								</>
							}
							className={undefined}
							excludedFilterValues={state.controls.excludedFilterValues}
							filterOptions={state.controls.filterOptions}
							onClearAll={state.controls.clearAllFilters}
							onClearFilter={state.controls.clearFilter}
							onClearRangeFilter={state.controls.clearRangeFilter}
							onFilterOptionChecked={state.controls.setFilterOptionChecked}
							onRangeFilterChange={state.controls.setRangeFilter}
							onToggleSortDirection={state.controls.toggleSortDirection}
							rangeFilterBounds={state.controls.rangeFilterBounds}
							rangeFilterValues={state.controls.rangeFilterValues}
							resultCount={state.visibleMatches.length}
							sort={state.controls.sort}
							totalCount={options.length}
							viewControls={
								<SessionTurnMetricSwitcher
									metric={state.metric}
									onChange={state.setMetric}
								/>
							}
						/>
						<SessionTurnTable
							collapsedEpisodeKeys={state.collapsedEpisodeKeys}
							episodes={state.episodes}
							hasActiveFilters={
								state.controls.hasActiveFilters ||
								state.activeLensId !== undefined
							}
							matchedIndices={state.lensMatches}
							onEpisodeToggle={state.toggleEpisode}
							onSelect={revealTurn}
							onSort={state.controls.handleSort}
							options={options}
							selectedIndex={activeIndex}
							sort={state.controls.sort}
							visibleColumnKeys={state.controls.effectiveVisibleColumnKeys}
							visibleOptions={state.visibleMatches}
							viewportRange={viewportRange}
						/>
					</>
				) : (
					<SessionTracePane
						matchedIndices={state.matchedIndices}
						metric={state.metric}
						mode={state.traceMode}
						onMetricChange={state.setMetric}
						onModeChange={state.setTraceMode}
						onReveal={revealTurn}
						options={options}
						selectedIndex={activeIndex}
					/>
				)}
			</section>

			<section
				aria-label="Conversation explorer"
				className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-(--session-overview-surface)"
			>
				<SessionTurnStickyHeader
					activeLensId={state.activeLensId}
					leadingControl={
						tableCollapsed ? (
							<SessionTurnTableVisibilityButton
								controlsId={tableId}
								expanded={false}
								onClick={() => setTableCollapsed(false)}
							/>
						) : null
					}
					option={options[activeIndex]}
				/>
				<div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
					<div
						ref={responseScrollRef}
						className={cn(
							"min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-none",
							bottomPaddingClassName,
						)}
					>
						<SessionContinuousTurnThread
							activeIndex={activeIndex}
							collapsedEpisodeKeys={state.collapsedEpisodeKeys}
							episodes={state.episodes}
							onActiveIndexChange={onContinuousTurnFocus}
							onToggleEpisode={state.toggleEpisode}
							onToggleHiddenSegment={state.toggleHiddenSegment}
							onViewportChange={(_, range) => setViewportRange(range)}
							options={options}
							scrollContainerRef={responseScrollRef}
							segments={state.threadSegments}
							userImageUrl={userImageUrl}
							viewModel={viewModel}
						/>
					</div>
					<SessionTurnMinimap
						activeIndex={activeIndex}
						matchedIndices={state.matchedIndices}
						metric={state.metric}
						onReveal={revealTurn}
						options={options}
						visibleRange={viewportRange}
					/>
				</div>
			</section>
		</div>
	);
}

function SessionTurnV2Tabs({
	onChange,
	value,
}: {
	onChange: (tab: SessionTurnV2PaneTab) => void;
	value: SessionTurnV2PaneTab;
}) {
	const tabs = [
		{ icon: ListTree, label: "Turns", value: "turns" },
		{ icon: Activity, label: "Trace", value: "trace" },
	] as const;

	return (
		<div
			role="tablist"
			aria-label="Turn explorer view"
			className="flex h-10 shrink-0 items-center gap-1 border-b border-(--session-overview-border) px-3"
		>
			{tabs.map((tab) => {
				const selected = tab.value === value;
				const Icon = tab.icon;
				return (
					<button
						key={tab.value}
						type="button"
						role="tab"
						aria-selected={selected}
						className={cn(
							"relative flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--session-overview-accent)",
							selected
								? "bg-(--session-overview-hover) text-(--session-overview-text)"
								: "text-(--session-overview-muted) hover:text-(--session-overview-text)",
						)}
						onClick={() => onChange(tab.value)}
					>
						<Icon aria-hidden="true" className="size-4" />
						{tab.label}
					</button>
				);
			})}
		</div>
	);
}
