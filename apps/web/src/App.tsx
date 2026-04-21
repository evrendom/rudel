import { lazy, Suspense } from "react";
import { useLocation } from "react-router-dom";
import { AppLoadingScreen } from "@/app/bootstrap/AppLoadingScreen";
import { appRoutes, getWrappedShareIdFromPath } from "@/app/routes";
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

const CardReferencePage = lazy(() =>
	import("@/features/wrapped/card-reference/page").then((module) => ({
		default: module.CardReferencePage,
	})),
);

const WrappedTeamCardPage = lazy(() =>
	import("@/features/wrapped/team-card/page").then((module) => ({
		default: module.WrappedTeamCardPage,
	})),
);

const PublicWrappedSharePage = lazy(() =>
	import("@/features/wrapped/PublicWrappedSharePage").then((module) => ({
		default: module.PublicWrappedSharePage,
	})),
);

function FullscreenRouteLoadingScreen() {
	return (
		<div
			aria-busy="true"
			aria-live="polite"
			className="flex min-h-screen items-center justify-center bg-[#040b11] text-sm text-white/70"
		>
			Loading…
		</div>
	);
}

function App() {
	const location = useLocation();
	const { data: session, isPending } = authClient.useSession();
	useOAuthDebugAutoDump(session);
	const deviceUserCode = getDeviceUserCode(location.search);
	const cardReferencePath = appRoutes.cardReference();
	const wrappedTeamCardPath = appRoutes.wrappedTeamCard();
	const legacyWalkInTeamCardPath = appRoutes.legacyWalkInTeamCard();
	const wrappedShareId = getWrappedShareIdFromPath(location.pathname);
	const isCardReferencePath =
		location.pathname === cardReferencePath ||
		location.pathname.startsWith(`${cardReferencePath}/`);
	const isWrappedTeamCardPath =
		isRouteMatch(location.pathname, wrappedTeamCardPath) ||
		isRouteMatch(location.pathname, legacyWalkInTeamCardPath);
	const rootRedirectTarget =
		getValidRedirect(location.search) ??
		(location.pathname === "/"
			? getPendingSignupRedirect(location.search)
			: null);
	const showDesktopOnlyOverlay =
		!deviceUserCode && !isCardReferencePath && !isWrappedTeamCardPath;

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

	if (isWrappedTeamCardPath) {
		if (wrappedShareId) {
			return (
				<>
					<ProductAnalyticsSessionSync session={session} />
					<Suspense fallback={<FullscreenRouteLoadingScreen />}>
						<PublicWrappedSharePage shareId={wrappedShareId} />
					</Suspense>
					{showDesktopOnlyOverlay ? <DesktopOnlyOverlay /> : null}
				</>
			);
		}

		return (
			<>
				<ProductAnalyticsSessionSync session={session} />
				<Suspense fallback={<FullscreenRouteLoadingScreen />}>
					<WrappedTeamCardPage />
				</Suspense>
				{showDesktopOnlyOverlay ? <DesktopOnlyOverlay /> : null}
			</>
		);
	}

	if (isCardReferencePath) {
		return (
			<>
				<ProductAnalyticsSessionSync session={session} />
				<Suspense fallback={<FullscreenRouteLoadingScreen />}>
					<CardReferencePage />
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

function isRouteMatch(pathname: string, routePath: string) {
	return pathname === routePath || pathname.startsWith(`${routePath}/`);
}
