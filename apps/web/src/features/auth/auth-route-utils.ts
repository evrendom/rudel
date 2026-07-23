import { appRoutes } from "@/app/routes";
import type { authClient } from "@/lib/auth-client";

export type AppSession = ReturnType<typeof authClient.useSession>["data"];
const PENDING_SIGNUP_REDIRECT_PARAM = "signup_redirect";
const RELATIVE_URL_BASE = "https://rudel.local";
type WrappedAuthRedirectFlow =
	| "card-profile"
	| "desktop-ready"
	| "sessions-landed";

function normalizeValidRelativeRedirect(
	redirect: string | null,
): string | null {
	if (!redirect) {
		return null;
	}

	if (!redirect.startsWith("/") || redirect.startsWith("//")) {
		return null;
	}

	return redirect;
}

function normalizeWrappedAuthRedirect(
	redirect: string,
	flow: WrappedAuthRedirectFlow = "sessions-landed",
): string {
	try {
		const url = new URL(redirect, RELATIVE_URL_BASE);

		if (url.pathname !== appRoutes.wrappedTeamCard()) {
			return redirect;
		}

		const wrappedRoute = getWrappedAuthRedirectRoute(flow, url.search);

		return `${wrappedRoute}${url.hash}`;
	} catch {
		return redirect;
	}
}

export function getDeviceUserCode(search?: string): string | null {
	const params = new URLSearchParams(search ?? window.location.search);
	return params.get("user_code");
}

export function isResetPasswordPath(pathname?: string): boolean {
	return (pathname ?? window.location.pathname) === "/reset-password";
}

export function isGetStartedPath(pathname = window.location.pathname): boolean {
	return (
		pathname === appRoutes.getStarted() ||
		pathname === appRoutes.dashboardGetStartedLegacy()
	);
}

export function getValidRedirect(
	search?: string,
	wrappedFlow: WrappedAuthRedirectFlow = "sessions-landed",
): string | null {
	const params = new URLSearchParams(search ?? window.location.search);
	const validRedirect = normalizeValidRelativeRedirect(params.get("redirect"));
	if (!validRedirect) {
		return null;
	}

	return normalizeWrappedAuthRedirect(validRedirect, wrappedFlow);
}

export function getPendingSignupRedirect(search?: string): string | null {
	const params = new URLSearchParams(search ?? window.location.search);
	return normalizeValidRelativeRedirect(
		params.get(PENDING_SIGNUP_REDIRECT_PARAM),
	);
}

function getDirectAuthDestination(
	pathname = window.location.pathname,
	search = window.location.search,
	wrappedFlow: WrappedAuthRedirectFlow = "sessions-landed",
): string | null {
	const userCode = getDeviceUserCode(search);
	if (userCode) {
		return `/?user_code=${encodeURIComponent(userCode)}`;
	}

	const redirect = getValidRedirect(search, wrappedFlow);
	if (redirect) {
		return redirect;
	}

	if (pathname !== "/" && pathname !== "") {
		return normalizeWrappedAuthRedirect(`${pathname}${search}`, wrappedFlow);
	}

	return null;
}

export function getEmailSignupSuccessDestination(
	pathname = window.location.pathname,
	search = window.location.search,
): string {
	return (
		getDirectAuthDestination(pathname, search, "card-profile") ??
		appRoutes.wrappedCardProfile()
	);
}

export function getEmailLoginSuccessDestination(
	pathname = window.location.pathname,
	search = window.location.search,
): string {
	return getDirectAuthDestination(pathname, search) ?? "/";
}

export function getAuthCallbackURL(
	pathname = window.location.pathname,
	search = window.location.search,
): string {
	const directDestination = getDirectAuthDestination(pathname, search);

	if (!directDestination) {
		return "/";
	}

	if (directDestination.startsWith("/?user_code=")) {
		return directDestination;
	}

	return `/?redirect=${encodeURIComponent(directDestination)}`;
}

export function getEmailSignupVerificationCallbackURL(
	pathname = window.location.pathname,
	search = window.location.search,
): string {
	return getEmailSignupSuccessDestination(pathname, search);
}

export function getSocialSignupRedirectOptions(
	pathname = window.location.pathname,
	search = window.location.search,
): {
	callbackURL: string;
	newUserCallbackURL?: string;
} {
	const directDestination = getDirectAuthDestination(pathname, search);
	if (directDestination) {
		return {
			callbackURL: directDestination,
			newUserCallbackURL:
				getDirectAuthDestination(pathname, search, "card-profile") ??
				directDestination,
		};
	}

	return {
		callbackURL: "/",
		newUserCallbackURL: appRoutes.wrappedCardProfile(),
	};
}

export function getSocialLoginRedirectOptions(
	pathname = window.location.pathname,
	search = window.location.search,
): {
	callbackURL: string;
	newUserCallbackURL?: string;
} {
	return {
		callbackURL: getAuthCallbackURL(pathname, search),
		newUserCallbackURL:
			getDirectAuthDestination(pathname, search, "card-profile") ??
			appRoutes.wrappedCardProfile(),
	};
}

function getWrappedAuthRedirectRoute(
	flow: WrappedAuthRedirectFlow,
	search: string,
) {
	if (flow === "card-profile") {
		return appRoutes.wrappedCardProfile(search);
	}

	if (flow === "desktop-ready") {
		return appRoutes.wrappedDesktopReady(search);
	}

	return appRoutes.wrappedSessionsLanded(search);
}

export function primePendingSignupRedirect(
	destination: string,
	pathname = window.location.pathname,
	search = window.location.search,
) {
	if (
		pathname !== "/" ||
		getDeviceUserCode(search) ||
		getValidRedirect(search)
	) {
		return;
	}

	const redirect = normalizeValidRelativeRedirect(destination);
	if (!redirect) {
		return;
	}

	const url = new URL(window.location.href);
	url.searchParams.set(PENDING_SIGNUP_REDIRECT_PARAM, redirect);
	window.history.replaceState(
		window.history.state,
		"",
		`${url.pathname}${url.search}${url.hash}`,
	);
}

export function clearPendingSignupRedirect() {
	const url = new URL(window.location.href);
	if (!url.searchParams.has(PENDING_SIGNUP_REDIRECT_PARAM)) {
		return;
	}

	url.searchParams.delete(PENDING_SIGNUP_REDIRECT_PARAM);
	window.history.replaceState(
		window.history.state,
		"",
		`${url.pathname}${url.search}${url.hash}`,
	);
}

export function getSessionUserId(
	session: AppSession | null | undefined,
): string | null {
	return session?.user &&
		"id" in session.user &&
		typeof session.user.id === "string"
		? session.user.id
		: null;
}

export function getSessionUserEmail(
	session: AppSession | null | undefined,
): string | undefined {
	return session?.user &&
		"email" in session.user &&
		typeof session.user.email === "string"
		? session.user.email
		: undefined;
}

export function getSessionUserName(
	session: AppSession | null | undefined,
): string | undefined {
	return session?.user &&
		"name" in session.user &&
		typeof session.user.name === "string"
		? session.user.name
		: undefined;
}
