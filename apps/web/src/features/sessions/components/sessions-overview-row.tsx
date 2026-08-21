import type { SessionAnalytics } from "@rudel/api-routes";
import { User } from "lucide-react";
import { Link } from "react-router-dom";
import { DashboardModelBadges } from "@/features/dashboard/components/DashboardModelBadges";
import { SessionModelMark } from "@/features/sessions/components/session-model-mark";
import {
	resolveSessionErrorCount,
	resolveSessionSubagentCount,
} from "@/features/sessions/components/session-overview-metrics";
import {
	getRepositoryLabel,
	getSessionBranchLabel,
	SESSION_OVERVIEW_GRID_CLASS_NAME,
} from "@/features/sessions/components/sessions-overview-table-utils";
import {
	calculateCost,
	formatCompactNumber,
	formatCurrency,
	formatRoundedDuration,
} from "@/lib/format";
import { cn } from "@/lib/utils";

type SessionsOverviewRowProps = {
	activeSessionId: string | null | undefined;
	avatarUrl: string | undefined;
	canOpenSession: ((session: SessionAnalytics) => boolean) | undefined;
	getSessionHref: ((session: SessionAnalytics) => string) | undefined;
	getSessionLinkState: ((session: SessionAnalytics) => unknown) | undefined;
	maximumSessionCost: number;
	maximumSessionDuration: number;
	maximumSessionInputTokens: number;
	maximumSessionOutputTokens: number;
	onSessionClick: ((session: SessionAnalytics) => void) | undefined;
	session: SessionAnalytics;
	userLabel: string;
};

function SessionMetricMagnitude({
	label,
	maximumValue,
	value,
}: {
	label: string;
	maximumValue: number;
	value: number;
}) {
	const magnitude = Math.min(
		100,
		Math.max(0, maximumValue > 0 ? (value / maximumValue) * 100 : 0),
	);
	const roundedMagnitude = Math.round(magnitude);

	return (
		<div
			aria-label={label}
			aria-valuemax={100}
			aria-valuemin={0}
			aria-valuenow={roundedMagnitude}
			className="relative flex size-4 shrink-0 items-center justify-center"
			role="progressbar"
			title={`${roundedMagnitude}% of the largest value in this table`}
		>
			<svg
				aria-hidden="true"
				className="size-4 shrink-0 overflow-visible fill-none"
				viewBox="0 0 16 16"
			>
				<circle
					className="stroke-(--session-overview-border)"
					cx="8"
					cy="8"
					r="6.25"
					strokeWidth="2.5"
				/>
				{magnitude > 0 ? (
					<circle
						className="stroke-(--session-overview-accent)"
						cx="8"
						cy="8"
						pathLength="100"
						r="6.25"
						strokeDasharray={`${magnitude} ${100 - magnitude}`}
						strokeLinecap="round"
						strokeWidth="2.5"
						transform="rotate(-90 8 8)"
					/>
				) : null}
			</svg>
		</div>
	);
}

function getSessionClockParts(dateString: string) {
	const normalizedDate = dateString.endsWith("Z")
		? dateString
		: `${dateString}Z`;
	const date = new Date(normalizedDate);

	if (Number.isNaN(date.getTime())) {
		return { date: "", hour: "—", minute: "", period: "" };
	}

	return {
		date: date.toLocaleDateString("en-US", {
			month: "short",
			day: "numeric",
		}),
		hour: (date.getHours() % 12 || 12).toString().padStart(2, "0"),
		minute: date.getMinutes().toString().padStart(2, "0"),
		period: date.getHours() >= 12 ? "PM" : "AM",
	};
}

