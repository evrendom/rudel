import type { SessionAnalytics } from "@rudel/api-routes";
import { useMemo } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { appRoutes, isSessionDetailV2Path } from "@/app/routes";
import { useAnalyticsTracking } from "@/features/analytics/tracking/useAnalyticsTracking";
import { SessionDetailView } from "@/features/sessions/components/SessionDetailView";
import { SessionDetailErrorBoundary } from "@/features/sessions/components/session-detail-view-parts";
import { SessionTraceDock } from "@/features/sessions/components/session-trace-dock";
import { SessionsListSurface } from "@/features/sessions/components/sessions-list-surface";
import { getSessionNeighbours } from "@/features/sessions/session-navigation";
import {
	createSessionReturnState,
	isSessionReturnState,
	runSessionReturnTransition,
} from "@/features/sessions/session-return";
import { useSessionsPageData } from "@/features/sessions/use-sessions-page-data";
import { useShellRoutePath } from "@/features/shell/hooks/use-shell-route-path";
import { useShellBottomNavigationPortal } from "@/features/shell/shell-bottom-navigation-portal";
import { useCanViewSession } from "@/features/workspace/hooks/useCanViewSession";

export function SessionsPage() {
	const params = useParams<{ sessionId: string }>();
	const getShellRoutePath = useShellRoutePath();

	return params.sessionId ? (
		<SessionDetailErrorBoundary
			fallbackHref={getShellRoutePath(appRoutes.session())}
			key={params.sessionId}
		>
			<SessionDetail sessionId={params.sessionId} />
		</SessionDetailErrorBoundary>
	) : (
		<SessionsList />
	);
}

function SessionsList() {
	const data = useSessionsPageData({ trackPageView: true });
	const canViewSession = useCanViewSession();
	const location = useLocation();
	const navigate = useNavigate();
	const getShellRoutePath = useShellRoutePath();
	const { trackDrilldown } = useAnalyticsTracking();
	const returnState = useMemo(
		() =>
			createSessionReturnState(
				`${location.pathname}${location.search}${location.hash}`,
			),
		[location.hash, location.pathname, location.search],
	);

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
		navigate(targetPath, {
			state: returnState,
			viewTransition: true,
		});
	}

	return (
		<div className="dashboardy-page min-h-0 min-w-0 flex-1 overflow-hidden">
			<SessionsListSurface
				activeSessionId={null}
				canOpenSession={(session) => canViewSession(session.user_id)}
				data={data}
				layout="workspace"
				onSessionClick={handleSessionClick}
			/>
		</div>
	);
}

function SessionDetail({ sessionId }: { sessionId: string }) {
	const data = useSessionsPageData({ trackPageView: false });
	const canViewSession = useCanViewSession();
	const location = useLocation();
	const usesSessionDetailV2 = isSessionDetailV2Path(location.pathname);
	const navigate = useNavigate();
	const getShellRoutePath = useShellRoutePath();
	const shellBottomNavigationPortal = useShellBottomNavigationPortal();
	const returnState = isSessionReturnState(location.state)
		? location.state
		: undefined;
	const viewableSessions = data.orderedSessions.filter((session) =>
		canViewSession(session.user_id),
	);
	const { nextSession, previousSession } = getSessionNeighbours({
		canViewSession,
		orderedSessions: viewableSessions,
		selectedSessionId: sessionId,
	});
	const selectedSessionIndex = viewableSessions.findIndex(
		(session) => session.session_id === sessionId,
	);
	const sessionPosition =
		selectedSessionIndex === -1 ? undefined : selectedSessionIndex + 1;

	function returnToSessionSource() {
		if (returnState && location.key !== "default") {
			runSessionReturnTransition(() => navigate(-1));
			return;
		}

		navigate(
			returnState?.sourcePath ?? getShellRoutePath(appRoutes.session()),
			{
				replace: true,
				viewTransition: true,
			},
		);
	}

	function navigateToSession(targetSession: SessionAnalytics | undefined) {
		if (!targetSession) {
			return;
		}

		navigate(
			getShellRoutePath(
				usesSessionDetailV2
					? appRoutes.sessionDetailV2(targetSession.session_id)
					: appRoutes.sessionDetail(targetSession.session_id),
			),
			{
				replace: true,
				state: returnState,
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

	return (
		<>
			<div className="dashboardy-page flex min-h-0 min-w-0 flex-1 overflow-hidden">
				<SessionDetailView
					navigation={sessionNavigation}
					position={sessionPosition}
					sessionId={sessionId}
					totalSessions={viewableSessions.length}
				/>
			</div>
			{shellBottomNavigationPortal
				? createPortal(
						<SessionTraceDock
							navigation={sessionNavigation}
							onReturn={returnToSessionSource}
							position={sessionPosition}
							totalSessions={viewableSessions.length}
						/>,
						shellBottomNavigationPortal,
					)
				: null}
		</>
	);
}
