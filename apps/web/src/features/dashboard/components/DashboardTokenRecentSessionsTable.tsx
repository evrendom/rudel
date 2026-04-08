import type { SessionAnalytics } from "@rudel/api-routes";
import { Skeleton } from "@/app/ui/skeleton";
import {
	DashboardCellStack,
	DashboardGridTable,
	DashboardTableFooterNote,
} from "@/features/dashboard/components/DashboardGridTable";
import { DashboardModelBadges } from "@/features/dashboard/components/DashboardModelBadges";
import { DashboardTokenCostCell } from "@/features/dashboard/components/DashboardTokenCostCell";
import { useUserMap } from "@/hooks/useUserMap";
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

	return `${inputShare} IN / ${outputShare} OUT`;
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
				<div className="flex min-w-[78rem] flex-col gap-1">
					<div className="grid grid-cols-[120px_minmax(180px,11fr)_minmax(180px,9fr)_minmax(180px,9fr)_140px_minmax(180px,0.95fr)_120px] gap-6 px-3.5 text-[13px] font-semibold text-[color:var(--dashboardy-muted)]">
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
								className="grid min-h-12 grid-cols-[120px_minmax(180px,11fr)_minmax(180px,9fr)_minmax(180px,9fr)_140px_minmax(180px,0.95fr)_120px] items-center gap-6 rounded-lg px-3.5 py-2 odd:bg-[color:var(--dashboardy-subsurface-strong)]"
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
	highlightSource,
	highlightedSessionId,
	isLoading = false,
	onHighlightSessionChange,
	sessions,
	showHeader = true,
	totalSessionCount,
}: {
	highlightSource?: "chart" | "table" | null;
	highlightedSessionId?: string | null;
	isLoading?: boolean;
	onHighlightSessionChange?: (sessionId: string | null) => void;
	sessions: SessionAnalytics[] | undefined;
	showHeader?: boolean;
	totalSessionCount: number;
}) {
	const { userMap } = useUserMap();
	const recentSessions = sessions ?? [];
	const hiddenSessionCount = Math.max(
		totalSessionCount - recentSessions.length,
		0,
	);
	const hasTableHighlight =
		highlightSource === "table" && highlightedSessionId != null;
	const hasChartHighlight =
		highlightSource === "chart" && highlightedSessionId != null;

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
						Last {recentSessions.length} sessions
					</p>
				</div>
			) : null}
			<DashboardGridTable
				columns={[
					{
						id: "time",
						header: "Time",
						renderCell: (session) => (
							<DashboardCellStack
								primary={formatRelativeTime(session.session_date)}
								secondary={formatSessionTimestamp(session.session_date)}
								primaryClassName="font-medium"
							/>
						),
					},
					{
						id: "developer",
						header: "Developer",
						renderCell: (session) => (
							<p className="truncate font-semibold text-[color:var(--dashboardy-heading)]">
								{formatUsername(session.user_id, userMap)}
							</p>
						),
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
								inputTokens={session.input_tokens}
								outputTokens={session.output_tokens}
								model={session.model_used}
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
				rows={recentSessions}
				rowKey={(session) => session.session_id}
				gridTemplateColumns="120px minmax(180px,11fr) minmax(180px,9fr) minmax(180px,9fr) 140px minmax(180px,0.95fr) 120px"
				minWidthClassName="min-w-[82rem]"
				onRowHoverChange={onHighlightSessionChange}
				getHoverRowId={(session) => session.session_id}
				rowClassName={(session) =>
					cn(
						"w-full text-left transition-colors duration-300 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)]",
						hasTableHighlight &&
							"bg-[color:var(--dashboardy-surface)] odd:bg-[color:var(--dashboardy-surface)]",
						hasChartHighlight &&
							highlightedSessionId === session.session_id &&
							"bg-[color:var(--dashboardy-surface)] odd:bg-[color:var(--dashboardy-surface)]",
						hasTableHighlight &&
							highlightedSessionId === session.session_id &&
							"bg-[color:var(--dashboardy-subsurface-strong)] odd:bg-[color:var(--dashboardy-subsurface-strong)]",
					)
				}
				footer={
					hiddenSessionCount > 0 ? (
						<DashboardTableFooterNote>
							{/* TODO: Turn this footer count into a real drill-down affordance from the token tab. */}
							<p>{hiddenSessionCount} more</p>
						</DashboardTableFooterNote>
					) : null
				}
			/>
		</div>
	);
}
