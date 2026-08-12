import type { SessionAnalytics } from "@rudel/api-routes";
import { ArrowDownWideNarrow, ChevronDown, ChevronUp } from "lucide-react";
import { type Ref, useCallback, useMemo, useRef, useState } from "react";
import { DashboardDateControls } from "@/features/dashboard/components/DashboardDateControls";
import { SessionsOverviewFiltersMenu } from "@/features/sessions/components/sessions-overview-filters-menu";
import { SessionsOverviewFooter } from "@/features/sessions/components/sessions-overview-footer";
import { SessionsOverviewFrozenEdgeShadow } from "@/features/sessions/components/sessions-overview-frozen-edge-shadow";
import { SessionsOverviewHeader } from "@/features/sessions/components/sessions-overview-header";
import { SessionsOverviewRow } from "@/features/sessions/components/sessions-overview-row";
import { getContainedWheelScroll } from "@/features/sessions/components/sessions-overview-scroll";
import { SessionsOverviewSkeleton } from "@/features/sessions/components/sessions-overview-skeleton";
import {
	buildSessionOverviewFilterOptions,
	buildSessionOverviewRangeBounds,
	compareSessionLabels,
	compareSessions,
	getInitialSortDirection,
	matchesSessionOverviewFilters,
	matchesSessionOverviewRangeFilters,
	SESSION_OVERVIEW_COLUMNS,
	SESSION_OVERVIEW_FILTER_KEYS,
	SESSION_OVERVIEW_MIN_WIDTH_CLASS_NAME,
	SESSION_OVERVIEW_RANGE_FILTER_KEYS,
	type SessionOverviewColumnKey,
	type SessionOverviewExcludedFilterValues,
	type SessionOverviewFilterKey,
	type SessionOverviewRangeFilter,
	type SessionOverviewRangeFilterKey,
	type SessionOverviewRangeFilterValues,
	type SessionSortState,
} from "@/features/sessions/components/sessions-overview-table-utils";
import { useUserMap } from "@/features/workspace/hooks/useUserMap";
import { calculateCost, formatUsername } from "@/lib/format";
import { cn } from "@/lib/utils";

const SESSION_ROW_BATCH_SIZE = 50;
const EMPTY_SESSION_OVERVIEW_FILTERS =
	(): SessionOverviewExcludedFilterValues => ({
		model: new Set<string>(),
		repository: new Set<string>(),
		skills: new Set<string>(),
		user: new Set<string>(),
	});
