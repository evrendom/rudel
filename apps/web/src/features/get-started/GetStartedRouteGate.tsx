import { Navigate, useLocation } from "react-router-dom";
import { appRoutes, getWrappedShareIdFromSearch } from "@/app/routes";
import { useAnalyticsTracking } from "@/features/analytics/tracking/useAnalyticsTracking";
import {
	type AppSession,
	getSessionUserId,
	isGetStartedPath,
} from "@/features/auth/auth-route-utils";
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

export function GetStartedRouteGate({
	isPending,
	pathname,
	session,
}: GetStartedRouteGateProps) {
	const location = useLocation();
	const { trackUtilityUsed } = useAnalyticsTracking({
		pageName: "get_started",
	});
	const { hasUploadedSessions } = useSetupProgress({
		enabled: !isPending && !!session,
	});
	const sessionUserId = getSessionUserId(session);
	const shareId = getWrappedShareIdFromSearch(location.search);
	const shouldRouteToWrapped =
		hasUploadedSessions &&
		isWrappedLaunchEligible(session) &&
		!hasCompletedWrapped(sessionUserId);

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

	if (isPending) {
		return <UploadSetupPage />;
	}

	if (!session) {
		return <Navigate to="/" replace />;
	}

	if (pathname === appRoutes.dashboardGetStartedLegacy()) {
		return <Navigate to={appRoutes.getStarted()} replace />;
	}

	if (!isGetStartedPath(pathname)) {
		return <Navigate to={appRoutes.dashboard()} replace />;
	}

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
	return <UploadSetupPage />;
}