export function SessionsOverviewRow({
	activeSessionId,
	avatarUrl,
	canOpenSession,
	getSessionHref,
	getSessionLinkState,
	maximumSessionCost,
	maximumSessionDuration,
	maximumSessionInputTokens,
	maximumSessionOutputTokens,
	onSessionClick,
	session,
	userLabel,
}: SessionsOverviewRowProps) {
	const sessionHref = getSessionHref?.(session);
	const repositoryLabel = getRepositoryLabel(session);
	const branchLabel = getSessionBranchLabel(session);
	const sessionCost = calculateCost(
		session.input_tokens,
		session.output_tokens,
		{
			at: session.session_date,
			model: session.model_used,
		},
	);
	const errorCount = resolveSessionErrorCount(session.error_count);
	const subagentCount = resolveSessionSubagentCount(
		session.subagent_count,
		session.subagent_types,
	);
	const skillsTitle =
		session.skills.length > 0 ? session.skills.join(", ") : "No skills used";
	const isClickable =
		(onSessionClick !== undefined || sessionHref !== undefined) &&
		(canOpenSession?.(session) ?? true);
	const isActive = activeSessionId === session.session_id;
	const clock = getSessionClockParts(session.session_date);
	const clockTimeLabel = `${clock.hour}${clock.minute ? `:${clock.minute}` : ""}${clock.period ? ` ${clock.period}` : ""}`;
	const clockDateTimeLabel = clock.date
		? `${clock.date}, ${clockTimeLabel}`
		: clockTimeLabel;
	const rowClassName = cn(
		"group/session grid h-8 w-full text-left outline-none focus-visible:z-20 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--session-overview-accent)",
		SESSION_OVERVIEW_GRID_CLASS_NAME,
		isClickable ? "cursor-pointer" : "cursor-default opacity-65",
	);
	const cellClassName = cn(
		"flex min-w-0 items-center bg-(--session-overview-surface) px-3",
		isClickable &&
			"group-hover/session:bg-(--session-overview-hover) group-focus-visible/session:bg-(--session-overview-hover)",
		isActive && "bg-(--session-overview-hover)",
	);
	const rowContents = (
		<>
			<div className={cn(cellClassName, "justify-start px-1.5")}>
				<time
					dateTime={session.session_date}
					className="w-full whitespace-nowrap text-right text-xs font-normal tracking-normal text-[#787774] tabular-nums [font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,'Segoe_UI_Variable_Display','Segoe_UI',Helvetica,Arial,sans-serif] dark:text-white/65"
					title={clockDateTimeLabel}
				>
					{clock.date}
				</time>
			</div>
			<div className={cn(cellClassName, "justify-center px-2")}>
				<SessionModelMark
					avatarUrl={avatarUrl}
					model={session.model_used}
					userLabel={userLabel}
				/>
			</div>
			<div className={cellClassName}>
				<p
					className={cn(
						"min-w-0 truncate text-base/5 font-[450] tracking-normal text-(--session-overview-text) sm:text-[0.8125rem]/5",
						branchLabel && "max-w-[55%]",
					)}
					title={repositoryLabel}
				>
					{repositoryLabel}
				</p>
				{branchLabel ? (
					<>
						<span
							aria-hidden="true"
							className="shrink-0 px-1.5 text-(--session-overview-subtle)"
						>
							·
						</span>
						<p
							className="min-w-0 flex-1 truncate text-base/5 font-[450] tracking-normal text-(--session-overview-muted) sm:text-[0.8125rem]/5"
							title={branchLabel}
						>
							{branchLabel}
						</p>
					</>
				) : null}
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
				<p className="min-w-0 truncate pl-1.5 text-base/5 font-[450] tracking-normal text-(--session-overview-text) sm:text-[0.8125rem]/5">
					{userLabel}
				</p>
			</div>
			<div className={cellClassName}>
				<div className="flex min-w-0 items-center overflow-hidden">
					<DashboardModelBadges models={[session.model_used]} size="sm" />
				</div>
			</div>
			<div className={cn(cellClassName, "justify-end")}>
				<div className="flex min-w-0 items-center justify-end gap-1.5">
					<SessionMetricMagnitude
						label={`${formatRoundedDuration(session.duration_min)} relative session length`}
						maximumValue={maximumSessionDuration}
						value={session.duration_min}
					/>
					<p className="truncate text-base/5 font-[450] text-(--session-overview-muted) tabular-nums sm:text-[0.8125rem]/5">
						{formatRoundedDuration(session.duration_min)}
					</p>
				</div>
			</div>
			<div className={cn(cellClassName, "justify-end")}>
				<div className="flex min-w-0 items-center justify-end gap-1.5">
					<SessionMetricMagnitude
						label={`${session.input_tokens.toLocaleString()} input tokens relative to the largest session`}
						maximumValue={maximumSessionInputTokens}
						value={session.input_tokens}
					/>
					<p className="truncate text-base/5 font-[450] text-(--session-overview-muted) tabular-nums sm:text-[0.8125rem]/5">
						{formatCompactNumber(session.input_tokens)}
					</p>
				</div>
			</div>
			<div className={cn(cellClassName, "justify-end")}>
				<div className="flex min-w-0 items-center justify-end gap-1.5">
					<SessionMetricMagnitude
						label={`${session.output_tokens.toLocaleString()} output tokens relative to the largest session`}
						maximumValue={maximumSessionOutputTokens}
						value={session.output_tokens}
					/>
					<p className="truncate text-base/5 font-[450] text-(--session-overview-muted) tabular-nums sm:text-[0.8125rem]/5">
						{formatCompactNumber(session.output_tokens)}
					</p>
				</div>
			</div>
			<div className={cn(cellClassName, "justify-end")}>
				<div className="flex min-w-0 items-center justify-end gap-1.5">
					<SessionMetricMagnitude
						label={`${formatCurrency(sessionCost)} cost relative to the most expensive session`}
						maximumValue={maximumSessionCost}
						value={sessionCost}
					/>
					<p className="truncate text-base/5 font-[450] text-(--session-overview-muted) tabular-nums sm:text-[0.8125rem]/5">
						{formatCurrency(sessionCost)}
					</p>
				</div>
			</div>
			<div className={cn(cellClassName, "justify-end")}>
				<p
					className={cn(
						"truncate text-base/5 font-[450] tabular-nums sm:text-[0.8125rem]/5",
						errorCount > 0
							? "text-red-600 dark:text-red-400"
							: "text-(--session-overview-muted)",
					)}
					title={`${errorCount.toLocaleString()} detected tool/API ${errorCount === 1 ? "error" : "errors"}`}
				>
					{errorCount.toLocaleString()}
				</p>
			</div>
			<div className={cn(cellClassName, "justify-end")}>
				<p
					className="truncate text-base/5 font-[450] text-(--session-overview-muted) tabular-nums sm:text-[0.8125rem]/5"
					title={skillsTitle}
				>
					{session.skills.length.toLocaleString()}
				</p>
			</div>
			<div className={cn(cellClassName, "justify-end")}>
				<p
					className="truncate text-base/5 font-[450] text-(--session-overview-muted) tabular-nums sm:text-[0.8125rem]/5"
					title={`${subagentCount.toLocaleString()} ${subagentCount === 1 ? "subagent" : "subagents"} used`}
				>
					{subagentCount.toLocaleString()}
				</p>
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
