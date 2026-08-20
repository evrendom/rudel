import type { SessionAnalytics } from "@rudel/api-routes";
import { ChevronDown, ChevronUp, User } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useLoadMoreIntersectionObserver } from "@/app/hooks/useLoadMoreIntersectionObserver";
import { Skeleton } from "@/app/ui/skeleton";
import { DashboardModelBadges } from "@/features/dashboard/components/DashboardModelBadges";
import { getSessionTimestamp } from "@/features/sessions/session-ordering";
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

const SKELETON_ROW_IDS = [
	"token-session-skeleton-1",
	"token-session-skeleton-2",
	"token-session-skeleton-3",
	"token-session-skeleton-4",
	"token-session-skeleton-5",
] as const;
const SESSION_ROW_BATCH_SIZE = 50;
const EMPTY_SESSIONS: readonly SessionAnalytics[] = [];
const SESSION_COLUMNS = [
	{ align: "left", key: "session", label: "Session" },
	{ align: "left", key: "user", label: "User" },
	{ align: "left", key: "repository", label: "Repository" },
	{ align: "left", key: "model", label: "Model" },
	{ align: "right", key: "tokens", label: "Tokens" },
	{ align: "right", key: "cost", label: "Cost" },
	{ align: "right", key: "duration", label: "Duration" },
	{ align: "right", key: "time", label: "Time" },
] as const;

type SessionColumnKey = (typeof SESSION_COLUMNS)[number]["key"];
type SessionSortKey = SessionColumnKey;
type SortDirection = "asc" | "desc";
type SessionTablePresentation = "default" | "overview";

type SessionSortState = {
	key: SessionSortKey;
	direction: SortDirection;
};

function isSessionSortKey(value: string): value is SessionSortKey {
	return SESSION_COLUMNS.some((column) => column.key === value);
}

function getInitialSortDirection(sortKey: SessionSortKey): SortDirection {
	switch (sortKey) {
		case "tokens":
		case "cost":
		case "duration":
		case "time":
			return "desc";
		default:
			return "asc";
	}
}

