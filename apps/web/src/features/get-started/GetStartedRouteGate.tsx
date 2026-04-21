import { Navigate, useLocation } from "react-router-dom";
import { useIsMobile } from "@/app/hooks/use-mobile";
import { appRoutes, getWrappedShareIdFromSearch } from "@/app/routes";
import { useAnalyticsTracking } from "@/features/analytics/tracking/useAnalyticsTracking";
import {
	type AppSession,
	getSessionUserEmail,
	getSessionUserId,
	isGetStartedPath,
} from "@/features/auth/auth-route-utils";
import { DesktopResumePromptPage } from "@/features/get-started/DesktopResumePromptPage";
import { UploadSetupPage } from "@/features/get-started/UploadSetupPage";
import { useSetupProgress } from "@/features/get-started/use-setup-progress";
import {
	hasCompletedWrapped,
	isWrappedLaunchEligible,
} from "@/features/wrapped/entry";
import { useEffectOnceWhen } from "@/hooks/useEffectOnceWhen";

type GetStartedRouteGateProps = {
	isPending: boolean;
	pathname: string;
	session: AppSession | null;
};

// /get-started is the handoff point between auth, upload setup, and the new
// wrapped flow. This gate decides where a signed-in user should go next while
// keeping the product rules explicit in one place.
export function GetStartedRouteGate({
	isPending,
	pathname,
	session,
}: GetStartedRouteGateProps) {
	const location = useLocation();
	const isMobile = useIsMobile();
	const { trackUtilityUsed } = useAnalyticsTracking({
		pageName: "get_started",
	});
	// We reuse the existing upload/setup truth instead of inventing a second
	// wrapped-specific readiness source. If the user has sessions, the next step
	// is either wrapped or dashboard. If not, we stay in setup.
	const { hasUploadedSessions } = useSetupProgress({
		enabled: !isPending && !!session,
	});
	const sessionUserId = getSessionUserId(session);
	const sessionUserEmail = getSessionUserEmail(session);
	// share_id is preserved across the public-share -> auth -> get-started path.
	// We read it here because this route is the first authenticated checkpoint
	// where we can truthfully say "the user started onboarding from a share".
	const shareId = getWrappedShareIdFromSearch(location.search);
	const shouldRouteToWrapped =
		hasUploadedSessions &&
		isWrappedLaunchEligible(session) &&
		!hasCompletedWrapped(sessionUserId);

	// Track the share-originated onboarding entry once per share id. We wait
	// until auth has resolved so the event is tied to a real signed-in user.
	useEffectOnceWhen({
		effect: () => {
			trackUtilityUsed({
				sourceComponent: "get_started_route_gate",
				targetId: shareId ?? undefined,
				utilityName: "onboardingStartedFromShare",
				utilityState: hasUploadedSessions ? "sessionsReady" : "uploadRequired",
			});
		},
		isReady: !isPending && !!session && !!shareId,
		key: shareId,
	});

	// While auth is still resolving we keep the user on the existing setup shell.
	// This avoids a redirect flicker between guest and authenticated states.
	if (isPending) {
		return <UploadSetupPage />;
	}

	// Guests should never stay on /get-started directly. Public share traffic is
	// expected to reach this route only after auth completes.
	if (!session) {
		return <Navigate to="/" replace />;
	}

	// Keep the legacy route alive until the old path is fully retired.
	if (pathname === appRoutes.dashboardGetStartedLegacy()) {
		return <Navigate to={appRoutes.getStarted()} replace />;
	}

	// If something reaches this gate on the wrong path, prefer the safe default.
	if (!isGetStartedPath(pathname)) {
		return <Navigate to={appRoutes.dashboard()} replace />;
	}

	// Once sessions exist, the user either enters wrapped or goes to dashboard.
	// The wrapped branch is intentionally narrow so we do not disturb the whole
	// installed base while the launch flow is still being finished.
	if (hasUploadedSessions) {
		return (
			<Navigate
				to={
					shouldRouteToWrapped
						? appRoutes.wrappedTeamCard()
						: appRoutes.dashboard()
				}
				replace
			/>
		);
	}

	// Mobile users are allowed to view the public replay, wrapped story, and
	// final card. The one step that still needs desktop is the upload itself, so
	// the handoff prompt only appears here, after auth, when uploads are missing.
	if (isMobile && sessionUserEmail) {
		return (
			<DesktopResumePromptPage email={sessionUserEmail} shareId={shareId} />
		);
	}

	// Desktop users without uploads keep the existing setup instructions.
	return <UploadSetupPage />;
}
