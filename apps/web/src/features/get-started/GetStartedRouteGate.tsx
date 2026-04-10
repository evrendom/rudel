import { Navigate } from "react-router-dom";
import { appRoutes } from "@/app/routes";
import {
	type AppSession,
	isGetStartedPath,
} from "@/features/auth/auth-route-utils";
import { UploadSetupPage } from "@/features/get-started/UploadSetupPage";

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

	return <UploadSetupPage />;
}
