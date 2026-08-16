import type { SessionAnalytics } from "@rudel/api-routes";
import { DashboardSessionsSnapshotSection } from "@/features/dashboard/components/DashboardSessionsSnapshotSection";
import type { SessionsPageData } from "@/features/sessions/use-sessions-page-data";
import { cn } from "@/lib/utils";

type SessionsListSurfaceProps = {
	activeSessionId: string | null;
	canOpenSession: (session: SessionAnalytics) => boolean;
	data: SessionsPageData;
	layout: "page" | "pane" | "workspace";
	onSessionClick: (session: SessionAnalytics) => void;
};

export function SessionsListSurface({
	activeSessionId,
	canOpenSession,
	data,
	layout,
	onSessionClick,
}: SessionsListSurfaceProps) {
	const {
		dateRangeDays,
		endDate,
		headlineMetrics,
		isSnapshotSessionsError,
		isSnapshotSessionsPending,
		isSummaryError,
		isSummaryPending,
		snapshotSessionsData,
		startDate,
		totalSessionCount,
		useRolling24Hours,
	} = data;

	return (
		<div
			className={cn(
				"dashboardy-page min-w-0 overscroll-x-none",
				layout === "page" && "px-4 pb-6 pt-2 sm:px-6 lg:px-[76px] lg:pb-8",
				layout === "pane" && "h-full min-h-0 overflow-y-auto p-4 sm:p-5",
				layout === "workspace" &&
					"flex h-full min-h-0 flex-col overflow-hidden bg-[color:var(--dashboardy-surface-opaque)]",
			)}
		>
			<div
				className={cn(
					"@container/dashboard-page flex w-full min-w-0 flex-col",
					layout === "workspace" && "min-h-0 flex-1 overflow-hidden",
				)}
			>
				<div
					className={cn(
						"flex min-w-0 flex-col",
						layout === "workspace" && "min-h-0 flex-1 overflow-hidden",
					)}
				>
					{isSummaryError || isSnapshotSessionsError ? (
						<div
							className={cn(
								"border-b border-black/6 px-6 py-12 text-center text-[color:var(--dashboardy-muted)] dark:border-white/8",
								layout === "page" && "text-sm",
								layout === "pane" && "text-base sm:text-sm",
							)}
						>
							We couldn&apos;t load the session overview for this range.
						</div>
					) : (
						<DashboardSessionsSnapshotSection
							activeSessionId={activeSessionId}
							canOpenSession={canOpenSession}
							dateRangeDays={dateRangeDays}
							endDate={endDate}
							isMetricsPending={isSummaryPending}
							isSessionsPending={isSnapshotSessionsPending}
							metrics={headlineMetrics}
							onSessionClick={onSessionClick}
							sessions={snapshotSessionsData}
							startDate={startDate}
							totalSessionCount={totalSessionCount}
							useRolling24Hours={useRolling24Hours}
							variant="sessions"
						/>
					)}
				</div>
			</div>
		</div>
	);
}
