import type { SessionAnalytics } from "@rudel/api-routes";
import { ArrowDownWideNarrow, ChevronDown, ChevronUp } from "lucide-react";
import { type Ref, useCallback, useMemo, useRef, useState } from "react";
import { Skeleton } from "@/app/ui/skeleton";
import { DashboardDateControls } from "@/features/dashboard/components/DashboardDateControls";
import { SessionsOverviewRow } from "@/features/sessions/components/sessions-overview-row";
import { getContainedWheelScroll } from "@/features/sessions/components/sessions-overview-scroll";
import {
	compareSessionLabels,
	compareSessions,
	getInitialSortDirection,
	SESSION_OVERVIEW_COLUMNS,
	SESSION_OVERVIEW_GRID_CLASS_NAME,
	SESSION_OVERVIEW_MIN_WIDTH_CLASS_NAME,
	type SessionOverviewColumnKey,
	type SessionSortState,
} from "@/features/sessions/components/sessions-overview-table-utils";
import { useUserMap } from "@/features/workspace/hooks/useUserMap";
import { formatUsername } from "@/lib/format";
import { cn } from "@/lib/utils";

const SESSION_ROW_BATCH_SIZE = 50;
const SESSION_OVERVIEW_SKELETON_ROWS = [
	"overview-session-skeleton-1",
	"overview-session-skeleton-2",
	"overview-session-skeleton-3",
	"overview-session-skeleton-4",
	"overview-session-skeleton-5",
	"overview-session-skeleton-6",
	"overview-session-skeleton-7",
	"overview-session-skeleton-8",
	"overview-session-skeleton-9",
	"overview-session-skeleton-10",
] as const;

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
	const [visibleRowCount, setVisibleRowCount] = useState(
		SESSION_ROW_BATCH_SIZE,
	);
	const loadMoreObserverRef = useRef<IntersectionObserver | null>(null);
	const tableScrollElementRef = useRef<HTMLDivElement | null>(null);
	const { avatarMap, userMap } = useUserMap();
	const recentSessions = sessions ?? [];
	const sortedSessions = useMemo(
		() =>
			[...recentSessions].sort((leftSession, rightSession) => {
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
		[recentSessions, sort.direction, sort.key, userMap],
	);
	const visibleSessions = sortedSessions.slice(0, visibleRowCount);
	const maximumSessionTokens = useMemo(
		() =>
			recentSessions.reduce(
				(maximumTokens, session) =>
					Math.max(maximumTokens, session.total_tokens),
				0,
			),
		[recentSessions],
	);
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
		"Time";
	const loadNextSessionBatch = useCallback(() => {
		setVisibleRowCount((currentCount) =>
			Math.min(currentCount + SESSION_ROW_BATCH_SIZE, recentSessions.length),
		);
	}, [recentSessions.length]);
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

	return (
		<div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-(--session-overview-surface) [--session-overview-accent:#266df0] [--session-overview-border:#eeeff1] [--session-overview-hover:#f6f7f7] [--session-overview-muted:rgba(0,0,0,0.63)] [--session-overview-subtle:rgba(0,0,0,0.5)] [--session-overview-surface:#fff] [--session-overview-text:#101112] [font-family:Inter,sans-serif] dark:[--session-overview-border:rgba(255,255,255,0.08)] dark:[--session-overview-hover:rgba(255,255,255,0.05)] dark:[--session-overview-muted:rgba(255,255,255,0.65)] dark:[--session-overview-subtle:rgba(255,255,255,0.5)] dark:[--session-overview-surface:#111827] dark:[--session-overview-text:#f8fafc]">
			<div className="flex min-h-14 min-w-0 shrink-0 items-center justify-between gap-3 overflow-x-auto px-3 sm:min-h-12">
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

			<div
				ref={setTableScrollContainer}
				className="isolate min-h-0 min-w-0 flex-1 touch-pan-x touch-pan-y overflow-auto overscroll-none [overflow-anchor:none] [scrollbar-color:rgba(16,17,18,0.2)_transparent] [scrollbar-gutter:stable]"
			>
				<div
					className={cn(
						"flex min-h-full flex-col",
						SESSION_OVERVIEW_MIN_WIDTH_CLASS_NAME,
					)}
				>
					<SessionsOverviewHeader
						sessionCountLabel={sessionCountLabel}
						sort={sort}
						onSort={handleSort}
					/>

					{isLoading ? (
						<SessionsOverviewSkeleton />
					) : recentSessions.length === 0 ? (
						<div className="flex min-h-64 flex-1 items-center justify-center border-b border-(--session-overview-border) px-6 text-center text-base text-(--session-overview-muted) sm:text-sm">
							No recent sessions in the selected range.
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
							{remainingLoadedSessionCount === 0 && unloadedSessionCount > 0 ? (
								<p className="border-b border-(--session-overview-border) px-3 py-2 text-right text-base font-medium tabular-nums text-(--session-overview-muted) sm:text-sm">
									{unloadedSessionCount.toLocaleString()} more not shown
								</p>
							) : null}
						</>
					)}

					<SessionsOverviewFooter sessionCountLabel={sessionCountLabel} />
				</div>
			</div>
		</div>
	);
}

function SessionsOverviewHeader({
	onSort,
	sessionCountLabel,
	sort,
}: {
	onSort: (sortKey: SessionOverviewColumnKey) => void;
	sessionCountLabel: number;
	sort: SessionSortState;
}) {
	return (
		<div
			className={cn(
				"sticky top-0 z-30 grid h-10 shrink-0 border-y border-(--session-overview-border) bg-(--session-overview-surface)",
				SESSION_OVERVIEW_GRID_CLASS_NAME,
			)}
		>
			{SESSION_OVERVIEW_COLUMNS.map((column, index) => (
				<div
					key={column.key}
					className={cn(
						"min-w-0 border-r border-(--session-overview-border) bg-(--session-overview-surface)",
						index === 0 && "sticky left-0 z-40",
					)}
				>
					<SessionOverviewSortableHeader
						align={column.align}
						label={column.label}
						onSort={onSort}
						secondaryLabel={
							column.key === "session"
								? sessionCountLabel.toLocaleString()
								: undefined
						}
						sort={sort}
						sortKey={column.key}
					/>
				</div>
			))}
		</div>
	);
}

function SessionOverviewSortableHeader({
	align,
	label,
	onSort,
	secondaryLabel,
	sort,
	sortKey,
}: {
	align: "left" | "right";
	label: string;
	onSort: (sortKey: SessionOverviewColumnKey) => void;
	secondaryLabel: string | undefined;
	sort: SessionSortState;
	sortKey: SessionOverviewColumnKey;
}) {
	const isActive = sort.key === sortKey;

	return (
		<button
			type="button"
			aria-label={`Sort by ${label}, ${
				isActive && sort.direction === "asc" ? "descending" : "ascending"
			}`}
			className={cn(
				"relative flex size-full min-w-0 items-center gap-1.5 px-3 text-base font-medium tracking-[-0.01em] text-(--session-overview-text) outline-none hover:bg-(--session-overview-hover) focus-visible:z-10 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--session-overview-accent) sm:text-sm",
				align === "right" ? "justify-end text-right" : "justify-start",
			)}
			onClick={() => onSort(sortKey)}
		>
			<span className="truncate">{label}</span>
			{secondaryLabel ? (
				<span className="font-normal tabular-nums text-(--session-overview-muted)">
					{secondaryLabel}
				</span>
			) : null}
			{isActive ? (
				sort.direction === "asc" ? (
					<ChevronUp
						aria-hidden="true"
						className="size-4 h-lh shrink-0 stroke-(--session-overview-text)"
					/>
				) : (
					<ChevronDown
						aria-hidden="true"
						className="size-4 h-lh shrink-0 stroke-(--session-overview-text)"
					/>
				)
			) : null}
			<span
				aria-hidden="true"
				className="pointer-fine:hidden absolute top-1/2 left-1/2 size-[max(100%,3rem)] -translate-1/2"
			/>
		</button>
	);
}

function SessionsOverviewSkeleton() {
	return (
		<div aria-busy="true" className="flex-1">
			<output className="sr-only">Loading sessions</output>
			{SESSION_OVERVIEW_SKELETON_ROWS.map((rowId) => (
				<div
					key={rowId}
					className={cn("grid h-11 sm:h-9", SESSION_OVERVIEW_GRID_CLASS_NAME)}
				>
					<div className="sticky left-0 z-10 flex items-center border-r border-b border-(--session-overview-border) bg-(--session-overview-surface) px-4">
						<Skeleton className="h-3.5 w-20 rounded-sm" />
					</div>
					<div className="flex items-center gap-1.5 border-r border-b border-(--session-overview-border) px-3">
						<Skeleton className="size-4 rounded-full" />
						<Skeleton className="h-3.5 w-24 rounded-sm" />
					</div>
					<div className="flex items-center border-r border-b border-(--session-overview-border) px-3">
						<Skeleton className="h-3.5 w-36 rounded-sm" />
					</div>
					<div className="flex items-center border-r border-b border-(--session-overview-border) px-3">
						<Skeleton className="h-5 w-24 rounded-full" />
					</div>
					<div className="flex items-center justify-end border-r border-b border-(--session-overview-border) px-3">
						<Skeleton className="h-3.5 w-20 rounded-sm" />
					</div>
					<div className="flex items-center justify-end border-r border-b border-(--session-overview-border) px-3">
						<Skeleton className="h-3.5 w-14 rounded-sm" />
					</div>
					<div className="flex items-center justify-end border-r border-b border-(--session-overview-border) px-3">
						<Skeleton className="h-3.5 w-16 rounded-sm" />
					</div>
					<div className="flex items-center justify-end border-r border-b border-(--session-overview-border) px-3">
						<Skeleton className="h-3.5 w-20 rounded-sm" />
					</div>
				</div>
			))}
		</div>
	);
}

function SessionsOverviewFooter({
	sessionCountLabel,
}: {
	sessionCountLabel: number;
}) {
	return (
		<div
			className={cn(
				"sticky bottom-0 z-30 grid h-9 shrink-0 bg-(--session-overview-surface)",
				SESSION_OVERVIEW_GRID_CLASS_NAME,
			)}
		>
			<div className="sticky left-0 z-40 flex items-center justify-end border-r border-y border-(--session-overview-border) bg-(--session-overview-surface) px-3">
				<p className="flex min-w-0 items-center gap-1 font-mono text-base font-medium tabular-nums text-(--session-overview-text) sm:text-sm">
					{sessionCountLabel.toLocaleString()}
					<span className="font-normal text-(--session-overview-muted)">
						count
					</span>
				</p>
			</div>
			{SESSION_OVERVIEW_COLUMNS.slice(1).map((column) => (
				<div
					key={column.key}
					className="border-r border-y border-(--session-overview-border) bg-(--session-overview-surface)"
				/>
			))}
		</div>
	);
}
