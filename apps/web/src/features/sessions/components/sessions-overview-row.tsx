import type { SessionAnalytics } from "@rudel/api-routes";
import { User } from "lucide-react";
import { Link } from "react-router-dom";
import { DashboardModelBadges } from "@/features/dashboard/components/DashboardModelBadges";
import {
	getRepositoryLabel,
	SESSION_OVERVIEW_GRID_CLASS_NAME,
	SESSION_OVERVIEW_SECOND_FROZEN_COLUMN_LEFT_CLASS_NAME,
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
	maximumSessionCost: number;
	maximumSessionTokens: number;
	onSessionClick: ((session: SessionAnalytics) => void) | undefined;
	session: SessionAnalytics;
	userLabel: string;
};

function SessionMetricProgress({
	label,
	maximumValue,
	value,
}: {
	label: string;
	maximumValue: number;
	value: number;
}) {
	return (
		<progress
			aria-label={label}
			className="h-1.5 w-8 shrink-0 appearance-none overflow-hidden rounded-full bg-(--session-overview-border) [&::-moz-progress-bar]:rounded-full [&::-moz-progress-bar]:bg-(--session-overview-accent) [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-bar]:bg-(--session-overview-border) [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-(--session-overview-accent)"
			max={maximumValue > 0 ? maximumValue : 1}
			value={value}
		/>
	);
}

export function SessionsOverviewRow({
	activeSessionId,
	avatarUrl,
	canOpenSession,
	getSessionHref,
	getSessionLinkState,
	maximumSessionCost,
	maximumSessionTokens,
	onSessionClick,
	session,
	userLabel,
}: SessionsOverviewRowProps) {
	const sessionHref = getSessionHref?.(session);
	const repositoryLabel = getRepositoryLabel(session);
	const fullRepositoryLabel =
		session.project_path || session.repository || repositoryLabel;
	const sessionCost = calculateCost(
		session.input_tokens,
		session.output_tokens,
		session.model_used,
	);
	const visibleSkills = session.skills.slice(0, 2);
	const additionalSkillCount = Math.max(
		session.skills.length - visibleSkills.length,
		0,
	);
	const skillsTitle =
		session.skills.length > 0 ? session.skills.join(", ") : "No skills used";
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
			<div className={cn(cellClassName, "sticky left-0 z-10")}>
				<time
					dateTime={session.session_date}
					title={formatExactDateTime(session.session_date)}
					className="whitespace-nowrap text-base font-medium tracking-[-0.01em] text-(--session-overview-muted) tabular-nums sm:text-sm"
				>
					{formatRelativeTime(session.session_date)}
				</time>
			</div>
			<div
				className={cn(
					cellClassName,
					"sticky z-10 px-4",
					SESSION_OVERVIEW_SECOND_FROZEN_COLUMN_LEFT_CLASS_NAME,
				)}
			>
				<p
					className="min-w-0 truncate text-base font-medium tracking-[-0.01em] text-(--session-overview-text) sm:text-sm"
					title={fullRepositoryLabel}
				>
					{repositoryLabel}
					{session.worktree ? (
						<span className="text-(--session-overview-muted)">
							{" "}
							/ {session.worktree}
						</span>
					) : null}
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
				<div className="flex min-w-0 items-center overflow-hidden">
					<DashboardModelBadges models={[session.model_used]} size="table" />
				</div>
			</div>
			<div className={cn(cellClassName, "justify-end")}>
				<div className="flex min-w-0 items-center justify-end gap-2">
					<p className="truncate text-base font-medium tracking-[-0.01em] text-(--session-overview-muted) tabular-nums sm:text-sm">
						{formatCompactNumber(session.total_tokens)}
					</p>
					<SessionMetricProgress
						label={`${session.total_tokens.toLocaleString()} tokens relative to the largest session`}
						maximumValue={maximumSessionTokens}
						value={session.total_tokens}
					/>
				</div>
			</div>
			<div className={cn(cellClassName, "justify-end")}>
				<div className="flex min-w-0 items-center justify-end gap-2">
					<p className="truncate text-base font-medium tracking-[-0.01em] text-(--session-overview-muted) tabular-nums sm:text-sm">
						{formatCurrency(sessionCost)}
					</p>
					<SessionMetricProgress
						label={`${formatCurrency(sessionCost)} cost relative to the most expensive session`}
						maximumValue={maximumSessionCost}
						value={sessionCost}
					/>
				</div>
			</div>
			<div className={cn(cellClassName, "justify-end")}>
				<p
					className="truncate text-base font-medium tracking-[-0.01em] text-(--session-overview-muted) tabular-nums sm:text-sm"
					title={`${session.subagent_count.toLocaleString()} ${session.subagent_count === 1 ? "subagent" : "subagents"} used`}
				>
					{session.subagent_count.toLocaleString()}
				</p>
			</div>
			<div className={cn(cellClassName, "justify-end")}>
				<p
					className={cn(
						"truncate text-base font-medium tracking-[-0.01em] tabular-nums sm:text-sm",
						session.error_count > 0
							? "text-red-600 dark:text-red-400"
							: "text-(--session-overview-muted)",
					)}
					title={`${session.error_count.toLocaleString()} detected tool/API ${session.error_count === 1 ? "error" : "errors"}`}
				>
					{session.error_count.toLocaleString()}
				</p>
			</div>
			<div className={cn(cellClassName, "justify-end")}>
				<p className="truncate text-base font-medium tracking-[-0.01em] text-(--session-overview-muted) tabular-nums sm:text-sm">
					{formatRoundedDuration(session.duration_min)}
				</p>
			</div>
			<div className={cellClassName} title={skillsTitle}>
				{visibleSkills.length > 0 ? (
					<div className="flex min-w-0 items-center gap-1.5">
						<p className="min-w-0 truncate text-base font-medium tracking-[-0.01em] text-(--session-overview-text) sm:text-sm">
							{visibleSkills.join(", ")}
						</p>
						{additionalSkillCount > 0 ? (
							<span className="shrink-0 rounded-full bg-(--session-overview-hover) px-1.5 py-0.5 text-base font-medium tracking-[-0.01em] text-(--session-overview-muted) tabular-nums sm:text-sm">
								+{additionalSkillCount}
							</span>
						) : null}
					</div>
				) : (
					<span className="text-base font-medium tracking-[-0.01em] text-(--session-overview-muted) sm:text-sm">
						—
					</span>
				)}
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
