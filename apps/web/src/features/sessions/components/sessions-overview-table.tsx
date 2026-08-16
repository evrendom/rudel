import type { SessionAnalytics } from "@rudel/api-routes";
import { ArrowDownWideNarrow, ChevronDown, ChevronUp } from "lucide-react";
import { type Ref, useCallback, useRef, useState } from "react";
import { useLoadMoreIntersectionObserver } from "@/app/hooks/useLoadMoreIntersectionObserver";
import { DashboardDateControls } from "@/features/dashboard/components/DashboardDateControls";
import { useUserMap } from "@/features/workspace/hooks/useUserMap";
import { formatUsername } from "@/lib/format";
import { cn } from "@/lib/utils";
import { SessionsOverviewFiltersMenu } from "./sessions-overview-filters-menu";
import { SessionsOverviewFooter } from "./sessions-overview-footer";
import { SessionsOverviewFrozenEdgeShadow } from "./sessions-overview-frozen-edge-shadow";
import { SessionsOverviewHeader } from "./sessions-overview-header";
import { SessionsOverviewRow } from "./sessions-overview-row";
import { getContainedWheelScroll } from "./sessions-overview-scroll";
import { SessionsOverviewSkeleton } from "./sessions-overview-skeleton";
import { SESSION_OVERVIEW_MIN_WIDTH_CLASS_NAME } from "./sessions-overview-table-utils";
import { useSessionsOverviewTableState } from "./use-sessions-overview-table-state";

type SessionsOverviewTableProps = {
	activeSessionId: string | null | undefined;
	canOpenSession: ((session: SessionAnalytics) => boolean) | undefined;
	getSessionHref: ((session: SessionAnalytics) => string) | undefined;
	getSessionLinkState: ((session: SessionAnalytics) => unknown) | undefined;
	isLoading: boolean;
	onSessionClick: ((session: SessionAnalytics) => void) | undefined;
	scrollContainerRef: Ref<HTMLDivElement> | undefined;
	sessionCountLabel: number;
	sessions: readonly SessionAnalytics[] | undefined;
	sessionDetailDisabledNote: string | undefined;
	totalSessionCount: number;
};