function SortableSessionColumnHeader({
	align = "left",
	label,
	onSort,
	secondaryLabel,
	sort,
	sortKey,
}: {
	align?: "left" | "right";
	label: string;
	onSort: (sortKey: SessionSortKey) => void;
	secondaryLabel?: string;
	sort: SessionSortState;
	sortKey: SessionSortKey;
}) {
	const isActive = sort.key === sortKey;
	const nextDirection =
		isActive && sort.direction === "asc" ? "descending" : "ascending";

	return (
		<button
			type="button"
			aria-label={`Sort by ${label}, ${nextDirection}`}
			className={cn(
				"group/sort relative flex min-h-8 min-w-0 items-center gap-1 whitespace-nowrap rounded-md font-mono text-[0.75rem] font-medium outline-none hover:text-[color:var(--dashboardy-heading)] focus-visible:outline-2 focus-visible:outline-[color:var(--dashboard-01-metric-button-focus-ring)]",
				align === "right" ? "justify-end" : "justify-start",
				isActive
					? "text-[color:var(--dashboardy-heading)]"
					: "text-[color:var(--dashboardy-subtle)]",
			)}
			onClick={() => onSort(sortKey)}
		>
			<span className="truncate">{label}</span>
			{secondaryLabel ? (
				<span className="font-normal tabular-nums text-[color:var(--dashboardy-muted)]">
					{secondaryLabel}
				</span>
			) : null}
			{isActive ? (
				sort.direction === "asc" ? (
					<ChevronUp
						aria-hidden="true"
						className="size-4 h-lh shrink-0 stroke-[color:var(--dashboardy-heading)] transition-transform duration-150 group-hover/sort:-translate-y-px motion-reduce:transition-none"
					/>
				) : (
					<ChevronDown
						aria-hidden="true"
						className="size-4 h-lh shrink-0 stroke-[color:var(--dashboardy-heading)] transition-transform duration-150 group-hover/sort:translate-y-px motion-reduce:transition-none"
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

function getRepositoryLabel(session: SessionAnalytics) {
	const primaryPath = session.repository || session.project_path;
	const segments = primaryPath.split("/").filter(Boolean);

	if (segments.length === 0) {
		return "Untitled project";
	}

	return segments.slice(-2).join("/");
}

function getSessionIdentifier(sessionId: string) {
	const identifier =
		sessionId.split("-")[0]?.slice(0, 8) || sessionId.slice(0, 8);
	return identifier.toUpperCase();
}

function compareSessionLabels(leftValue: string, rightValue: string) {
	return leftValue.localeCompare(rightValue, undefined, {
		numeric: true,
		sensitivity: "base",
	});
}

function DashboardTokenRecentSessionsTableSkeleton({
	presentation,
	showHeader,
}: {
	presentation: SessionTablePresentation;
	showHeader: boolean;
}) {
	return (
		<div
			className={cn(
				"@container/session-table flex flex-col",
				presentation === "default" ? "gap-3" : "gap-0",
			)}
		>
			{showHeader ? (
				<div className="flex items-center justify-between gap-3 px-1">
					<Skeleton className="h-5 w-32 rounded-full" />
					<Skeleton className="h-4 w-24 rounded-full" />
				</div>
			) : null}
			{presentation === "overview" ? (
				<div className="sticky top-12 z-20 flex min-h-12 items-center justify-end border-b border-black/6 bg-[color:var(--dashboardy-surface-opaque)] dark:border-white/8 @5xl/session-table:grid @5xl/session-table:grid-cols-[minmax(6rem,0.65fr)_minmax(8rem,0.9fr)_minmax(10rem,1.15fr)_minmax(7rem,0.75fr)_minmax(7rem,0.7fr)_minmax(4.5rem,0.45fr)_minmax(5rem,0.5fr)_minmax(5.5rem,0.55fr)] @5xl/session-table:gap-x-4 @5xl/session-table:px-2">
					<Skeleton className="h-8 w-36 rounded-lg @5xl/session-table:col-span-full @5xl/session-table:w-full @5xl/session-table:rounded-md" />
				</div>
			) : null}
			<div className="divide-y divide-black/5 dark:divide-white/8">
				{SKELETON_ROW_IDS.map((rowId) => (
					<div
						key={rowId}
						className={cn(
							"grid min-h-24 grid-cols-[minmax(0,1fr)_auto] grid-rows-[auto_auto_auto] items-center gap-x-4 gap-y-2 py-3 @5xl/session-table:min-h-12 @5xl/session-table:grid-cols-[minmax(6rem,0.65fr)_minmax(8rem,0.9fr)_minmax(10rem,1.15fr)_minmax(7rem,0.75fr)_minmax(7rem,0.7fr)_minmax(4.5rem,0.45fr)_minmax(5rem,0.5fr)_minmax(5.5rem,0.55fr)] @5xl/session-table:grid-rows-1",
							presentation === "default"
								? "px-1 @5xl/session-table:py-2"
								: "px-2 @5xl/session-table:py-2.5",
						)}
					>
						<Skeleton className="col-start-1 row-start-1 h-4 w-16 rounded-full" />
						<div className="col-start-1 row-start-2 flex items-center gap-2 @5xl/session-table:col-start-2 @5xl/session-table:row-start-1">
							<Skeleton className="size-5 rounded-full" />
							<Skeleton className="h-4 w-20 rounded-full" />
						</div>
						<Skeleton className="col-start-2 row-start-2 h-4 w-28 justify-self-end rounded-full @5xl/session-table:col-start-3 @5xl/session-table:row-start-1 @5xl/session-table:justify-self-start" />
						<div className="col-span-2 col-start-1 row-start-3 grid grid-cols-4 gap-4 @5xl/session-table:contents">
							<Skeleton className="h-5 w-16 rounded-full @5xl/session-table:col-start-4 @5xl/session-table:row-start-1" />
							<Skeleton className="h-4 w-16 rounded-full @5xl/session-table:col-start-5 @5xl/session-table:row-start-1" />
							<Skeleton className="h-4 w-12 rounded-full @5xl/session-table:col-start-6 @5xl/session-table:row-start-1" />
							<Skeleton className="h-4 w-12 rounded-full @5xl/session-table:col-start-7 @5xl/session-table:row-start-1" />
						</div>
						<Skeleton className="col-start-2 row-start-1 h-4 w-12 justify-self-end rounded-full @5xl/session-table:col-start-8" />
					</div>
				))}
			</div>
		</div>
	);
}

export function DashboardTokenRecentSessionsTable({
	activeSessionId,
	canOpenSession,
	dimInactiveSessions = true,
	highlightSource,
	highlightedSessionId,
	isLoading = false,
	getSessionHref,
	getSessionLinkState,
	onHighlightSessionChange,
	onSessionClick,
	presentation = "default",
	sessionCountLabel,
	sessions,
	sessionDetailDisabledNote,
	showHeader = true,
	totalSessionCount,
}: {
	activeSessionId?: string | null;
	canOpenSession?: (session: SessionAnalytics) => boolean;
	dimInactiveSessions?: boolean;
	highlightSource?: "chart" | "table" | null;
	highlightedSessionId?: string | null;
	isLoading?: boolean;
	getSessionHref?: (session: SessionAnalytics) => string;
	getSessionLinkState?: (session: SessionAnalytics) => unknown;
	onHighlightSessionChange?: (sessionId: string | null) => void;
	onSessionClick?: (session: SessionAnalytics) => void;
	presentation?: SessionTablePresentation;
	sessionCountLabel?: number;
	sessions: SessionAnalytics[] | undefined;
	sessionDetailDisabledNote?: string;
	showHeader?: boolean;
	totalSessionCount: number;
}) {
	const [hoveredSessionId, setHoveredSessionId] = useState<string | null>(null);
	const [sort, setSort] = useState<SessionSortState>({
		key: "time",
		direction: "desc",
	});
	const { avatarMap, userMap } = useUserMap();
	const recentSessions = sessions ?? EMPTY_SESSIONS;
	const resolvedSessionCountLabel = sessionCountLabel ?? totalSessionCount;
	const [visibleRowCount, setVisibleRowCount] = useState<number>(
		SESSION_ROW_BATCH_SIZE,
	);
	const sortedSessions = useMemo(() => {
		return [...recentSessions].sort((leftSession, rightSession) => {
			let comparison = 0;

			switch (sort.key) {
				case "session":
					comparison = compareSessionLabels(
						leftSession.session_id,
						rightSession.session_id,
					);
					break;
				case "user":
					comparison = compareSessionLabels(
						formatUsername(leftSession.user_id, userMap),
						formatUsername(rightSession.user_id, userMap),
					);
					break;
				case "repository":
					comparison = compareSessionLabels(
						getRepositoryLabel(leftSession),
						getRepositoryLabel(rightSession),
					);
					break;
				case "model":
					comparison = compareSessionLabels(
						leftSession.model_used,
						rightSession.model_used,
					);
					break;
				case "tokens":
					comparison = leftSession.total_tokens - rightSession.total_tokens;
					break;
				case "cost":
					comparison =
						calculateCost(leftSession.input_tokens, leftSession.output_tokens, {
							at: leftSession.session_date,
							model: leftSession.model_used,
						}) -
						calculateCost(
							rightSession.input_tokens,
							rightSession.output_tokens,
							{
								at: rightSession.session_date,
								model: rightSession.model_used,
							},
						);
					break;
				case "duration":
					comparison = leftSession.duration_min - rightSession.duration_min;
					break;
				case "time":
					comparison =
						getSessionTimestamp(leftSession.session_date).getTime() -
						getSessionTimestamp(rightSession.session_date).getTime();
					break;
			}

			const directedComparison =
				sort.direction === "asc" ? comparison : -comparison;

			if (directedComparison !== 0) {
				return directedComparison;
			}

			return compareSessionLabels(
				leftSession.session_id,
				rightSession.session_id,
			);
		});
	}, [recentSessions, sort, userMap]);
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
	const hasTableHighlight =
		highlightSource === "table" && highlightedSessionId != null;
	const hasChartHighlight =
		highlightSource === "chart" && highlightedSessionId != null;
	const hasActiveSession = activeSessionId != null;
	const canShowSessionHoverPreview =
		onSessionClick !== undefined || getSessionHref !== undefined;
	const loadNextSessionBatch = useCallback(() => {
		setVisibleRowCount((currentCount) =>
			Math.min(currentCount + SESSION_ROW_BATCH_SIZE, recentSessions.length),
		);
	}, [recentSessions.length]);
	const setLoadMoreElement = useLoadMoreIntersectionObserver({
		enabled: remainingLoadedSessionCount > 0,
		onIntersect: loadNextSessionBatch,
	});

	function handleSort(sortKey: SessionSortKey) {
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

	function handleMobileSortChange(value: string) {
		if (!isSessionSortKey(value)) {
			return;
		}

		setSort((currentSort) => ({
			key: value,
			direction:
				currentSort.key === value
					? currentSort.direction
					: getInitialSortDirection(value),
		}));
	}

	function toggleSortDirection() {
		setSort((currentSort) => ({
			...currentSort,
			direction: currentSort.direction === "asc" ? "desc" : "asc",
		}));
	}

	function handleRowHoverChange(sessionId: string | null) {
		setHoveredSessionId(sessionId);
		onHighlightSessionChange?.(sessionId);
	}

	function isSessionFocused(sessionId: string) {
		return (
			activeSessionId === sessionId ||
			(canShowSessionHoverPreview && hoveredSessionId === sessionId)
		);
	}

	if (isLoading) {
		return (
			<DashboardTokenRecentSessionsTableSkeleton
				presentation={presentation}
				showHeader={showHeader}
			/>
		);
	}

	if (recentSessions.length === 0) {
		return (
			<div className="border-y border-black/6 px-6 py-10 text-center text-base text-[color:var(--dashboardy-muted)] dark:border-white/8 sm:text-sm">
				No recent sessions in the selected range.
			</div>
		);
	}

	return (
		<div
			className={cn(
				"@container/session-table flex min-w-0 flex-col",
				presentation === "default" ? "gap-3" : "gap-0",
			)}
		>
			{showHeader ? (
				<div className="flex items-center justify-between gap-3 px-1">
					<h3 className="dashboardy-section-title text-lg text-[color:var(--dashboardy-heading)]">
						Latest sessions
					</h3>
					<p className="text-base font-medium tabular-nums text-[color:var(--dashboardy-muted)] sm:text-sm">
						{visibleSessions.length} of {recentSessions.length}
					</p>
				</div>
			) : null}
			{sessionDetailDisabledNote ? (
				<p
					className={cn(
						"text-base font-medium text-[color:var(--dashboardy-muted)] sm:text-sm",
						presentation === "default"
							? "px-1"
							: "border-b border-black/6 px-2 py-3 dark:border-white/8",
					)}
				>
					{sessionDetailDisabledNote}
				</p>
			) : null}
			<div
				className={cn(
					"flex min-h-12 items-center justify-between gap-3 @5xl/session-table:hidden",
					presentation === "overview" &&
						"sticky top-12 z-20 border-b border-black/6 bg-[color:var(--dashboardy-surface-opaque)] px-2 dark:border-white/8",
				)}
			>
				<p className="font-mono text-[0.75rem] font-medium tabular-nums text-[color:var(--dashboardy-subtle)]">
					{resolvedSessionCountLabel.toLocaleString()} sessions
				</p>
				<div className="flex shrink-0 items-center gap-2">
					<div className="inline-grid grid-cols-[1fr_--spacing(8)]">
						<select
							aria-label="Sort sessions by"
							className="col-span-full row-start-1 h-9 appearance-none rounded-lg border border-[color:var(--dashboardy-border)] bg-[color:var(--dashboardy-surface-opaque)] py-1.5 pr-8 pl-2.5 text-base font-medium text-[color:var(--dashboardy-heading)] outline-none focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-[color:var(--dashboard-01-metric-button-focus-ring)]"
							name="session-sort-key"
							onChange={(event) =>
								handleMobileSortChange(event.currentTarget.value)
							}
							value={sort.key}
						>
							{SESSION_COLUMNS.map((column) => (
								<option key={column.key} value={column.key}>
									{column.label}
								</option>
							))}
						</select>
						<ChevronDown
							aria-hidden="true"
							className="pointer-events-none col-start-2 row-start-1 size-4 place-self-center shrink-0 stroke-[color:var(--dashboardy-muted)]"
						/>
					</div>
					<button
						type="button"
						aria-label={`Sort ${
							sort.direction === "asc" ? "descending" : "ascending"
						}`}
						className="group/direction relative grid size-9 shrink-0 place-items-center rounded-lg border border-[color:var(--dashboardy-border)] bg-[color:var(--dashboardy-surface-opaque)] text-[color:var(--dashboardy-heading)] outline-none hover:bg-black/3 focus-visible:outline-2 focus-visible:outline-[color:var(--dashboard-01-metric-button-focus-ring)] dark:hover:bg-white/4"
						onClick={toggleSortDirection}
					>
						{sort.direction === "asc" ? (
							<ChevronUp
								aria-hidden="true"
								className="size-4 shrink-0 stroke-[color:var(--dashboardy-heading)] transition-transform duration-150 group-hover/direction:-translate-y-px motion-reduce:transition-none"
							/>
						) : (
							<ChevronDown
								aria-hidden="true"
								className="size-4 shrink-0 stroke-[color:var(--dashboardy-heading)] transition-transform duration-150 group-hover/direction:translate-y-px motion-reduce:transition-none"
							/>
						)}
						<span
							aria-hidden="true"
							className="pointer-fine:hidden absolute top-1/2 left-1/2 size-12 -translate-1/2"
						/>
					</button>
				</div>
			</div>
			<div
				className={cn(
					"hidden min-h-10 grid-cols-[minmax(6rem,0.65fr)_minmax(8rem,0.9fr)_minmax(10rem,1.15fr)_minmax(7rem,0.75fr)_minmax(7rem,0.7fr)_minmax(4.5rem,0.45fr)_minmax(5rem,0.5fr)_minmax(5.5rem,0.55fr)] items-center gap-x-4 @5xl/session-table:grid",
					presentation === "default"
						? "px-1 pb-1"
						: "sticky top-12 z-20 border-b border-black/6 bg-[color:var(--dashboardy-surface-opaque)] px-2 dark:border-white/8",
				)}
			>
				{SESSION_COLUMNS.map((column) => (
					<SortableSessionColumnHeader
						key={column.key}
						align={column.align}
						label={column.label}
						onSort={handleSort}
						secondaryLabel={
							presentation === "overview" && column.key === "session"
								? resolvedSessionCountLabel.toLocaleString()
								: undefined
						}
						sort={sort}
						sortKey={column.key}
					/>
				))}
			</div>
			<ul
				aria-label="Recent sessions"
				className="divide-y divide-black/5 dark:divide-white/8"
				onPointerLeave={() => handleRowHoverChange(null)}
			>
				{visibleSessions.map((session) => {
					const sessionHref = getSessionHref?.(session);
					const repositoryLabel = getRepositoryLabel(session);
					const fullRepositoryLabel =
						session.repository || session.project_path || repositoryLabel;
					const developerLabel = formatUsername(session.user_id, userMap);
					const userImageUrl = avatarMap?.[session.user_id];
					const sessionCost = calculateCost(
						session.input_tokens,
						session.output_tokens,
						{ at: session.session_date, model: session.model_used },
					);
					const isClickable =
						(onSessionClick != null || sessionHref != null) &&
						(canOpenSession?.(session) ?? true);
					const isActive = activeSessionId === session.session_id;
					const isHighlighted = highlightedSessionId === session.session_id;
					const rowClassName = cn(
						"grid min-h-24 w-full grid-cols-[minmax(0,1fr)_auto] grid-rows-[auto_auto_auto] items-center gap-x-4 gap-y-2 py-3 text-left outline-none @5xl/session-table:min-h-12 @5xl/session-table:grid-cols-[minmax(6rem,0.65fr)_minmax(8rem,0.9fr)_minmax(10rem,1.15fr)_minmax(7rem,0.75fr)_minmax(7rem,0.7fr)_minmax(4.5rem,0.45fr)_minmax(5rem,0.5fr)_minmax(5.5rem,0.55fr)] @5xl/session-table:grid-rows-1",
						presentation === "default"
							? "rounded-xl px-1 @5xl/session-table:py-2"
							: "px-2 @5xl/session-table:py-2.5",
						isClickable &&
							"cursor-pointer hover:bg-black/3 focus-visible:bg-black/3 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[color:var(--dashboard-01-metric-button-focus-ring)] dark:hover:bg-white/4 dark:focus-visible:bg-white/4",
						hasActiveSession &&
							"bg-[color:var(--dashboardy-surface)] odd:bg-[color:var(--dashboardy-surface)]",
						dimInactiveSessions &&
							hasActiveSession &&
							!isSessionFocused(session.session_id) &&
							"opacity-40",
						canShowSessionHoverPreview &&
							hoveredSessionId === session.session_id &&
							"bg-black/3 dark:bg-white/4",
						isActive &&
							"bg-[color:var(--dashboardy-subsurface-strong)] odd:bg-[color:var(--dashboardy-subsurface-strong)]",
						hasTableHighlight && !isHighlighted && "opacity-45",
						hasChartHighlight && isHighlighted && "bg-black/3 dark:bg-white/4",
						(onSessionClick || getSessionHref) &&
							!isClickable &&
							"cursor-default opacity-70",
					);
					const rowContents = (
						<>
							<p
								className="col-start-1 row-start-1 min-w-0 truncate font-mono text-base font-medium tabular-nums text-[color:var(--dashboardy-heading)] sm:text-sm"
								title={session.session_id.toUpperCase()}
							>
								{getSessionIdentifier(session.session_id)}
							</p>
							<div
								className="col-start-1 row-start-2 flex min-w-0 items-center gap-2 @5xl/session-table:col-start-2 @5xl/session-table:row-start-1"
								title={developerLabel}
							>
								{userImageUrl ? (
									<img
										alt=""
										className="size-5 shrink-0 rounded-full object-cover outline-1 -outline-offset-1 outline-black/5 dark:outline-white/10"
										height={20}
										src={userImageUrl}
										width={20}
									/>
								) : (
									<User
										aria-hidden="true"
										className="size-4 shrink-0 stroke-[color:var(--dashboardy-muted)]"
									/>
								)}
								<p className="min-w-0 truncate text-base font-medium text-[color:var(--dashboardy-heading)] sm:text-sm">
									{developerLabel}
								</p>
							</div>
							<p
								className="col-start-2 row-start-2 min-w-0 truncate text-right text-base font-medium text-[color:var(--dashboardy-heading)] sm:text-sm @5xl/session-table:col-start-3 @5xl/session-table:row-start-1 @5xl/session-table:text-left"
								title={fullRepositoryLabel}
							>
								{repositoryLabel}
							</p>
							<dl className="col-span-2 col-start-1 row-start-3 grid min-w-0 grid-cols-4 gap-4 @5xl/session-table:contents">
								<div className="min-w-0 @5xl/session-table:col-start-4 @5xl/session-table:row-start-1">
									<dt className="font-mono text-[0.75rem] text-[color:var(--dashboardy-subtle)] @5xl/session-table:sr-only">
										Model
									</dt>
									<dd className="flex min-w-0 items-center">
										<DashboardModelBadges models={[session.model_used]} />
									</dd>
								</div>
								<div className="min-w-0 text-right @5xl/session-table:col-start-5 @5xl/session-table:row-start-1">
									<dt className="font-mono text-[0.75rem] text-[color:var(--dashboardy-subtle)] @5xl/session-table:sr-only">
										Tokens
									</dt>
									<dd className="flex items-center justify-end gap-2 font-mono text-base tabular-nums text-[color:var(--dashboardy-muted)] sm:text-sm">
										<span>{formatCompactNumber(session.total_tokens)}</span>
										<progress
											aria-label={`${session.total_tokens.toLocaleString()} tokens relative to the largest session`}
											className="h-1.5 w-8 shrink-0 appearance-none overflow-hidden rounded-full bg-[color:var(--dashboardy-border)] [&::-moz-progress-bar]:rounded-full [&::-moz-progress-bar]:bg-[color:var(--dashboardy-accent)] [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-bar]:bg-[color:var(--dashboardy-border)] [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-[color:var(--dashboardy-accent)]"
											max={Math.max(maximumSessionTokens, 1)}
											value={session.total_tokens}
										/>
									</dd>
								</div>
								<div className="min-w-0 text-right @5xl/session-table:col-start-6 @5xl/session-table:row-start-1">
									<dt className="font-mono text-[0.75rem] text-[color:var(--dashboardy-subtle)] @5xl/session-table:sr-only">
										Cost
									</dt>
									<dd className="font-mono text-base tabular-nums text-[color:var(--dashboardy-muted)] sm:text-sm">
										{formatCurrency(sessionCost)}
									</dd>
								</div>
								<div className="min-w-0 text-right @5xl/session-table:col-start-7 @5xl/session-table:row-start-1">
									<dt className="font-mono text-[0.75rem] text-[color:var(--dashboardy-subtle)] @5xl/session-table:sr-only">
										Duration
									</dt>
									<dd className="font-mono text-base tabular-nums text-[color:var(--dashboardy-muted)] sm:text-sm">
										{formatRoundedDuration(session.duration_min)}
									</dd>
								</div>
							</dl>
							<time
								dateTime={session.session_date}
								title={formatExactDateTime(session.session_date)}
								className="col-start-2 row-start-1 whitespace-nowrap text-right text-base tabular-nums text-[color:var(--dashboardy-muted)] sm:text-sm @5xl/session-table:col-start-8"
							>
								{formatRelativeTime(session.session_date)}
							</time>
						</>
					);

					return (
						<li key={session.session_id}>
							{isClickable && sessionHref ? (
								<Link
									aria-current={isActive ? "page" : undefined}
									className={rowClassName}
									data-dashboard-grid-row-scope="session"
									data-selected={isActive ? "true" : undefined}
									onBlur={() => handleRowHoverChange(null)}
									onClick={() => onSessionClick?.(session)}
									onFocus={() => handleRowHoverChange(session.session_id)}
									onMouseEnter={() => handleRowHoverChange(session.session_id)}
									state={getSessionLinkState?.(session)}
									to={sessionHref}
									viewTransition
								>
									{rowContents}
								</Link>
							) : isClickable && onSessionClick ? (
								<button
									type="button"
									aria-pressed={isActive}
									className={rowClassName}
									data-dashboard-grid-row-scope="session"
									data-selected={isActive ? "true" : undefined}
									onClick={() => onSessionClick(session)}
									onFocus={() => handleRowHoverChange(session.session_id)}
									onBlur={() => handleRowHoverChange(null)}
									onMouseEnter={() => handleRowHoverChange(session.session_id)}
								>
									{rowContents}
								</button>
							) : (
								<div
									className={rowClassName}
									data-dashboard-grid-row-scope="session"
								>
									{rowContents}
								</div>
							)}
						</li>
					);
				})}
			</ul>
			{remainingLoadedSessionCount > 0 ? (
				<div
					ref={setLoadMoreElement}
					aria-hidden="true"
					className="h-px w-full"
				/>
			) : null}
			{remainingLoadedSessionCount === 0 && unloadedSessionCount > 0 ? (
				<p className="px-1 pt-2 text-right text-base font-medium tabular-nums text-[color:var(--dashboardy-muted)] sm:text-sm">
					{unloadedSessionCount} more not shown
				</p>
			) : null}
		</div>
	);
}
