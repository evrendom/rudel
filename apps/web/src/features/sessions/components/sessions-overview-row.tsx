import type { SessionAnalytics } from "@rudel/api-routes";
import { User } from "lucide-react";
import { Link } from "react-router-dom";
import { DashboardModelBadges } from "@/features/dashboard/components/DashboardModelBadges";
import {
	getRepositoryLabel,
	getSessionIdentifier,
	SESSION_OVERVIEW_GRID_CLASS_NAME,
} from "@/features/sessions/components/sessions-overview-table-utils";
import {
	calculateCost,
	formatCompactNumber,
	formatCurrency,
	formatRoundedDuration,
} from "@/lib/format";
import { formatExactDateTime, formatRelativeTime } from "@/lib/time-utils";
import { cn } from "@/lib/utils";

type SessionsOverviewRowProps = {
	activeSessionId: string | null | undefined;
	avatarUrl: string | undefined;
	canOpenSession: ((session: SessionAnalytics) => boolean) | undefined;
	getSessionHref: ((session: SessionAnalytics) => string) | undefined;
	getSessionLinkState: ((session: SessionAnalytics) => unknown) | undefined;
	maximumSessionTokens: number;
	onSessionClick: ((session: SessionAnalytics) => void) | undefined;
	session: SessionAnalytics;
	userLabel: string;
};

export function SessionsOverviewRow({
	activeSessionId,
	avatarUrl,
	canOpenSession,
	getSessionHref,
	getSessionLinkState,
	maximumSessionTokens,
	onSessionClick,
	session,
	userLabel,
}: SessionsOverviewRowProps) {
	const sessionHref = getSessionHref?.(session);
	const repositoryLabel = getRepositoryLabel(session);
	const fullRepositoryLabel =
		session.repository || session.project_path || repositoryLabel;
	const sessionCost = calculateCost(
		session.input_tokens,
		session.output_tokens,
		session.model_used,
	);
	const isClickable =
		(onSessionClick !== undefined || sessionHref !== undefined) &&
		(canOpenSession?.(session) ?? true);
	const isActive = activeSessionId === session.session_id;
	const rowClassName = cn(
		"group/session grid h-11 w-full text-left outline-none focus-visible:z-20 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--session-overview-accent) sm:h-9",
		SESSION_OVERVIEW_GRID_CLASS_NAME,
		isClickable ? "cursor-pointer" : "cursor-default opacity-65",
	);
	const cellClassName = cn(
		"flex min-w-0 items-center border-r border-b border-(--session-overview-border) bg-(--session-overview-surface) px-3",
		isClickable &&
			"group-hover/session:bg-(--session-overview-hover) group-focus-visible/session:bg-(--session-overview-hover)",
		isActive && "bg-(--session-overview-hover)",
	);
	const rowContents = (
		<>
			<div className={cn(cellClassName, "sticky left-0 z-10 px-4")}>
				<p
					className="min-w-0 truncate font-mono text-base font-medium tabular-nums text-(--session-overview-text) sm:text-sm"
					title={session.session_id.toUpperCase()}
				>
					{getSessionIdentifier(session.session_id)}
				</p>
			</div>
			<div className={cellClassName} title={userLabel}>
				{avatarUrl ? (
					<img
						alt=""
						className="size-4 shrink-0 rounded-full object-cover outline-1 -outline-offset-1 outline-black/5 dark:outline-white/10"
						height={16}
						src={avatarUrl}
						width={16}
					/>
				) : (
					<User
						aria-hidden="true"
						className="size-4 h-lh shrink-0 stroke-(--session-overview-muted)"
					/>
				)}
				<p className="min-w-0 truncate pl-1.5 text-base font-medium tracking-[-0.01em] text-(--session-overview-text) sm:text-sm">
					{userLabel}
				</p>
			</div>
			<div className={cellClassName}>
				<p
					className="min-w-0 truncate text-base font-medium tracking-[-0.01em] text-(--session-overview-text) sm:text-sm"
					title={fullRepositoryLabel}
				>
					{repositoryLabel}
				</p>
			</div>
			<div className={cellClassName}>
				<div className="flex min-w-0 items-center overflow-hidden">
					<DashboardModelBadges models={[session.model_used]} />
				</div>
			</div>
			<div className={cn(cellClassName, "justify-end")}>
				<div className="flex min-w-0 items-center justify-end gap-2">
					<p className="truncate font-mono text-base tabular-nums text-(--session-overview-muted) sm:text-sm">
						{formatCompactNumber(session.total_tokens)}
					</p>
					<progress
						aria-label={`${session.total_tokens.toLocaleString()} tokens relative to the largest session`}
						className="h-1.5 w-8 shrink-0 appearance-none overflow-hidden rounded-full bg-(--session-overview-border) [&::-moz-progress-bar]:rounded-full [&::-moz-progress-bar]:bg-(--session-overview-accent) [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-bar]:bg-(--session-overview-border) [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-(--session-overview-accent)"
						max={Math.max(maximumSessionTokens, 1)}
						value={session.total_tokens}
					/>
				</div>
			</div>
			<div className={cn(cellClassName, "justify-end")}>
				<p className="truncate font-mono text-base tabular-nums text-(--session-overview-muted) sm:text-sm">
					{formatCurrency(sessionCost)}
				</p>
			</div>
			<div className={cn(cellClassName, "justify-end")}>
				<p className="truncate font-mono text-base tabular-nums text-(--session-overview-muted) sm:text-sm">
					{formatRoundedDuration(session.duration_min)}
				</p>
			</div>
			<div className={cn(cellClassName, "justify-end")}>
				<time
					dateTime={session.session_date}
					title={formatExactDateTime(session.session_date)}
					className="whitespace-nowrap text-base tabular-nums text-(--session-overview-muted) sm:text-sm"
				>
					{formatRelativeTime(session.session_date)}
				</time>
			</div>
		</>
	);

	return (
		<li>
			{isClickable && sessionHref ? (
				<Link
					aria-current={isActive ? "page" : undefined}
					className={rowClassName}
					data-dashboard-grid-row-scope="session"
					data-selected={isActive ? "true" : undefined}
					onClick={() => onSessionClick?.(session)}
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
				>
					{rowContents}
				</button>
			) : (
				<div className={rowClassName} data-dashboard-grid-row-scope="session">
					{rowContents}
				</div>
			)}
		</li>
	);
}
