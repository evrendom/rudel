import { lazy, Suspense } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { AppLoadingScreen } from "@/app/bootstrap/AppLoadingScreen";
import {
	appRoutes,
	getLegacyWrappedPublicIdFromPath,
	getWrappedPublicIdFromPath,
	getWrappedResumeTokenFromPath,
} from "@/app/routes";
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
import { authClient } from "./lib/auth-client";

const WrappedRouteGate = lazy(() =>
	import("@/features/wrapped/WrappedRouteGate").then((module) => ({
		default: module.WrappedRouteGate,
	})),
);

const WrappedDevPage = lazy(() =>
	import("@/features/wrapped/WrappedDevPage").then((module) => ({
		default: module.WrappedDevPage,
	})),
);

const WrappedDesktopResumePage = lazy(() =>
	import("@/features/get-started/WrappedDesktopResumePage").then((module) => ({
		default: module.WrappedDesktopResumePage,
	})),
);

function FullscreenRouteLoadingScreen() {
	return <AppLoadingScreen />;
}

function App() {
	const location = useLocation();
	const { data: session, isPending } = authClient.useSession();
	useOAuthDebugAutoDump(session);
	const deviceUserCode = getDeviceUserCode(location.search);
	const wrappedDevPath = appRoutes.devWrapped();
	const wrappedTeamCardPath = appRoutes.wrappedTeamCard();
	const wrappedPublicId = getWrappedPublicIdFromPath(location.pathname);
	const legacyWrappedPublicId = getLegacyWrappedPublicIdFromPath(
		location.pathname,
	);
	const wrappedResumeToken = getWrappedResumeTokenFromPath(location.pathname);
	const isLegacyWrappedSharePath = legacyWrappedPublicId !== null;
	const isWrappedDevPath =
		location.pathname === wrappedDevPath ||
		location.pathname.startsWith(`${wrappedDevPath}/`);
	const isWrappedTeamCardPath =
		location.pathname === wrappedTeamCardPath || wrappedPublicId !== null;
	const rootRedirectTarget =
		getValidRedirect(location.search) ??
		(location.pathname === "/"
			? getPendingSignupRedirect(location.search)
			: null);
	const showDesktopOnlyOverlay =
		!deviceUserCode &&
		!isWrappedDevPath &&
		!isWrappedTeamCardPath &&
		!isLegacyWrappedSharePath &&
		!isGetStartedPath(location.pathname) &&
		!wrappedResumeToken;

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
				<GetStartedRouteGate />
				{showDesktopOnlyOverlay ? <DesktopOnlyOverlay /> : null}
			</>
		);
	}

	if (wrappedResumeToken) {
		return (
			<>
				<ProductAnalyticsSessionSync session={session} />
				<Suspense fallback={<FullscreenRouteLoadingScreen />}>
					<WrappedDesktopResumePage token={wrappedResumeToken} />
				</Suspense>
				{showDesktopOnlyOverlay ? <DesktopOnlyOverlay /> : null}
			</>
		);
	}

	if (isWrappedDevPath) {
		return (
			<>
				<ProductAnalyticsSessionSync session={session} />
				<Suspense fallback={<FullscreenRouteLoadingScreen />}>
					{import.meta.env.DEV ? (
						<WrappedDevPage />
					) : (
						<Navigate replace to={appRoutes.wrappedTeamCard()} />
					)}
				</Suspense>
				{showDesktopOnlyOverlay ? <DesktopOnlyOverlay /> : null}
			</>
		);
	}

	if (legacyWrappedPublicId !== null) {
		return (
			<>
				<ProductAnalyticsSessionSync session={session} />
				<Navigate replace to={appRoutes.wrappedPublic(legacyWrappedPublicId)} />
				{showDesktopOnlyOverlay ? <DesktopOnlyOverlay /> : null}
			</>
		);
	}

	if (isWrappedTeamCardPath) {
		return (
			<>
				<ProductAnalyticsSessionSync session={session} />
				<Suspense fallback={<FullscreenRouteLoadingScreen />}>
					<WrappedRouteGate
						isPending={isPending}
						publicId={wrappedPublicId}
						session={session ?? null}
					/>
				</Suspense>
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
