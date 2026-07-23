import { useMemo, useState } from "react";
import { useDateRange } from "@/features/analytics/date-range/useDateRange";
import { useAnalyticsQuery } from "@/features/analytics/queries/useAnalyticsQuery";
import { useAnalyticsTracking } from "@/features/analytics/tracking/useAnalyticsTracking";
import { useTrackProductPageView } from "@/features/analytics/tracking/useTrackProductPageView";
import { DashboardSessionsSnapshotSection } from "@/features/dashboard/components/DashboardSessionsSnapshotSection";
import { buildDashboardSessionTabMetrics } from "@/features/dashboard/data/dashboard-tab-adapters";
import { SessionDetailSheet } from "@/features/sessions/components/SessionDetailSheet";
import { SessionsDateRangeControls } from "@/features/sessions/components/SessionsDateRangeControls";
import { resolveActiveSessionDateRangeOptionId } from "@/features/sessions/session-date-ranges";
import { orpc } from "@/lib/orpc";
import { getSessionDetailPath } from "@/lib/session-paths";

export function SessionsPage() {
	const {
		meta,
		state: { endDate, startDate },
	} = useDateRange();
	const { trackDrilldown } = useAnalyticsTracking();
	const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
		null,
	);
	const activeDateRangeOptionId = resolveActiveSessionDateRangeOptionId({
		endDate,
		startDate,
	});

	const {
		data: summaryComparison,
		isPending: isSummaryPending,
		isError: isSummaryError,
	} = useAnalyticsQuery(
		orpc.analytics.sessions.summaryComparison.queryOptions({
			input: { days: meta.dayCount },
		}),
	);

	const {
		data: snapshotSessionsData,
		isPending: isSnapshotSessionsPending,
		isError: isSnapshotSessionsError,
	} = useAnalyticsQuery(
		orpc.analytics.sessions.list.queryOptions({
			input: {
				days: activeDateRangeOptionId === "24-hours" ? 2 : meta.dayCount,
				limit: 1000,
				sortBy: "session_date",
				sortOrder: "desc",
			},
		}),
	);

	const headlineMetrics = useMemo(
		() => buildDashboardSessionTabMetrics(summaryComparison),
		[summaryComparison],
	);

	const sessionsSections = useMemo(
		() =>
			[
				{
					id: "summary_cards",
					state:
						isSummaryError || isSnapshotSessionsError
							? "error"
							: headlineMetrics.length > 0 &&
									(snapshotSessionsData?.length ?? 0) > 0
								? "populated"
								: "empty",
					itemCount: headlineMetrics.length,
				},
			] as const,
		[
			headlineMetrics.length,
			isSnapshotSessionsError,
			isSummaryError,
			snapshotSessionsData,
		],
	);

	useTrackProductPageView({
		isLoading: isSummaryPending || isSnapshotSessionsPending,
		isError: isSummaryError || isSnapshotSessionsError,
		hasData: (snapshotSessionsData?.length ?? 0) > 0,
		sections: [...sessionsSections],
		metrics: [
			{
				id: "total_sessions",
				value: summaryComparison?.current.total_sessions,
			},
			{
				id: "avg_session_duration_min",
				value: summaryComparison?.current.avg_session_duration_min,
			},
			{
				id: "avg_response_time_sec",
				value: summaryComparison?.current.avg_response_time_sec,
			},
		],
	});

	function handleSessionSheetOpenChange(open: boolean) {
		if (!open) {
			setSelectedSessionId(null);
		}
	}

	function handleSessionClick(session: { session_id: string }) {
		trackDrilldown({
			drilldownMethod: "table_row",
			sourceComponent: "sessions_snapshot_table",
			targetType: "session",
			targetId: session.session_id,
			targetPath: getSessionDetailPath(session.session_id),
		});
		setSelectedSessionId(session.session_id);
	}

	return (
		<>
			<div className="dashboardy-page overflow-x-hidden overscroll-x-none px-4 pb-6 pt-2 sm:px-6 lg:px-[76px] lg:pb-8">
				<div className="@container/dashboard-page mx-auto flex w-full min-w-0 flex-col gap-8">
					<div className="flex flex-col gap-3">
						<div className="flex justify-end px-1">
							<SessionsDateRangeControls />
						</div>
						{isSummaryError || isSnapshotSessionsError ? (
							<div className="rounded-[1.4rem] border border-[color:var(--dashboardy-border)] bg-[color:var(--dashboardy-subsurface)] px-6 py-8 text-center text-sm text-[color:var(--dashboardy-muted)]">
								We couldn&apos;t load the session overview for this range.
							</div>
						) : (
							<DashboardSessionsSnapshotSection
								endDate={endDate}
								dateRangeDays={meta.dayCount}
								hideMetrics
								isMetricsPending={isSummaryPending}
								isSessionsPending={isSnapshotSessionsPending}
								metrics={headlineMetrics}
								onSessionClick={handleSessionClick}
								sessions={snapshotSessionsData}
								showDelta
								startDate={startDate}
								totalSessionCount={
									summaryComparison?.current.total_sessions ??
									snapshotSessionsData?.length ??
									0
								}
								useRolling24Hours={activeDateRangeOptionId === "24-hours"}
							/>
						)}
					</div>
				</div>
			</div>
			<SessionDetailSheet
				sessionId={selectedSessionId}
				onOpenChange={handleSessionSheetOpenChange}
			/>
		</>
	);
}
