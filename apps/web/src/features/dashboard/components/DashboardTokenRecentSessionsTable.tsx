import type { SessionAnalytics } from "@rudel/api-routes";
import { useState } from "react";
import { Skeleton } from "@/app/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
	DashboardCellStack,
	DashboardGridTable,
	DashboardTableFooterNote,
} from "@/features/dashboard/components/DashboardGridTable";
import { DashboardModelBadges } from "@/features/dashboard/components/DashboardModelBadges";
import { DashboardTokenCostCell } from "@/features/dashboard/components/DashboardTokenCostCell";
import { useUserMap } from "@/features/workspace/hooks/useUserMap";
import {
	formatCompactNumber,
	formatMinutes,
	formatUsername,
} from "@/lib/format";
import { formatRelativeTime } from "@/lib/time-utils";
import { cn } from "@/lib/utils";

const SKELETON_ROWS = 5;
const SKELETON_ROW_IDS = [
	"token-session-skeleton-1",
	"token-session-skeleton-2",
	"token-session-skeleton-3",
	"token-session-skeleton-4",
	"token-session-skeleton-5",
] as const;
const INITIAL_VISIBLE_ROWS = 10;
const VISIBLE_ROW_INCREMENT = 10;
// Every column except Repository is sized to its widest realistic value so the
// table fits the dashboard content box without horizontal scrolling. Repository
// absorbs the leftover width because it holds the longest, most variable label;
// Developer and Repository both truncate once their track runs out.
const SESSIONS_GRID_TEMPLATE_COLUMNS =
	"120px 160px minmax(0,1fr) 116px 104px 120px 76px";
const SESSIONS_MIN_WIDTH_CLASS_NAME = "min-w-[58rem]";
const SESSIONS_COLUMN_GAP_CLASS_NAME = "gap-4";

function formatSessionTimestamp(value: string) {
	const normalizedValue = value.endsWith("Z") ? value : `${value}Z`;
	const date = new Date(normalizedValue);

	if (Number.isNaN(date.getTime())) {
		return value;
	}

	return date.toLocaleString(undefined, {
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
	});
}

function getRepositoryLabel(session: SessionAnalytics) {
	const primaryPath = session.repository || session.project_path;
	const segments = primaryPath.split("/").filter(Boolean);

	if (segments.length === 0) {
		return "—";
	}

	return segments.slice(-2).join("/");
}

function getModelList(session: SessionAnalytics) {
	return session.model_used ? [session.model_used] : [];
}

function formatTokenMix(session: SessionAnalytics) {
	if (session.total_tokens <= 0) {
		return "—";
	}

	const inputShare = Math.round(
		(session.input_tokens / session.total_tokens) * 100,
	);
	const outputShare = Math.max(100 - inputShare, 0);

	return `${inputShare} IN (incl. cache) / ${outputShare} OUT`;
}

function DashboardTokenRecentSessionsTimeCell({
	sessionDate,
}: {
	sessionDate: string;
}) {
	return (
		<DashboardCellStack
			primary={formatRelativeTime(sessionDate)}
			secondary={formatSessionTimestamp(sessionDate)}
			primaryClassName="font-medium"
		/>
	);
}

function DashboardTokenRecentSessionsTableSkeleton({
	showHeader,
}: {
	showHeader: boolean;
}) {
	return (
		<div className="grid gap-3">
			{showHeader ? (
				<div className="flex items-center justify-between gap-3 px-1">
					<h3 className="dashboardy-section-title text-lg/6 text-[color:var(--dashboardy-heading)]">
						Latest sessions
					</h3>
					<Skeleton className="h-4 w-28 rounded-full" />
				</div>
			) : null}
			<div className="overflow-x-auto">
				<div className={`flex flex-col gap-1 ${SESSIONS_MIN_WIDTH_CLASS_NAME}`}>
					<div
						className={`grid px-3.5 text-[13px] font-semibold text-[color:var(--dashboardy-muted)] ${SESSIONS_COLUMN_GAP_CLASS_NAME}`}
						style={{ gridTemplateColumns: SESSIONS_GRID_TEMPLATE_COLUMNS }}
					>
						<p>Time</p>
						<p>Developer</p>
						<p>Repository</p>
						<p>Model</p>
						<p>Tokens</p>
						<p>Cost</p>
						<p>Duration</p>
					</div>
					<div className="grid gap-0">
						{SKELETON_ROW_IDS.slice(0, SKELETON_ROWS).map((rowId) => (
							<div
								key={rowId}
								className={`grid min-h-12 items-center rounded-lg px-3.5 py-2 odd:bg-[color:var(--dashboardy-subsurface-strong)] ${SESSIONS_COLUMN_GAP_CLASS_NAME}`}
								style={{ gridTemplateColumns: SESSIONS_GRID_TEMPLATE_COLUMNS }}
							>
								<Skeleton className="h-4 w-16 rounded-full" />
								<Skeleton className="h-4 w-28 rounded-full" />
								<Skeleton className="h-4 w-24 rounded-full" />
								<Skeleton className="h-6 w-24 rounded-full" />
								<div className="grid gap-1">
									<Skeleton className="h-4 w-16 rounded-full" />
									<Skeleton className="h-3 w-24 rounded-full" />
								</div>
								<Skeleton className="h-4 w-16 rounded-full" />
								<Skeleton className="h-4 w-16 rounded-full" />
							</div>
						))}
					</div>
				</div>
			</div>
		</div>
	);
}

