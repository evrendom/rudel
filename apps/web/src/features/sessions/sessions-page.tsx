import type { SessionAnalytics } from "@rudel/api-routes";
import { useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { appRoutes } from "@/app/routes";
import { useAnalyticsTracking } from "@/features/analytics/tracking/useAnalyticsTracking";
import { SessionDetailView } from "@/features/sessions/components/SessionDetailView";
import { SessionDetailErrorBoundary } from "@/features/sessions/components/session-detail-view-parts";
import { SessionTraceDock } from "@/features/sessions/components/session-trace-dock";
import { SessionWorkspaceResizeHandle } from "@/features/sessions/components/session-workspace-resize-handle";
import { SessionsListSurface } from "@/features/sessions/components/sessions-list-surface";
import { getSessionNeighbours } from "@/features/sessions/session-navigation";
import { useSessionsPageData } from "@/features/sessions/use-sessions-page-data";
import { useShellRoutePath } from "@/features/shell/hooks/use-shell-route-path";
import { useShellBottomNavigationPortal } from "@/features/shell/shell-bottom-navigation-portal";
import { useCanViewSession } from "@/features/workspace/hooks/useCanViewSession";

const SESSION_LIST_SCROLL_POSITION_LIMIT = 20;
const sessionListScrollPositions = new Map<string, number>();

export function SessionsPage() {
	const params = useParams<{ sessionId?: string }>();
	const activeSessionId = params.sessionId ?? null;
	const data = useSessionsPageData({
		trackPageView: activeSessionId === null,
	});
	const canViewSession = useCanViewSession();
	const location = useLocation();
	const navigate = useNavigate();
	const getShellRoutePath = useShellRoutePath();
	const shellBottomNavigationPortal = useShellBottomNavigationPortal();
	const { trackDrilldown } = useAnalyticsTracking();
	const scrollContainerRef = useRef<HTMLDivElement>(null);

	useLayoutEffect(() => {
		const scrollContainer = scrollContainerRef.current;
		if (!scrollContainer) {
			return;
		}

		const savedScrollPosition = sessionListScrollPositions.get(location.key);
		const animationFrame =
			savedScrollPosition === undefined
				? undefined
				: window.requestAnimationFrame(() => {
						scrollContainer.scrollTop = savedScrollPosition;
					});

		return () => {
			if (animationFrame !== undefined) {
				window.cancelAnimationFrame(animationFrame);
			}

			sessionListScrollPositions.set(location.key, scrollContainer.scrollTop);
			if (
				sessionListScrollPositions.size > SESSION_LIST_SCROLL_POSITION_LIMIT
			) {
				const oldestLocationKey = sessionListScrollPositions
					.keys()
					.next().value;
				if (oldestLocationKey !== undefined) {
					sessionListScrollPositions.delete(oldestLocationKey);
				}
			}
		};
	}, [location.key]);
	const viewableSessions = data.orderedSessions.filter((session) =>
		canViewSession(session.user_id),
	);
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

	function handleSessionClick(session: SessionAnalytics) {
		if (!canViewSession(session.user_id)) {
			return;
		}

		const targetPath = getShellRoutePath(
			appRoutes.sessionDetail(session.session_id),
		);
		trackDrilldown({
			drilldownMethod: "table_row",
			sourceComponent: "sessions_snapshot_table",
			targetType: "session",
			targetId: session.session_id,
			targetPath,
		});
	}

	function navigateToSession(targetSession: SessionAnalytics | undefined) {
		if (!targetSession) {
			return;
		}

		navigate(
			getShellRoutePath(appRoutes.sessionDetail(targetSession.session_id)),
			{
				replace: true,
				viewTransition: true,
			},
		);
	}

	const sessionNavigation = {
		hasNextSession: nextSession !== undefined,
		hasPreviousSession: previousSession !== undefined,
		onNextSession: () => navigateToSession(nextSession),
		onPreviousSession: () => navigateToSession(previousSession),
	};
	const activeSessionDetail = activeSessionId ? (
		<SessionDetailErrorBoundary
			fallbackHref={getShellRoutePath(appRoutes.session())}
			key={activeSessionId}
		>
			<SessionDetailView
				navigation={sessionNavigation}
				position={sessionPosition}
				sessionId={activeSessionId}
				totalSessions={viewableSessions.length}
			/>
		</SessionDetailErrorBoundary>
	) : undefined;

	return (
		<>
			<div
				className="dashboardy-page flex min-h-0 min-w-0 flex-1 overflow-hidden bg-[color:var(--dashboardy-surface-opaque)]"
				data-slot="session-workspace"
			>
				<section
					aria-label="Sessions"
					className={
						activeSessionDetail
							? "hidden min-h-0 min-w-0 sm:flex sm:w-[var(--session-list-pane-width,clamp(20rem,34vw,40rem))] sm:flex-none"
							: "flex min-h-0 min-w-0 flex-1"
					}
					data-slot="sessions-list-pane"
				>
					<SessionsListSurface
						activeSessionId={activeSessionId}
						canOpenSession={(session) => canViewSession(session.user_id)}
						data={data}
						getSessionHref={(session) =>
							getShellRoutePath(appRoutes.sessionDetail(session.session_id))
						}
						layout="workspace"
						onSessionClick={handleSessionClick}
						scrollContainerRef={scrollContainerRef}
					/>
				</section>
				{activeSessionDetail ? <SessionWorkspaceResizeHandle /> : null}
				{activeSessionDetail ? (
					<section
						aria-label="Selected session detail"
						className="relative z-10 flex min-h-0 min-w-0 flex-1 overflow-hidden bg-[color:var(--dashboardy-surface-opaque)] shadow-[-4px_0_10px_-8px_rgba(0,0,0,0.18)] dark:shadow-[-4px_0_10px_-8px_rgba(0,0,0,0.5)]"
						data-slot="session-detail-pane"
					>
						{activeSessionDetail}
					</section>
				) : null}
			</div>
			{activeSessionId && shellBottomNavigationPortal
				? createPortal(
						<SessionTraceDock
							navigation={sessionNavigation}
							onReturn={() =>
								navigate(getShellRoutePath(appRoutes.session()), {
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
