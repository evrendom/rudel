import { Navigate } from "react-router-dom";
import { appRoutes } from "@/app/routes";
import {
	type AppSession,
	isGetStartedPath,
} from "@/features/auth/auth-route-utils";
import { UploadSetupPage } from "@/features/get-started/UploadSetupPage";
import { useSetupProgress } from "@/features/get-started/use-setup-progress";

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
		return <Navigate to={appRoutes.dashboard()} replace />;
	}
	return <UploadSetupPage />;
}
