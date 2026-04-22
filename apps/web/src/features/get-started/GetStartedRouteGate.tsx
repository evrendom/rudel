import { Navigate } from "react-router-dom";
import { appRoutes } from "@/app/routes";

// /get-started now exists only as a compatibility path. Wrapped owns the real
// onboarding flow, so this route immediately hands off to /wrapped.
export function GetStartedRouteGate() {
	return <Navigate replace to={appRoutes.wrappedTeamCard()} />;
}
