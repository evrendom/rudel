import type { SessionAnalytics } from "@rudel/api-routes";
import { Check, Ellipsis, SlidersHorizontal } from "lucide-react";
import { type Ref, useCallback, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { useLoadMoreIntersectionObserver } from "@/app/hooks/useLoadMoreIntersectionObserver";
import {
	Popover,
	PopoverContent,
	PopoverTitle,
	PopoverTrigger,
} from "@/app/ui/popover";
import { DashboardDateControls } from "@/features/dashboard/components/DashboardDateControls";
import { formatModelDisplayLabel } from "@/features/dashboard/components/dashboard-model-brand";
import { SessionsOverviewFiltersMenu } from "@/features/sessions/components/sessions-overview-filters-menu";
import {
	getRepositoryLabel,
	SESSION_OVERVIEW_COLUMNS,
	type SessionOverviewColumnKey,
} from "@/features/sessions/components/sessions-overview-table-utils";
import { useSessionsOverviewTableState } from "@/features/sessions/components/use-sessions-overview-table-state";
import { useNewseshListHeaderPortal } from "@/features/shell/newsesh-list-header-portal";
import { useUserMap } from "@/features/workspace/hooks/useUserMap";
import {
	calculateCost,
	formatCompactNumber,
	formatCurrency,
	formatRoundedDuration,
	formatUsername,
} from "@/lib/format";
import { formatExactDateTime, formatRelativeTime } from "@/lib/time-utils";
import { cn } from "@/lib/utils";
import {
	getNewseshLanguageSignalCategoryLabel,
	getNewseshLanguageSignals,
	getNewseshLanguageSignalTagLabel,
	type NewseshLanguageSignal,
} from "./newsesh-session-language-signal";
import { SessionModelMark } from "./session-model-mark";

type NewseshSessionListProps = {
	activeSessionId: string | null;
	canOpenSession: (session: SessionAnalytics) => boolean;
	getSessionHref: (session: SessionAnalytics) => string;
	isError: boolean;
	isPending: boolean;
	onSessionClick: (session: SessionAnalytics) => void;
	scrollContainerRef: Ref<HTMLDivElement>;
	sessions: readonly SessionAnalytics[];
};

const LOADING_ROW_KEYS = Array.from(
	{ length: 10 },
	(_, index) => `loading-session-${index + 1}`,
);

type NewseshTableState = ReturnType<typeof useSessionsOverviewTableState>;

const MAX_NEWSHESH_LANGUAGE_SIGNAL_TAGS = 2;

function hasSpecifiedSessionModel(model: string) {
	const normalizedModel = model.trim().toLowerCase();
	return normalizedModel !== "" && normalizedModel !== "unknown";
}

function NewseshListHeaderControls({
	onSort,
	tableState,
}: {
	onSort: (sortKey: SessionOverviewColumnKey) => void;
	tableState: NewseshTableState;
}) {
	const [sortMenuOpen, setSortMenuOpen] = useState(false);

	return (
		<div className="flex min-w-0 flex-1 items-center [--session-overview-accent:#5e69c1] [--session-overview-hover:#ececed] [--session-overview-muted:#5b5c5e] [--session-overview-surface:#fcfcfc] [--session-overview-text:#1b1b1b]">
			<Popover>
				<PopoverTrigger
					type="button"
					aria-label="Session list actions"
					className="flex size-7 shrink-0 items-center justify-center rounded-md text-[#5b5c5e] outline-none hover:bg-[#ececed] hover:text-[#1b1b1b] focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-[#5e69c1]"
				>
					<Ellipsis aria-hidden="true" className="size-3.5" />
				</PopoverTrigger>
				<PopoverContent
					align="start"
					sideOffset={6}
					className="w-52 gap-0 p-1.5"
				>
					<PopoverTitle className="px-2 py-1 text-xs font-medium text-muted-foreground">
						Session list
					</PopoverTitle>
					<p className="px-2 py-1.5 text-sm text-foreground">
						{tableState.sortedSessions.length.toLocaleString()} sessions
					</p>
					<button
						type="button"
						className="flex min-h-8 w-full items-center rounded-md px-2 text-left text-sm outline-none hover:bg-accent disabled:opacity-45"
						disabled={!tableState.hasActiveFilters}
						onClick={tableState.clearAllFilters}
					>
						Clear filters
					</button>
				</PopoverContent>
			</Popover>
			<div className="ml-auto flex shrink-0 items-center gap-0.5">
				<SessionsOverviewFiltersMenu
					excludedFilterValues={tableState.excludedFilterValues}
					filterOptions={tableState.filterOptions}
					iconOnly
					variant="linear"
					onClearAll={tableState.clearAllFilters}
					onClearFilter={tableState.clearFilter}
					onClearRangeFilter={tableState.clearRangeFilter}
					onFilterOptionChecked={tableState.setFilterOptionChecked}
					onRangeFilterChange={tableState.setRangeFilter}
					rangeFilterBounds={tableState.rangeFilterBounds}
					rangeFilterValues={tableState.rangeFilterValues}
				/>
				<DashboardDateControls
					className="size-7 justify-center gap-0 overflow-hidden rounded-md border-0 bg-transparent p-0 text-[0px] text-[#5b5c5e] shadow-none hover:bg-[#ececed] hover:text-[#1b1b1b] [&_svg]:size-3.5"
					sourceComponent="newsesh_sessions_date_picker"
					variant="linear"
				/>
				<Popover open={sortMenuOpen} onOpenChange={setSortMenuOpen}>
					<PopoverTrigger
						type="button"
						aria-label="Display options"
						className="flex size-7 shrink-0 items-center justify-center rounded-md text-[#5b5c5e] outline-none hover:bg-[#ececed] hover:text-[#1b1b1b] focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-[#5e69c1]"
					>
						<SlidersHorizontal aria-hidden="true" className="size-3.5" />
					</PopoverTrigger>
					<PopoverContent
						align="end"
						sideOffset={6}
						className="w-52 gap-0 p-1.5"
					>
						<PopoverTitle className="px-2 py-1 text-xs font-medium text-muted-foreground">
							Sort sessions
						</PopoverTitle>
						{SESSION_OVERVIEW_COLUMNS.map((column) => (
							<button
								key={column.key}
								type="button"
								className="flex min-h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm outline-none hover:bg-accent"
								onClick={() => {
									onSort(column.key);
									setSortMenuOpen(false);
								}}
							>
								<span className="min-w-0 flex-1 truncate">{column.label}</span>
								{tableState.sort.key === column.key ? (
									<Check aria-hidden="true" className="size-3.5 shrink-0" />
								) : null}
							</button>
						))}
					</PopoverContent>
				</Popover>
			</div>
		</div>
	);
}

function SessionLanguageSignalTags({
	signals,
}: {
	signals: readonly NewseshLanguageSignal[] | undefined;
}) {
	if (!signals || signals.length === 0) {
		return null;
	}

	const signalSummary = signals
		.map(
			(signal) =>
				`${signal.count} ${getNewseshLanguageSignalCategoryLabel(signal)}`,
		)
		.join(", ");

	return (
		<div
			className="flex max-w-36 shrink-0 items-center gap-1 overflow-hidden"
			title={`Language signals: ${signalSummary}`}
		>
			{signals.slice(0, MAX_NEWSHESH_LANGUAGE_SIGNAL_TAGS).map((signal) => {
				const categoryLabel = getNewseshLanguageSignalCategoryLabel(signal);

				return (
					<div
						key={`${signal.speaker}:${signal.category}`}
						className={cn(
							"shrink-0 rounded-sm px-1.5 py-0.5 font-sans text-[0.625rem] font-normal tabular-nums",
							signal.category === "positive" &&
								"bg-[#dcfce7] text-[#15803d] dark:bg-[#173d2a] dark:text-[#4ade80]",
							signal.category === "apology" &&
								"bg-[#fef3c7] text-[#b45309] dark:bg-[#493719] dark:text-[#fbbf24]",
							signal.category === "swear" &&
								"bg-[#ffe4e6] text-[#be123c] dark:bg-[#4c1d25] dark:text-[#fb7185]",
						)}
						title={`${signal.count} ${categoryLabel} language ${signal.count === 1 ? "signal" : "signals"}`}
					>
						{getNewseshLanguageSignalTagLabel(signal)}
					</div>
				);
			})}
		</div>
	);
}

function NewseshSessionRow({
	activeSessionId,
	avatarUrl,
	canOpenSession,
	getSessionHref,
	onSessionClick,
	session,
	userLabel,
}: {
	activeSessionId: string | null;
	avatarUrl: string | undefined;
	canOpenSession: (session: SessionAnalytics) => boolean;
	getSessionHref: (session: SessionAnalytics) => string;
	onSessionClick: (session: SessionAnalytics) => void;
	session: SessionAnalytics;
	userLabel: string;
}) {
	const isActive = activeSessionId === session.session_id;
	const languageSignals = getNewseshLanguageSignals(session);
	const canOpen = canOpenSession(session);
	const repositoryLabel = getRepositoryLabel(session);
	const hasModelLabel = hasSpecifiedSessionModel(session.model_used);
	const modelLabel = hasModelLabel
		? formatModelDisplayLabel(session.model_used)
		: "";
	const sessionCost = calculateCost(
		session.input_tokens,
		session.output_tokens,
		{
			at: session.session_date,
			model: session.model_used,
		},
	);
	const content = (
		<div
			className={cn(
				"flex h-full min-w-0 flex-1 items-center gap-2.5 rounded-md px-2",
				canOpen &&
					"group-hover/session:bg-[#f1f1f1] dark:group-hover/session:bg-white/4",
				isActive && "bg-[#eeeeef] dark:bg-white/7",
			)}
		>
			<SessionModelMark
				avatarUrl={avatarUrl}
				model={session.model_used}
				userLabel={userLabel}
			/>
			<div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
				<div className="flex min-w-0 items-center gap-1.5 text-[0.8125rem] font-medium tracking-[-0.01em] text-(--session-overview-text)">
					<div className="flex min-w-0 flex-1 items-center gap-1.5">
						<p className="min-w-0 truncate" title={repositoryLabel}>
							{repositoryLabel}
						</p>
						{hasModelLabel ? (
							<>
								<span
									aria-hidden="true"
									className="shrink-0 text-(--session-overview-subtle)"
								>
									·
								</span>
								<p
									className="max-w-28 shrink-0 truncate text-(--session-overview-muted)"
									title={modelLabel}
								>
									{modelLabel}
								</p>
							</>
						) : null}
					</div>
					<SessionLanguageSignalTags signals={languageSignals} />
				</div>
				<div className="flex min-w-0 items-center gap-2 text-xs text-(--session-overview-subtle)">
					<div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
						<p className="shrink-0 font-mono font-light tabular-nums">
							{formatRoundedDuration(session.duration_min)}
						</p>
						<span aria-hidden="true">·</span>
						<p className="shrink-0 font-mono font-light tabular-nums">
							{formatCompactNumber(session.input_tokens)} in
						</p>
						<span aria-hidden="true">·</span>
						<p className="shrink-0 font-mono font-light tabular-nums">
							{formatCurrency(sessionCost)}
						</p>
					</div>
					<time
						className="shrink-0 font-mono font-light tabular-nums"
						dateTime={session.session_date}
						title={formatExactDateTime(session.session_date)}
					>
						{formatRelativeTime(session.session_date)}
					</time>
				</div>
			</div>
		</div>
	);
	const rowClassName = cn(
		"group/session flex h-[55px] w-full min-w-0 px-2 py-0.5 text-left outline-none focus-visible:z-10 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--session-overview-accent)",
		canOpen ? "cursor-pointer" : "cursor-default opacity-55",
	);

	return (
		<li>
			{canOpen ? (
				<Link
					aria-current={isActive ? "page" : undefined}
					className={rowClassName}
					data-selected={isActive ? "true" : undefined}
					onClick={() => onSessionClick(session)}
					to={getSessionHref(session)}
					viewTransition
				>
					{content}
				</Link>
			) : (
				<div className={rowClassName}>{content}</div>
			)}
		</li>
	);
}

export function NewseshSessionList({
	activeSessionId,
	canOpenSession,
	getSessionHref,
	isError,
	isPending,
	onSessionClick,
	scrollContainerRef,
	sessions,
}: NewseshSessionListProps) {
	const { avatarMap, userMap } = useUserMap();
	const headerPortal = useNewseshListHeaderPortal();
	const listScrollElementRef = useRef<HTMLDivElement | null>(null);
	const tableState = useSessionsOverviewTableState({
		sessionCountLabel: sessions.length,
		sessions,
		totalSessionCount: sessions.length,
		userMap,
	});
	const setLoadMoreElement = useLoadMoreIntersectionObserver({
		enabled: tableState.remainingLoadedSessionCount > 0,
		onIntersect: tableState.loadNextSessionBatch,
	});
	const setListScrollContainer = useCallback(
		(element: HTMLDivElement | null) => {
			listScrollElementRef.current = element;
			if (typeof scrollContainerRef === "function") {
				scrollContainerRef(element);
			} else if (scrollContainerRef) {
				scrollContainerRef.current = element;
			}
		},
		[scrollContainerRef],
	);

	function handleSort(sortKey: SessionOverviewColumnKey) {
		tableState.handleSort(sortKey);
		if (listScrollElementRef.current) {
			listScrollElementRef.current.scrollTop = 0;
		}
	}

	return (
		<div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-(--session-overview-surface) [--session-overview-accent:#5e69c1] [--session-overview-muted:#5b5c5e] [--session-overview-subtle:#7c7c7c] [--session-overview-surface:#fcfcfc] [--session-overview-text:#1b1b1b] [font-family:Inter,sans-serif] dark:[--session-overview-muted:rgba(255,255,255,0.65)] dark:[--session-overview-subtle:rgba(255,255,255,0.5)] dark:[--session-overview-surface:#111827] dark:[--session-overview-text:#f8fafc]">
			{headerPortal
				? createPortal(
						<NewseshListHeaderControls
							onSort={handleSort}
							tableState={tableState}
						/>,
						headerPortal,
					)
				: null}
			<div
				ref={setListScrollContainer}
				className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-2 [overflow-anchor:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
			>
				{isError ? (
					<div className="flex min-h-40 items-center justify-center px-6 text-center text-base text-(--session-overview-muted) sm:text-sm">
						We couldn&apos;t load sessions for this range.
					</div>
				) : isPending ? (
					<ul aria-label="Loading sessions" className="list-none">
						{LOADING_ROW_KEYS.map((key) => (
							<li
								key={key}
								className="flex h-[55px] animate-pulse items-center gap-2.5 px-4"
							>
								<div className="size-7 shrink-0 rounded-md bg-black/5 dark:bg-white/8" />
								<div className="flex flex-1 flex-col gap-1.5">
									<div className="h-2.5 w-2/3 rounded-sm bg-black/6 dark:bg-white/9" />
									<div className="h-2 w-1/2 rounded-sm bg-black/4 dark:bg-white/7" />
								</div>
							</li>
						))}
					</ul>
				) : tableState.sortedSessions.length === 0 ? (
					<div className="flex min-h-40 items-center justify-center px-6 text-center text-base text-(--session-overview-muted) sm:text-sm">
						No sessions are available in this date range.
					</div>
				) : (
					<>
						<ul aria-label="Recent sessions" className="list-none">
							{tableState.visibleSessions.map((session) => (
								<NewseshSessionRow
									key={session.session_id}
									activeSessionId={activeSessionId}
									avatarUrl={avatarMap[session.user_id]}
									canOpenSession={canOpenSession}
									getSessionHref={getSessionHref}
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
					</>
				)}
			</div>
		</div>
	);
}