const EMPTY_SESSION_OVERVIEW_RANGE_FILTERS =
	(): SessionOverviewRangeFilterValues => ({
		cost: { maximum: null, minimum: null },
		duration: { maximum: null, minimum: null },
		errors: { maximum: null, minimum: null },
		subagents: { maximum: null, minimum: null },
		tokens: { maximum: null, minimum: null },
	});
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
	const [sort, setSort] = useState<SessionSortState>({
		key: "time",
		direction: "desc",
	});
	const [excludedFilterValues, setExcludedFilterValues] =
		useState<SessionOverviewExcludedFilterValues>(
			EMPTY_SESSION_OVERVIEW_FILTERS,
		);
	const [rangeFilterValues, setRangeFilterValues] =
		useState<SessionOverviewRangeFilterValues>(
			EMPTY_SESSION_OVERVIEW_RANGE_FILTERS,
		);
	const [visibleRowCount, setVisibleRowCount] = useState(
		SESSION_ROW_BATCH_SIZE,
	);
	const [isFrozenEdgeShadowVisible, setIsFrozenEdgeShadowVisible] =
		useState(false);
	const loadMoreObserverRef = useRef<IntersectionObserver | null>(null);
	const tableScrollElementRef = useRef<HTMLDivElement | null>(null);
	const { avatarMap, userMap } = useUserMap();
	const recentSessions = sessions ?? [];
	const filterOptions = useMemo(
		() => ({
			model: buildSessionOverviewFilterOptions(
				recentSessions,
				"model",
				userMap,
			),
			repository: buildSessionOverviewFilterOptions(
				recentSessions,
				"repository",
				userMap,
			),
			skills: buildSessionOverviewFilterOptions(
				recentSessions,
				"skills",
				userMap,
			),
			user: buildSessionOverviewFilterOptions(recentSessions, "user", userMap),
		}),
		[recentSessions, userMap],
	);
	const rangeFilterBounds = useMemo(
		() => buildSessionOverviewRangeBounds(recentSessions),
		[recentSessions],
	);
	const hasActiveFilters =
		SESSION_OVERVIEW_FILTER_KEYS.some(
			(filterKey) => excludedFilterValues[filterKey].size > 0,
		) ||
		SESSION_OVERVIEW_RANGE_FILTER_KEYS.some((filterKey) => {
			const range = rangeFilterValues[filterKey];
			return range.minimum !== null || range.maximum !== null;
		});
	const filteredSessions = useMemo(
		() =>
			recentSessions.filter(
				(session) =>
					matchesSessionOverviewFilters(session, excludedFilterValues) &&
					matchesSessionOverviewRangeFilters(session, rangeFilterValues),
			),
		[excludedFilterValues, rangeFilterValues, recentSessions],
	);
	const sortedSessions = useMemo(
		() =>
			[...filteredSessions].sort((leftSession, rightSession) => {
				const comparison = compareSessions(
					leftSession,
					rightSession,
					sort.key,
					userMap,
				);
				const directedComparison =
					sort.direction === "asc" ? comparison : -comparison;

				if (directedComparison !== 0) {
					return directedComparison;
				}

				return compareSessionLabels(
					leftSession.session_id,
					rightSession.session_id,
				);
			}),
		[filteredSessions, sort.direction, sort.key, userMap],
	);
	const visibleSessions = sortedSessions.slice(0, visibleRowCount);
	const maximumSessionTokens = useMemo(
		() =>
			filteredSessions.reduce(
				(maximumTokens, session) =>
					Math.max(maximumTokens, session.total_tokens),
				0,
			),
		[filteredSessions],
	);
	const maximumSessionCost = useMemo(
		() =>
			filteredSessions.reduce(
				(maximumCost, session) =>
					Math.max(
						maximumCost,
						calculateCost(session.input_tokens, session.output_tokens, {
							at: session.session_date,
							model: session.model_used,
						}),
					),
				0,
			),
		[filteredSessions],
	);
	const visibleSessionCountLabel = hasActiveFilters
		? filteredSessions.length
		: sessionCountLabel;
	const remainingLoadedSessionCount = Math.max(
		sortedSessions.length - visibleSessions.length,
		0,
	);
	const unloadedSessionCount = Math.max(
		totalSessionCount - recentSessions.length,
		0,
	);
	const activeSortLabel =
		SESSION_OVERVIEW_COLUMNS.find((column) => column.key === sort.key)?.label ??
		"Date";
	const loadNextSessionBatch = useCallback(() => {
		setVisibleRowCount((currentCount) =>
			Math.min(currentCount + SESSION_ROW_BATCH_SIZE, sortedSessions.length),
		);
	}, [sortedSessions.length]);
	const setLoadMoreTrigger = useCallback(
		(element: HTMLDivElement | null) => {
			loadMoreObserverRef.current?.disconnect();
			loadMoreObserverRef.current = null;

			if (!element || remainingLoadedSessionCount === 0) {
				return;
			}

			const observer = new IntersectionObserver(
				(entries) => {
					if (entries.some((entry) => entry.isIntersecting)) {
						loadNextSessionBatch();
					}
				},
				{ rootMargin: "320px 0px" },
			);
			observer.observe(element);
			loadMoreObserverRef.current = observer;
		},
		[loadNextSessionBatch, remainingLoadedSessionCount],
	);
	const handleContainedWheel = useCallback((event: WheelEvent) => {
		if (event.ctrlKey) {
			return;
		}

		const scrollElement = tableScrollElementRef.current;
		if (!scrollElement) {
			return;
		}

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

		if (!nextScroll.shouldContain) {
			return;
		}

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
	const handleTableScroll = useCallback(() => {
		setIsFrozenEdgeShadowVisible(
			(tableScrollElementRef.current?.scrollLeft ?? 0) > 0,
		);
	}, []);

	function handleSort(sortKey: SessionOverviewColumnKey) {
		setSort((currentSort) => ({
			key: sortKey,
			direction:
				currentSort.key === sortKey
					? currentSort.direction === "asc"
						? "desc"
						: "asc"
					: getInitialSortDirection(sortKey),
		}));
	}

	function toggleSortDirection() {
		setSort((currentSort) => ({
			...currentSort,
			direction: currentSort.direction === "asc" ? "desc" : "asc",
		}));
	}

	function setFilterOptionChecked(
		filterKey: SessionOverviewFilterKey,
		value: string,
		checked: boolean,
	) {
		setExcludedFilterValues((currentFilters) => {
			const nextExcludedValues = new Set(currentFilters[filterKey]);

			if (checked) {
				nextExcludedValues.delete(value);
			} else {
				nextExcludedValues.add(value);
			}

			return {
				...currentFilters,
				[filterKey]: nextExcludedValues,
			};
		});
		setVisibleRowCount(SESSION_ROW_BATCH_SIZE);
	}

	function clearFilter(filterKey: SessionOverviewFilterKey) {
		setExcludedFilterValues((currentFilters) => ({
			...currentFilters,
			[filterKey]: new Set<string>(),
		}));
		setVisibleRowCount(SESSION_ROW_BATCH_SIZE);
	}

	function setRangeFilter(
		filterKey: SessionOverviewRangeFilterKey,
		value: SessionOverviewRangeFilter,
	) {
		setRangeFilterValues((currentFilters) => ({
			...currentFilters,
			[filterKey]: value,
		}));
		setVisibleRowCount(SESSION_ROW_BATCH_SIZE);
	}

	function clearRangeFilter(filterKey: SessionOverviewRangeFilterKey) {
		setRangeFilterValues((currentFilters) => ({
			...currentFilters,
			[filterKey]: { maximum: null, minimum: null },
		}));
		setVisibleRowCount(SESSION_ROW_BATCH_SIZE);
	}

	function clearAllFilters() {
		setExcludedFilterValues(EMPTY_SESSION_OVERVIEW_FILTERS());
		setRangeFilterValues(EMPTY_SESSION_OVERVIEW_RANGE_FILTERS());
		setVisibleRowCount(SESSION_ROW_BATCH_SIZE);
	}

	return (
		<div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-(--session-overview-surface) [--session-overview-accent:#266df0] [--session-overview-border:#eeeff1] [--session-overview-hover:#f6f7f7] [--session-overview-muted:rgba(0,0,0,0.63)] [--session-overview-subtle:rgba(0,0,0,0.5)] [--session-overview-surface:#fff] [--session-overview-text:#101112] [font-family:Inter,sans-serif] dark:[--session-overview-border:rgba(255,255,255,0.08)] dark:[--session-overview-hover:rgba(255,255,255,0.05)] dark:[--session-overview-muted:rgba(255,255,255,0.65)] dark:[--session-overview-subtle:rgba(255,255,255,0.5)] dark:[--session-overview-surface:#111827] dark:[--session-overview-text:#f8fafc]">
			<div className="flex min-h-14 min-w-0 shrink-0 items-center justify-between gap-3 overflow-x-auto px-3 sm:min-h-12">
				<div
					data-slot="sessions-overview-controls"
					className="flex shrink-0 items-center gap-1"
				>
					<button
						type="button"
						aria-label={`Sort by ${activeSortLabel}, ${
							sort.direction === "asc" ? "descending" : "ascending"
						}`}
						className="relative flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-(--session-overview-surface) py-1 pr-2 pl-1.5 text-base font-medium tracking-[-0.01em] text-(--session-overview-text) shadow-[inset_0_0_0_1px_#e6e7ea] outline-none hover:bg-(--session-overview-hover) focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-(--session-overview-accent) sm:h-7 sm:text-sm dark:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.1)]"
						onClick={toggleSortDirection}
					>
						<ArrowDownWideNarrow
							aria-hidden="true"
							className="size-4 h-lh shrink-0 stroke-(--session-overview-muted)"
						/>
						<span className="text-(--session-overview-muted)">Sorted by</span>
						<span>{activeSortLabel}</span>
						{sort.direction === "asc" ? (
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
						excludedFilterValues={excludedFilterValues}
						filterOptions={filterOptions}
						onClearAll={clearAllFilters}
						onClearFilter={clearFilter}
						onClearRangeFilter={clearRangeFilter}
						onFilterOptionChecked={setFilterOptionChecked}
						onRangeFilterChange={setRangeFilter}
						rangeFilterBounds={rangeFilterBounds}
						rangeFilterValues={rangeFilterValues}
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
					onScroll={handleTableScroll}
				>
					<div
						className={cn(
							"flex min-h-full flex-col",
							SESSION_OVERVIEW_MIN_WIDTH_CLASS_NAME,
						)}
					>
						<SessionsOverviewHeader
							onSort={handleSort}
							sessionCountLabel={visibleSessionCountLabel}
							sort={sort}
						/>

						{isLoading ? (
							<SessionsOverviewSkeleton />
						) : recentSessions.length === 0 ? (
							<div className="flex min-h-64 flex-1 items-center justify-center border-b border-(--session-overview-border) px-6 text-center text-base text-(--session-overview-muted) sm:text-sm">
								No recent sessions in the selected range.
							</div>
						) : filteredSessions.length === 0 ? (
							<div className="flex min-h-64 flex-1 flex-col items-center justify-center gap-2 border-b border-(--session-overview-border) px-6 text-center text-base text-(--session-overview-muted) sm:text-sm">
								<p>No sessions match the selected filters.</p>
								<button
									type="button"
									className="rounded-md px-2 py-1 font-medium text-(--session-overview-accent) outline-none hover:bg-(--session-overview-hover) focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-(--session-overview-accent)"
									onClick={clearAllFilters}
								>
									Clear filters
								</button>
							</div>
						) : (
							<>
								<ul aria-label="Recent sessions" className="flex-1 list-none">
									{visibleSessions.map((session) => (
										<SessionsOverviewRow
											key={session.session_id}
											activeSessionId={activeSessionId}
											avatarUrl={avatarMap?.[session.user_id]}
											canOpenSession={canOpenSession}
											getSessionHref={getSessionHref}
											getSessionLinkState={getSessionLinkState}
											maximumSessionCost={maximumSessionCost}
											maximumSessionTokens={maximumSessionTokens}
											onSessionClick={onSessionClick}
											session={session}
											userLabel={formatUsername(session.user_id, userMap)}
										/>
									))}
								</ul>
								{remainingLoadedSessionCount > 0 ? (
									<div
										ref={setLoadMoreTrigger}
										aria-hidden="true"
										className="h-px w-full"
									/>
								) : null}
								{remainingLoadedSessionCount === 0 &&
								unloadedSessionCount > 0 ? (
									<p className="border-b border-(--session-overview-border) px-3 py-2 text-right text-base font-medium tabular-nums text-(--session-overview-muted) sm:text-sm">
										{unloadedSessionCount.toLocaleString()} more not shown
										{hasActiveFilters
											? "; filters apply to loaded sessions"
											: null}
									</p>
								) : null}
							</>
						)}

						<SessionsOverviewFooter
							sessionCountLabel={visibleSessionCountLabel}
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
