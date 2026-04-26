import { appRoutes } from "@/app/routes";
import type { authClient } from "@/lib/auth-client";

export type AppSession = ReturnType<typeof authClient.useSession>["data"];
const PENDING_SIGNUP_REDIRECT_PARAM = "signup_redirect";
const RELATIVE_URL_BASE = "https://rudel.local";

function normalizeValidRedirect(redirect: string | null): string | null {
	if (!redirect) {
		return null;
	}

	if (!redirect.startsWith("/") || redirect.startsWith("//")) {
		return null;
	}

	return normalizeWrappedAuthRedirect(redirect);
}

function normalizeWrappedAuthRedirect(redirect: string): string {
	try {
		const url = new URL(redirect, RELATIVE_URL_BASE);

		if (url.pathname !== appRoutes.wrappedTeamCard()) {
			return redirect;
		}

		return `${appRoutes.wrappedSessionsLanded(url.search)}${url.hash}`;
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

export function getValidRedirect(search?: string): string | null {
	const params = new URLSearchParams(search ?? window.location.search);
	return normalizeValidRedirect(params.get("redirect"));
}

export function getPendingSignupRedirect(search?: string): string | null {
	const params = new URLSearchParams(search ?? window.location.search);
	return normalizeValidRedirect(params.get(PENDING_SIGNUP_REDIRECT_PARAM));
}

function getDirectAuthDestination(
	pathname = window.location.pathname,
	search = window.location.search,
): string | null {
	const userCode = getDeviceUserCode(search);
	if (userCode) {
		return `/?user_code=${encodeURIComponent(userCode)}`;
	}

	const redirect = getValidRedirect(search);
	if (redirect) {
		return redirect;
	}

	if (pathname !== "/" && pathname !== "") {
		return normalizeWrappedAuthRedirect(`${pathname}${search}`);
	}

	return null;
}

export function getEmailSignupSuccessDestination(
	pathname = window.location.pathname,
	search = window.location.search,
): string {
	return (
		getDirectAuthDestination(pathname, search) ??
		appRoutes.wrappedSessionsLanded()
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
			newUserCallbackURL: directDestination,
		};
	}

	return {
		callbackURL: "/",
		newUserCallbackURL: appRoutes.wrappedSessionsLanded(),
	};
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

	const redirect = normalizeValidRedirect(destination);
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
