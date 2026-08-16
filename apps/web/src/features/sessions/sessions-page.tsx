import type { SessionAnalytics } from "@rudel/api-routes";
import { useLayoutEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { appRoutes } from "@/app/routes";
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

const SESSION_LIST_SCROLL_POSITION_LIMIT = 20;
const sessionListScrollPositions = new Map<string, number>();

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
	const getShellRoutePath = useShellRoutePath();
	const { trackDrilldown } = useAnalyticsTracking();
	const scrollContainerRef = useRef<HTMLDivElement>(null);
	const returnState = useMemo(
		() =>
			createSessionReturnState(
				`${location.pathname}${location.search}${location.hash}`,
			),
		[location.hash, location.pathname, location.search],
	);

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

	return (
		<div className="dashboardy-page min-h-0 min-w-0 flex-1 overflow-hidden">
			<SessionsListSurface
				activeSessionId={null}
				canOpenSession={(session) => canViewSession(session.user_id)}
				data={data}
				getSessionHref={(session) =>
					getShellRoutePath(appRoutes.sessionDetail(session.session_id))
				}
				getSessionLinkState={() => returnState}
				layout="workspace"
				onSessionClick={handleSessionClick}
				scrollContainerRef={scrollContainerRef}
			/>
		</div>
	);
}

function SessionDetail({ sessionId }: { sessionId: string }) {
	const data = useSessionsPageData({ trackPageView: false });
	const canViewSession = useCanViewSession();
	const location = useLocation();
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
			getShellRoutePath(appRoutes.sessionDetail(targetSession.session_id)),
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
					onReturn={returnToSessionSource}
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