export function SessionsOverviewTable({
	activeSessionId,
	canOpenSession,
	getSessionHref,
	getSessionLinkState,
	isLoading,
	onSessionClick,
	scrollContainerRef,
	sessionCountLabel,
	sessions,
	sessionDetailDisabledNote,
	totalSessionCount,
}: SessionsOverviewTableProps) {
	const [isFrozenEdgeShadowVisible, setIsFrozenEdgeShadowVisible] =
		useState(false);
	const tableScrollElementRef = useRef<HTMLDivElement | null>(null);
	const { avatarMap, userMap } = useUserMap();
	const tableState = useSessionsOverviewTableState({
		sessionCountLabel,
		sessions,
		totalSessionCount,
		userMap,
	});
	const setLoadMoreElement = useLoadMoreIntersectionObserver({
		enabled: tableState.remainingLoadedSessionCount > 0,
		onIntersect: tableState.loadNextSessionBatch,
	});
	const handleContainedWheel = useCallback((event: WheelEvent) => {
		if (event.ctrlKey) return;
		const scrollElement = tableScrollElementRef.current;
		if (!scrollElement) return;
		const nextScroll = getContainedWheelScroll({
			clientHeight: scrollElement.clientHeight,
			clientWidth: scrollElement.clientWidth,
			deltaMode: event.deltaMode,
			deltaX: event.deltaX,
			deltaY: event.deltaY,
			scrollHeight: scrollElement.scrollHeight,
			scrollLeft: scrollElement.scrollLeft,
			scrollTop: scrollElement.scrollTop,
			scrollWidth: scrollElement.scrollWidth,
		});
		if (!nextScroll.shouldContain) return;
		event.preventDefault();
		scrollElement.scrollLeft = nextScroll.left;
		scrollElement.scrollTop = nextScroll.top;
	}, []);
	const setTableScrollContainer = useCallback(
		(element: HTMLDivElement | null) => {
			tableScrollElementRef.current?.removeEventListener(
				"wheel",
				handleContainedWheel,
			);
			tableScrollElementRef.current = element;
			if (typeof scrollContainerRef === "function") {
				scrollContainerRef(element);
			} else if (scrollContainerRef) {
				scrollContainerRef.current = element;
			}
			element?.addEventListener("wheel", handleContainedWheel, {
				passive: false,
			});
		},
		[handleContainedWheel, scrollContainerRef],
	);

	return (
		<div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-(--session-overview-surface) [--session-overview-accent:#266df0] [--session-overview-border:#eeeff1] [--session-overview-hover:#f6f7f7] [--session-overview-muted:rgba(0,0,0,0.63)] [--session-overview-subtle:rgba(0,0,0,0.5)] [--session-overview-surface:#fff] [--session-overview-text:#101112] [font-family:Inter,sans-serif] dark:[--session-overview-border:rgba(255,255,255,0.08)] dark:[--session-overview-hover:rgba(255,255,255,0.05)] dark:[--session-overview-muted:rgba(255,255,255,0.65)] dark:[--session-overview-subtle:rgba(255,255,255,0.5)] dark:[--session-overview-surface:#111827] dark:[--session-overview-text:#f8fafc]">
			<div className="flex min-h-14 min-w-0 shrink-0 items-center justify-between gap-3 overflow-x-auto px-3 sm:min-h-12">
				<div
					data-slot="sessions-overview-controls"
					className="flex shrink-0 items-center gap-1"
				>
					<button
						type="button"
						aria-label={`Sort by ${tableState.activeSortLabel}, ${tableState.sort.direction === "asc" ? "descending" : "ascending"}`}
						className="relative flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-(--session-overview-surface) py-1 pr-2 pl-1.5 text-base font-medium tracking-[-0.01em] text-(--session-overview-text) shadow-[inset_0_0_0_1px_#e6e7ea] outline-none hover:bg-(--session-overview-hover) focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-(--session-overview-accent) sm:h-7 sm:text-sm dark:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.1)]"
						onClick={tableState.toggleSortDirection}
					>
						<ArrowDownWideNarrow
							aria-hidden="true"
							className="size-4 h-lh shrink-0 stroke-(--session-overview-muted)"
						/>
						<span className="text-(--session-overview-muted)">Sorted by</span>
						<span>{tableState.activeSortLabel}</span>
						{tableState.sort.direction === "asc" ? (
							<ChevronUp
								aria-hidden="true"
								className="size-4 h-lh shrink-0 stroke-(--session-overview-text)"
							/>
						) : (
							<ChevronDown
								aria-hidden="true"
								className="size-4 h-lh shrink-0 stroke-(--session-overview-text)"
							/>
						)}
						<span
							aria-hidden="true"
							className="pointer-fine:hidden absolute top-1/2 left-1/2 size-12 -translate-1/2"
						/>
					</button>
					<div
						aria-hidden="true"
						data-slot="sessions-overview-control-separator"
						className="mx-0.5 h-4 w-px shrink-0 bg-(--session-overview-border)"
					/>
					<SessionsOverviewFiltersMenu
						excludedFilterValues={tableState.excludedFilterValues}
						filterOptions={tableState.filterOptions}
						onClearAll={tableState.clearAllFilters}
						onClearFilter={tableState.clearFilter}
						onClearRangeFilter={tableState.clearRangeFilter}
						onFilterOptionChecked={tableState.setFilterOptionChecked}
						onRangeFilterChange={tableState.setRangeFilter}
						rangeFilterBounds={tableState.rangeFilterBounds}
						rangeFilterValues={tableState.rangeFilterValues}
					/>
				</div>
				<DashboardDateControls
					className="h-10 shrink-0 rounded-md border-0 bg-(--session-overview-surface) py-1 pr-2 pl-1.5 text-base font-medium tracking-[-0.01em] text-(--session-overview-text) shadow-[inset_0_0_0_1px_#e6e7ea] hover:bg-(--session-overview-hover) sm:h-7 sm:text-sm dark:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.1)]"
					sourceComponent="sessions_date_picker"
				/>
			</div>

			{sessionDetailDisabledNote ? (
				<p className="border-t border-(--session-overview-border) px-3 py-2 text-base font-medium text-(--session-overview-muted) sm:text-sm">
					{sessionDetailDisabledNote}
				</p>
			) : null}

			<div className="relative min-h-0 min-w-0 flex-1">
				<div
					ref={setTableScrollContainer}
					className="isolate h-full min-h-0 min-w-0 touch-pan-x touch-pan-y overflow-auto overscroll-none [overflow-anchor:none] [scrollbar-color:rgba(16,17,18,0.2)_transparent] [scrollbar-gutter:stable]"
					data-slot="sessions-overview-scroll-container"
					onScroll={() =>
						setIsFrozenEdgeShadowVisible(
							(tableScrollElementRef.current?.scrollLeft ?? 0) > 0,
						)
					}
				>
					<div
						className={cn(
							"flex min-h-full flex-col",
							SESSION_OVERVIEW_MIN_WIDTH_CLASS_NAME,
						)}
					>
						<SessionsOverviewHeader
							onSort={tableState.handleSort}
							sessionCountLabel={tableState.visibleSessionCountLabel}
							sort={tableState.sort}
						/>
						{isLoading ? (
							<SessionsOverviewSkeleton />
						) : tableState.recentSessions.length === 0 ? (
							<div className="flex min-h-64 flex-1 items-center justify-center border-b border-(--session-overview-border) px-6 text-center text-base text-(--session-overview-muted) sm:text-sm">
								No recent sessions in the selected range.
							</div>
						) : tableState.filteredSessions.length === 0 ? (
							<div className="flex min-h-64 flex-1 flex-col items-center justify-center gap-2 border-b border-(--session-overview-border) px-6 text-center text-base text-(--session-overview-muted) sm:text-sm">
								<p>No sessions match the selected filters.</p>
								<button
									type="button"
									className="rounded-md px-2 py-1 font-medium text-(--session-overview-accent) outline-none hover:bg-(--session-overview-hover) focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-(--session-overview-accent)"
									onClick={tableState.clearAllFilters}
								>
									Clear filters
								</button>
							</div>
						) : (
							<>
								<ul aria-label="Recent sessions" className="flex-1 list-none">
									{tableState.visibleSessions.map((session) => (
										<SessionsOverviewRow
											key={session.session_id}
											activeSessionId={activeSessionId}
											avatarUrl={avatarMap?.[session.user_id]}
											canOpenSession={canOpenSession}
											getSessionHref={getSessionHref}
											getSessionLinkState={getSessionLinkState}
											maximumSessionCost={tableState.maximumSessionCost}
											maximumSessionTokens={tableState.maximumSessionTokens}
											onSessionClick={onSessionClick}
											session={session}
											userLabel={formatUsername(session.user_id, userMap)}
										/>
									))}
								</ul>
								{tableState.remainingLoadedSessionCount > 0 ? (
									<div
										ref={setLoadMoreElement}
										aria-hidden="true"
										className="h-px w-full"
									/>
								) : null}
								{tableState.remainingLoadedSessionCount === 0 &&
								tableState.unloadedSessionCount > 0 ? (
									<p className="border-b border-(--session-overview-border) px-3 py-2 text-right text-base font-medium tabular-nums text-(--session-overview-muted) sm:text-sm">
										{tableState.unloadedSessionCount.toLocaleString()} more not
										shown
										{tableState.hasActiveFilters
											? "; filters apply to loaded sessions"
											: null}
									</p>
								) : null}
							</>
						)}
						<SessionsOverviewFooter
							sessionCountLabel={tableState.visibleSessionCountLabel}
						/>
					</div>
				</div>
				<SessionsOverviewFrozenEdgeShadow
					isVisible={isFrozenEdgeShadowVisible}
				/>
			</div>
		</div>
	);
}
