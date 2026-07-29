import { useMemo, useState } from "react";
import { useDateRange } from "@/features/analytics/date-range/useDateRange";
import { useAnalyticsQuery } from "@/features/analytics/queries/useAnalyticsQuery";
import { useAnalyticsTracking } from "@/features/analytics/tracking/useAnalyticsTracking";
import { useTrackProductPageView } from "@/features/analytics/tracking/useTrackProductPageView";
import { DashboardDateControls } from "@/features/dashboard/components/DashboardDateControls";
import { DashboardSessionsSnapshotSection } from "@/features/dashboard/components/DashboardSessionsSnapshotSection";
import { buildDashboardSessionTabMetrics } from "@/features/dashboard/data/dashboard-tab-adapters";
import { SessionDetailSheet } from "@/features/sessions/components/SessionDetailSheet";
import {
	buildSessionListDateInput,
	resolveActiveSessionDateRangeOptionId,
} from "@/features/sessions/session-date-ranges";
import { orderSessionsForDisplay } from "@/features/sessions/session-ordering";
import { useCanViewSession } from "@/features/workspace/hooks/useCanViewSession";
import { orpc } from "@/lib/orpc";
import { getSessionDetailPath } from "@/lib/session-paths";

type SessionDetailState =
	| { status: "closed"; sessionId: null }
	| { status: "closing"; sessionId: string }
	| { status: "open"; sessionId: string };

const closedSessionDetailState: SessionDetailState = {
	status: "closed",
	sessionId: null,
};

export function SessionsPage() {
	const {
		meta,
		state: { endDate, startDate },
	} = useDateRange();
	const canViewSession = useCanViewSession();
	const { trackDrilldown } = useAnalyticsTracking();
	const [sessionDetailState, setSessionDetailState] =
		useState<SessionDetailState>(closedSessionDetailState);
	const selectedSessionId =
		sessionDetailState.status === "closed"
			? null
			: sessionDetailState.sessionId;
	const activeSessionId =
		sessionDetailState.status === "open" ? sessionDetailState.sessionId : null;
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
				...buildSessionListDateInput({
					dayCount: meta.dayCount,
					endDate,
					startDate,
				}),
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

	// Same order the table renders, so the sheet's up/down arrows step through
	// the rows the way the user sees them.
	const orderedSessions = useMemo(
		() =>
			orderSessionsForDisplay({
				sessions: snapshotSessionsData,
				useRolling24Hours: activeDateRangeOptionId === "24-hours",
			}),
		[activeDateRangeOptionId, snapshotSessionsData],
	);
	const selectedSessionIndex = orderedSessions.findIndex(
		(session) => session.session_id === selectedSessionId,
	);

	function findNeighbourSession(step: -1 | 1) {
		if (selectedSessionIndex === -1) {
			return undefined;
		}

		const neighbour = orderedSessions[selectedSessionIndex + step];

		return neighbour && canViewSession(neighbour.user_id)
			? neighbour
			: undefined;
	}

	const previousSession = findNeighbourSession(-1);
	const nextSession = findNeighbourSession(1);

	function handleSessionSheetOpenChange(open: boolean) {
		if (open) {
			return;
		}

		setSessionDetailState((currentState) =>
			currentState.status === "open"
				? { status: "closing", sessionId: currentState.sessionId }
				: currentState,
		);
	}

	function handleSessionSheetOpenChangeComplete(open: boolean) {
		if (open) {
			return;
		}

		setSessionDetailState((currentState) =>
			currentState.status === "closing"
				? closedSessionDetailState
				: currentState,
		);
	}

	function handleSessionClick(session: {
		session_id: string;
		user_id: string;
	}) {
		if (!canViewSession(session.user_id)) {
			return;
		}

		trackDrilldown({
			drilldownMethod: "table_row",
			sourceComponent: "sessions_snapshot_table",
			targetType: "session",
			targetId: session.session_id,
			targetPath: getSessionDetailPath(session.session_id),
		});
		setSessionDetailState({
			status: "open",
			sessionId: session.session_id,
		});
	}

	return (
		<>
			<div className="dashboardy-page overflow-x-hidden overscroll-x-none px-4 pb-6 pt-2 sm:px-6 lg:px-[76px] lg:pb-8">
				<div className="@container/dashboard-page mx-auto flex w-full min-w-0 flex-col gap-8">
					<div className="flex flex-col gap-3">
						<div className="flex justify-end px-1">
							<DashboardDateControls
								className="h-[34px] shrink-0 px-2.5 text-[13px]"
								sourceComponent="sessions_date_picker"
							/>
						</div>
						{isSummaryError || isSnapshotSessionsError ? (
							<div className="rounded-[1.4rem] border border-[color:var(--dashboardy-border)] bg-[color:var(--dashboardy-subsurface)] px-6 py-8 text-center text-sm text-[color:var(--dashboardy-muted)]">
								We couldn&apos;t load the session overview for this range.
							</div>
						) : (
							<DashboardSessionsSnapshotSection
								activeSessionId={activeSessionId}
								canOpenSession={(session) => canViewSession(session.user_id)}
								endDate={endDate}
								dateRangeDays={meta.dayCount}
								isMetricsPending={isSummaryPending}
								isSessionsPending={isSnapshotSessionsPending}
								metrics={headlineMetrics}
								onSessionClick={handleSessionClick}
								sessions={snapshotSessionsData}
								startDate={startDate}
								totalSessionCount={
									summaryComparison?.current.total_sessions ??
									snapshotSessionsData?.length ??
									0
								}
								useRolling24Hours={activeDateRangeOptionId === "24-hours"}
								variant="sessions"
							/>
						)}
					</div>
				</div>
			</div>
			<SessionDetailSheet
				sessionId={selectedSessionId}
				open={sessionDetailState.status === "open"}
				onOpenChange={handleSessionSheetOpenChange}
				onOpenChangeComplete={handleSessionSheetOpenChangeComplete}
				navigation={{
					hasPreviousSession: previousSession !== undefined,
					hasNextSession: nextSession !== undefined,
					onPreviousSession: () => {
						if (previousSession) {
							setSessionDetailState({
								status: "open",
								sessionId: previousSession.session_id,
							});
						}
					},
					onNextSession: () => {
						if (nextSession) {
							setSessionDetailState({
								status: "open",
								sessionId: nextSession.session_id,
							});
						}
					},
				}}
			/>
		</>
	);
}