export function DashboardTokenRecentSessionsTable({
	activeSessionId,
	canOpenSession,
	highlightSource,
	highlightedSessionId,
	isLoading = false,
	onHighlightSessionChange,
	onSessionClick,
	sessions,
	sessionDetailDisabledNote,
	showHeader = true,
	totalSessionCount,
}: {
	activeSessionId?: string | null;
	canOpenSession?: (session: SessionAnalytics) => boolean;
	highlightSource?: "chart" | "table" | null;
	highlightedSessionId?: string | null;
	isLoading?: boolean;
	onHighlightSessionChange?: (sessionId: string | null) => void;
	onSessionClick?: (session: SessionAnalytics) => void;
	sessions: SessionAnalytics[] | undefined;
	sessionDetailDisabledNote?: string;
	showHeader?: boolean;
	totalSessionCount: number;
}) {
	const [hoveredSessionId, setHoveredSessionId] = useState<string | null>(null);
	const { userMap } = useUserMap();
	const recentSessions = sessions ?? [];
	const [visibleRowCount, setVisibleRowCount] =
		useState<number>(INITIAL_VISIBLE_ROWS);
	const visibleSessions = recentSessions.slice(0, visibleRowCount);
	const remainingLoadedSessionCount = Math.max(
		recentSessions.length - visibleSessions.length,
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
	const hasHoveredSession = hoveredSessionId != null;
	const hasActiveSession = activeSessionId != null;
	const canShowSessionHoverPreview = onSessionClick !== undefined;

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
			<DashboardTokenRecentSessionsTableSkeleton showHeader={showHeader} />
		);
	}

	if (recentSessions.length === 0) {
		return (
			<div className="rounded-[1.2rem] border border-[color:var(--dashboardy-border)] bg-[color:var(--dashboardy-subsurface)] px-6 py-8 text-center text-sm text-[color:var(--dashboardy-muted)]">
				No recent sessions in the selected range.
			</div>
		);
	}

	return (
		<div className="grid gap-3">
			{showHeader ? (
				<div className="flex items-center justify-between gap-3 px-1">
					<h3 className="dashboardy-section-title text-lg/6 text-[color:var(--dashboardy-heading)]">
						Latest sessions
					</h3>
					<p className="text-[13px] font-medium text-[color:var(--dashboardy-muted)]">
						Showing {visibleSessions.length} of {recentSessions.length} sessions
					</p>
				</div>
			) : null}
			{sessionDetailDisabledNote ? (
				<p className="px-1 text-[13px] font-medium text-[color:var(--dashboardy-muted)]">
					{sessionDetailDisabledNote}
				</p>
			) : null}
			<DashboardGridTable
				columns={[
					{
						id: "time",
						header: "Time",
						renderCell: (session) => (
							<DashboardTokenRecentSessionsTimeCell
								sessionDate={session.session_date}
							/>
						),
					},
					{
						id: "developer",
						header: "Developer",
						renderCell: (session) => {
							const developerLabel = formatUsername(session.user_id, userMap);

							return (
								<p
									className="truncate font-semibold text-[color:var(--dashboardy-heading)]"
									title={developerLabel}
								>
									{developerLabel}
								</p>
							);
						},
					},
					{
						id: "repository",
						header: "Repository",
						renderCell: (session) => {
							const repositoryLabel = getRepositoryLabel(session);
							const fullRepositoryLabel =
								session.repository || session.project_path || repositoryLabel;

							return (
								<p
									className="truncate font-medium text-[color:var(--dashboardy-heading)]"
									title={fullRepositoryLabel}
								>
									{repositoryLabel}
								</p>
							);
						},
					},
					{
						id: "model",
						header: "Model",
						renderCell: (session) => {
							const modelList = getModelList(session);

							return (
								<div className="flex min-w-0 flex-wrap items-center gap-1.5">
									{modelList.length > 0 ? (
										<DashboardModelBadges models={modelList} />
									) : (
										<span className="text-[12px] text-[color:var(--dashboardy-muted)]">
											—
										</span>
									)}
								</div>
							);
						},
					},
					{
						id: "tokens",
						header: "Tokens",
						renderCell: (session) => (
							<DashboardCellStack
								primary={formatCompactNumber(session.total_tokens)}
								secondary={formatTokenMix(session)}
								primaryClassName="font-medium tabular-nums"
								secondaryClassName="font-medium tabular-nums uppercase tracking-[0.02em]"
							/>
						),
					},
					{
						id: "cost",
						header: "Cost",
						renderCell: (session) => (
							<DashboardTokenCostCell
								cost={session.estimated_cost}
								showDetailedCost
							/>
						),
					},
					{
						id: "duration",
						header: "Duration",
						renderCell: (session) => (
							<p className="font-medium tabular-nums text-[color:var(--dashboardy-heading)]">
								{formatMinutes(session.duration_min)}
							</p>
						),
					},
				]}
				rows={visibleSessions}
				rowKey={(session) => session.session_id}
				gridTemplateColumns={SESSIONS_GRID_TEMPLATE_COLUMNS}
				minWidthClassName={SESSIONS_MIN_WIDTH_CLASS_NAME}
				columnGapClassName={SESSIONS_COLUMN_GAP_CLASS_NAME}
				onRowHoverChange={
					canShowSessionHoverPreview ? handleRowHoverChange : undefined
				}
				getHoverRowId={(session) => session.session_id}
				onRowClick={onSessionClick}
				isRowClickable={canOpenSession}
				isRowSelected={(session) => activeSessionId === session.session_id}
				rowInteractionScope="session"
				rowClassName={(session) =>
					cn(
						"w-full text-left focus:outline-none focus-visible:outline-none focus-visible:ring-0",
						onSessionClick &&
							(canOpenSession?.(session) ?? true) &&
							"cursor-pointer",
						hasActiveSession &&
							"bg-[color:var(--dashboardy-surface)] odd:bg-[color:var(--dashboardy-surface)]",
						(hasActiveSession || hasHoveredSession) &&
							!isSessionFocused(session.session_id) &&
							"opacity-40",
						canShowSessionHoverPreview &&
							hoveredSessionId === session.session_id &&
							"bg-[color:var(--dashboardy-subsurface-strong)] odd:bg-[color:var(--dashboardy-subsurface-strong)]",
						activeSessionId === session.session_id &&
							"bg-[color:var(--dashboardy-subsurface-strong)] odd:bg-[color:var(--dashboardy-subsurface-strong)]",
						hasTableHighlight &&
							"bg-[color:var(--dashboardy-surface)] odd:bg-[color:var(--dashboardy-surface)]",
						hasChartHighlight &&
							highlightedSessionId === session.session_id &&
							"bg-[color:var(--dashboardy-surface)] odd:bg-[color:var(--dashboardy-surface)]",
						hasTableHighlight &&
							highlightedSessionId === session.session_id &&
							"bg-[color:var(--dashboardy-subsurface-strong)] odd:bg-[color:var(--dashboardy-subsurface-strong)]",
						onSessionClick &&
							!(canOpenSession?.(session) ?? true) &&
							"cursor-default opacity-75",
					)
				}
				footer={
					remainingLoadedSessionCount > 0 || unloadedSessionCount > 0 ? (
						<DashboardTableFooterNote>
							<div className="flex flex-wrap items-center justify-end gap-2">
								{remainingLoadedSessionCount > 0 ? (
									<Button
										type="button"
										variant="ghost"
										size="sm"
										className="h-auto rounded-full px-3 py-1.5 text-[12px] font-semibold text-[color:var(--dashboardy-heading)] hover:bg-[color:var(--dashboardy-subsurface-strong)]"
										onClick={() =>
											setVisibleRowCount(
												(currentCount) => currentCount + VISIBLE_ROW_INCREMENT,
											)
										}
									>
										Show 10 more rows
									</Button>
								) : null}
								{unloadedSessionCount > 0 ? (
									<p>{unloadedSessionCount} more not shown</p>
								) : null}
							</div>
						</DashboardTableFooterNote>
					) : null
				}
			/>
		</div>
	);
}
