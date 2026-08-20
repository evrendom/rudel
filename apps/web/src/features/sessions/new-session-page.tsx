import type { SessionAnalytics } from "@rudel/api-routes";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useParams } from "react-router-dom";
import { appRoutes } from "@/app/routes";
import { useAnalyticsTracking } from "@/features/analytics/tracking/useAnalyticsTracking";
import { NewseshSessionList } from "@/features/sessions/components/newsesh-session-list";
import { SessionDetailView } from "@/features/sessions/components/SessionDetailView";
import { SessionDetailErrorBoundary } from "@/features/sessions/components/session-detail-view-parts";
import { SessionTraceDock } from "@/features/sessions/components/session-trace-dock";
import { SessionWorkspaceResizeHandle } from "@/features/sessions/components/session-workspace-resize-handle";
import { getSessionNeighbours } from "@/features/sessions/session-navigation";
import { useSessionsPageData } from "@/features/sessions/use-sessions-page-data";
import { useShellBottomNavigationPortal } from "@/features/shell/shell-bottom-navigation-portal";
import { useCanViewSession } from "@/features/workspace/hooks/useCanViewSession";

export function NewSessionPage() {
	const params = useParams<{ sessionId?: string }>();
	const data = useSessionsPageData({
		trackPageView: false,
	});
	const canViewSession = useCanViewSession();
	const navigate = useNavigate();
	const shellBottomNavigationPortal = useShellBottomNavigationPortal();
	const { trackDrilldown } = useAnalyticsTracking();
	const scrollContainerRef = useRef<HTMLDivElement>(null);
	const viewableSessions = data.orderedSessions.filter((session) =>
		canViewSession(session.user_id),
	);
	const defaultSessionId = viewableSessions[0]?.session_id ?? null;
	const activeSessionId = params.sessionId ?? defaultSessionId;

	useEffect(() => {
		if (params.sessionId || !defaultSessionId) return;

		navigate(appRoutes.newSessionDetail(defaultSessionId), { replace: true });
	}, [defaultSessionId, navigate, params.sessionId]);

	const { nextSession, previousSession } = getSessionNeighbours({
		canViewSession,
		orderedSessions: viewableSessions,
		selectedSessionId: activeSessionId,
	});
	const selectedSessionIndex = viewableSessions.findIndex(
		(session) => session.session_id === activeSessionId,
	);
	const sessionPosition =
		selectedSessionIndex === -1 ? undefined : selectedSessionIndex + 1;

	function getDetailPath(sessionId: string) {
		return appRoutes.newSessionDetail(sessionId);
	}

	function handleSessionClick(session: SessionAnalytics) {
		if (!canViewSession(session.user_id)) return;

		const targetPath = getDetailPath(session.session_id);
		trackDrilldown({
			drilldownMethod: "table_row",
			sourceComponent: "newsesh_sessions_list",
			targetType: "session",
			targetId: session.session_id,
			targetPath,
		});
	}

	function navigateToSession(session: SessionAnalytics | undefined) {
		if (!session) return;

		navigate(getDetailPath(session.session_id), {
			replace: true,
			viewTransition: true,
		});
	}

	const sessionNavigation = {
		hasNextSession: nextSession !== undefined,
		hasPreviousSession: previousSession !== undefined,
		onNextSession: () => navigateToSession(nextSession),
		onPreviousSession: () => navigateToSession(previousSession),
	};

	return (
		<>
			<main
				className="dashboardy-page flex min-h-0 min-w-0 flex-1 overflow-hidden bg-[color:var(--dashboardy-surface-opaque)]"
				data-slot="session-workspace"
			>
				<section
					aria-label="Sessions overview"
					className="hidden min-h-0 min-w-0 flex-none overflow-hidden lg:flex lg:w-[var(--session-list-pane-width,29.8125rem)]"
					data-slot="sessions-list-pane"
				>
					<NewseshSessionList
						activeSessionId={activeSessionId}
						canOpenSession={(session) => canViewSession(session.user_id)}
						getSessionHref={(session) => getDetailPath(session.session_id)}
						isError={data.isSnapshotSessionsError || data.isSummaryError}
						isPending={data.isSnapshotSessionsPending}
						onSessionClick={handleSessionClick}
						scrollContainerRef={scrollContainerRef}
						sessions={viewableSessions}
					/>
				</section>
				<div className="hidden lg:contents">
					<SessionWorkspaceResizeHandle storageKey="rudel:newsesh-list-pane-width" />
				</div>
				<section
					aria-label="Selected session detail"
					className="relative z-10 flex min-h-0 min-w-0 flex-1 overflow-hidden bg-[color:var(--dashboardy-surface-opaque)]"
					data-slot="session-detail-pane"
				>
					{activeSessionId ? (
						<SessionDetailErrorBoundary
							fallbackHref={appRoutes.newSession()}
							key={activeSessionId}
						>
							<SessionDetailView
								navigation={sessionNavigation}
								position={sessionPosition}
								sessionId={activeSessionId}
								totalSessions={viewableSessions.length}
							/>
						</SessionDetailErrorBoundary>
					) : (
						<div
							aria-busy={data.isSnapshotSessionsPending}
							aria-live="polite"
							className="flex min-h-0 flex-1 items-center justify-center px-6 text-center text-base text-[color:var(--dashboardy-muted)] sm:text-sm"
						>
							{data.isSnapshotSessionsPending
								? "Loading session detail…"
								: "No sessions are available in this date range."}
						</div>
					)}
				</section>
			</main>
			{activeSessionId && shellBottomNavigationPortal
				? createPortal(
						<SessionTraceDock
							navigation={sessionNavigation}
							onReturn={() =>
								navigate(appRoutes.newSession(), {
									replace: true,
									viewTransition: true,
								})
							}
							position={sessionPosition}
							totalSessions={viewableSessions.length}
						/>,
						shellBottomNavigationPortal,
					)
				: null}
		</>
	);
}
