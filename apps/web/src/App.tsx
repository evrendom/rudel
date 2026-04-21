import { useLocation } from "react-router-dom";
import { AppLoadingScreen } from "@/app/bootstrap/AppLoadingScreen";
import { appRoutes } from "@/app/routes";
import { DesktopOnlyOverlay } from "@/app/ui/DesktopOnlyOverlay";
import { ProductAnalyticsSessionSync } from "@/features/analytics/tracking/ProductAnalyticsSessionSync";
import { AuthenticatedApp } from "@/features/auth/AuthenticatedApp";
import {
	getDeviceUserCode,
	getPendingSignupRedirect,
	getValidRedirect,
	isGetStartedPath,
	isResetPasswordPath,
} from "@/features/auth/auth-route-utils";
import { DeviceAuthorizationApp } from "@/features/auth/DeviceAuthorizationApp";
import { GuestApp } from "@/features/auth/GuestApp";
import { useOAuthDebugAutoDump } from "@/features/auth/oauth-debug";
import { ResetPasswordApp } from "@/features/auth/ResetPasswordApp";
import { GetStartedRouteGate } from "@/features/get-started/GetStartedRouteGate";
import { CardReferencePage } from "@/features/walk-in/CardReferencePage";
import { TeamCardWalkInPage } from "@/features/walk-in/TeamCardWalkInPage";
import { authClient } from "./lib/auth-client";

function App() {
	const location = useLocation();
	const { data: session, isPending } = authClient.useSession();
	useOAuthDebugAutoDump(session);
	const deviceUserCode = getDeviceUserCode(location.search);
	const cardReferencePath = appRoutes.cardReference();
	const walkInTeamCardPath = appRoutes.walkInTeamCard();
	const isCardReferencePath =
		location.pathname === cardReferencePath ||
		location.pathname.startsWith(`${cardReferencePath}/`);
	const isWalkInTeamCardPath =
		location.pathname === walkInTeamCardPath ||
		location.pathname.startsWith(`${walkInTeamCardPath}/`);
	const rootRedirectTarget =
		getValidRedirect(location.search) ??
		(location.pathname === "/"
			? getPendingSignupRedirect(location.search)
			: null);
	const showDesktopOnlyOverlay =
		!deviceUserCode && !isCardReferencePath && !isWalkInTeamCardPath;

	if (deviceUserCode) {
		return (
			<>
				<ProductAnalyticsSessionSync session={session} />
				<DeviceAuthorizationApp
					key={deviceUserCode}
					deviceUserCode={deviceUserCode}
					session={session ?? null}
				/>
			</>
		);
	}

	if (isGetStartedPath(location.pathname)) {
		return (
			<>
				<ProductAnalyticsSessionSync session={session} />
				<GetStartedRouteGate
					isPending={isPending}
					pathname={location.pathname}
					session={session ?? null}
				/>
				{showDesktopOnlyOverlay ? <DesktopOnlyOverlay /> : null}
			</>
		);
	}

	if (isWalkInTeamCardPath) {
		return (
			<>
				<ProductAnalyticsSessionSync session={session} />
				<TeamCardWalkInPage />
				{showDesktopOnlyOverlay ? <DesktopOnlyOverlay /> : null}
			</>
		);
	}

	if (isCardReferencePath) {
		return (
			<>
				<ProductAnalyticsSessionSync session={session} />
				<CardReferencePage />
				{showDesktopOnlyOverlay ? <DesktopOnlyOverlay /> : null}
			</>
		);
	}

	if (isPending) {
		return (
			<>
				<ProductAnalyticsSessionSync session={session} />
				<AppLoadingScreen />
				{showDesktopOnlyOverlay ? <DesktopOnlyOverlay /> : null}
			</>
		);
	}

	if (session) {
		return (
			<>
				<ProductAnalyticsSessionSync session={session} />
				<AuthenticatedApp rootRedirectTarget={rootRedirectTarget} />
				{showDesktopOnlyOverlay ? <DesktopOnlyOverlay /> : null}
			</>
		);
	}

	if (isResetPasswordPath(location.pathname)) {
		return (
			<>
				<ProductAnalyticsSessionSync session={session} />
				<ResetPasswordApp />
				{showDesktopOnlyOverlay ? <DesktopOnlyOverlay /> : null}
			</>
		);
	}

	return (
		<>
			<ProductAnalyticsSessionSync session={session} />
			<GuestApp />
			{showDesktopOnlyOverlay ? <DesktopOnlyOverlay /> : null}
		</>
	);
}

export default App;
