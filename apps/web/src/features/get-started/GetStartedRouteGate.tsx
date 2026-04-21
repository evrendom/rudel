import { Navigate } from "react-router-dom";
import { appRoutes } from "@/app/routes";
import {
	type AppSession,
	getSessionUserId,
	isGetStartedPath,
} from "@/features/auth/auth-route-utils";
import { UploadSetupPage } from "@/features/get-started/UploadSetupPage";
import { useSetupProgress } from "@/features/get-started/use-setup-progress";
import {
	hasCompletedWalkIn,
	isWalkInLaunchEligible,
} from "@/features/walk-in/walk-in-entry";

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
	const { hasUploadedSessions } = useSetupProgress({
		enabled: !isPending && !!session,
	});
	const sessionUserId = getSessionUserId(session);
	const shouldRouteToWalkIn =
		hasUploadedSessions &&
		isWalkInLaunchEligible(session) &&
		!hasCompletedWalkIn(sessionUserId);

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
					shouldRouteToWalkIn
						? appRoutes.walkInTeamCard()
						: appRoutes.dashboard()
				}
				replace
			/>
		);
	}
	return <UploadSetupPage />;
}
