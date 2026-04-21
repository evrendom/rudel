import { useEffect } from "react";
import type { AppSession } from "./auth-route-utils";

const OAUTH_DEBUG_STORAGE_KEY = "rudel:oauth-debug";
const MAX_OAUTH_DEBUG_EVENTS = 40;
const OAUTH_REDACTED_QUERY_KEYS = new Set([
	"access_token",
	"code",
	"id_token",
	"refresh_token",
	"session",
	"state",
	"token",
]);

interface OAuthDebugEvent {
	ts: string;
	type: string;
	payload: Record<string, unknown>;
}

interface OAuthDebugReport {
	events: OAuthDebugEvent[];
	startedAt: string;
}

declare global {
	interface Window {
		__oauthDebug?: {
			clear: () => void;
			dump: () => OAuthDebugReport | null;
			snapshot: (label?: string) => OAuthDebugReport | null;
		};
	}
}

export function recordOAuthRedirectStart(input: {
	callbackURL: string;
	newUserCallbackURL?: string;
	provider: "github" | "google";
	source: string;
}) {
	if (!isOAuthDebugEnabled()) {
		return;
	}

	appendOAuthDebugEvent("oauth.redirect.start", {
		callbackURL: sanitizeUrl(input.callbackURL),
		newUserCallbackURL: sanitizeUrl(input.newUserCallbackURL),
		provider: input.provider,
		source: input.source,
	});
	captureOAuthDebugSnapshot("before social redirect");
}

export function recordOAuthRedirectResult(input: {
	errorMessage?: string;
	provider: "github" | "google";
	source: string;
}) {
	if (!isOAuthDebugEnabled()) {
		return;
	}

	appendOAuthDebugEvent("oauth.redirect.result", {
		errorMessage: input.errorMessage ?? null,
		provider: input.provider,
		source: input.source,
	});
	captureOAuthDebugSnapshot("after social redirect result");
}

export function useOAuthDebugAutoDump(session: AppSession | null | undefined) {
	useEffect(() => {
		if (!isOAuthDebugEnabled()) {
			return;
		}

		installOAuthDebugWindowHelpers(session);
		const report = captureOAuthDebugSnapshot("app load", session);

		if (!shouldAutoDumpOAuthDebug(report)) {
			return;
		}

		console.groupCollapsed("[oauth-debug] auto dump");
		console.table(
			report.events.map((event) => ({
				errorMessage: stringifyTableValue(event.payload.errorMessage),
				href: stringifyTableValue(event.payload.href),
				label: stringifyTableValue(event.payload.label),
				provider: stringifyTableValue(event.payload.provider),
				referrer: stringifyTableValue(event.payload.referrer),
				searchParamKeys: stringifyTableValue(event.payload.searchParamKeys),
				source: stringifyTableValue(event.payload.source),
				ts: event.ts,
				type: event.type,
			})),
		);
		console.log("fullReport", report);
		console.groupEnd();
	}, [session]);
}

function installOAuthDebugWindowHelpers(
	session: AppSession | null | undefined,
) {
	if (window.__oauthDebug) {
		return;
	}

	window.__oauthDebug = {
		clear() {
			window.sessionStorage.removeItem(OAUTH_DEBUG_STORAGE_KEY);
			console.info("[oauth-debug] cleared");
		},
		dump() {
			const report = readOAuthDebugReport();

			if (!report) {
				console.warn("[oauth-debug] no persisted report found");
				return null;
			}

			console.group("[oauth-debug] manual dump");
			console.table(
				report.events.map((event) => ({
					errorMessage: stringifyTableValue(event.payload.errorMessage),
					href: stringifyTableValue(event.payload.href),
					label: stringifyTableValue(event.payload.label),
					provider: stringifyTableValue(event.payload.provider),
					referrer: stringifyTableValue(event.payload.referrer),
					searchParamKeys: stringifyTableValue(event.payload.searchParamKeys),
					source: stringifyTableValue(event.payload.source),
					ts: event.ts,
					type: event.type,
				})),
			);
			console.log("fullReport", report);
			console.groupEnd();

			return report;
		},
		snapshot(label = "manual snapshot") {
			return captureOAuthDebugSnapshot(label, session);
		},
	};
}

function captureOAuthDebugSnapshot(
	label: string,
	session?: AppSession | null | undefined,
) {
	appendOAuthDebugEvent("oauth.snapshot", {
		authCookieNames: getAuthCookieNames(),
		hasSession: Boolean(session),
		href: sanitizeUrl(window.location.href),
		label,
		localStorageKeys: getInterestingStorageKeys(window.localStorage),
		pathname: window.location.pathname,
		referrer: sanitizeUrl(document.referrer),
		searchParamKeys: Array.from(
			new URLSearchParams(window.location.search).keys(),
		),
		sessionStorageKeys: getInterestingStorageKeys(window.sessionStorage),
		userEmailPresent: Boolean(getSessionUserEmail(session)),
		userId: getSessionUserId(session),
		userNamePresent: Boolean(getSessionUserName(session)),
	});

	return ensureOAuthDebugReport();
}

function appendOAuthDebugEvent(type: string, payload: Record<string, unknown>) {
	const report = ensureOAuthDebugReport();
	report.events.push({
		payload,
		ts: new Date().toISOString(),
		type,
	});

	if (report.events.length > MAX_OAUTH_DEBUG_EVENTS) {
		report.events = report.events.slice(-MAX_OAUTH_DEBUG_EVENTS);
	}

	writeOAuthDebugReport(report);
}

function ensureOAuthDebugReport() {
	return (
		readOAuthDebugReport() ?? {
			events: [],
			startedAt: new Date().toISOString(),
		}
	);
}

function readOAuthDebugReport() {
	const rawReport = window.sessionStorage.getItem(OAUTH_DEBUG_STORAGE_KEY);

	if (!rawReport) {
		return null;
	}

	try {
		return JSON.parse(rawReport) as OAuthDebugReport;
	} catch {
		return null;
	}
}

function writeOAuthDebugReport(report: OAuthDebugReport) {
	window.sessionStorage.setItem(
		OAUTH_DEBUG_STORAGE_KEY,
		JSON.stringify(report),
	);
}

function shouldAutoDumpOAuthDebug(report: OAuthDebugReport) {
	const params = new URLSearchParams(window.location.search);
	const hasAuthQueryParam =
		params.has("code") ||
		params.has("error") ||
		params.has("state") ||
		params.has("user_code");
	const hasAuthReferrer =
		document.referrer.includes("accounts.google.com") ||
		document.referrer.includes("/api/auth/");
	const hasRecentRedirectStart = report.events.some(
		(event) => event.type === "oauth.redirect.start",
	);

	return hasAuthQueryParam || hasAuthReferrer || hasRecentRedirectStart;
}

function getAuthCookieNames() {
	return document.cookie
		.split(";")
		.map((cookiePart) => cookiePart.trim().split("=")[0])
		.filter((cookieName) => /auth|better|session|oauth|state/i.test(cookieName))
		.sort();
}

function getInterestingStorageKeys(storage: Storage) {
	const keys: string[] = [];

	for (let index = 0; index < storage.length; index += 1) {
		const key = storage.key(index);

		if (key && /auth|better|session|oauth|state/i.test(key)) {
			keys.push(key);
		}
	}

	return keys.sort();
}

function sanitizeUrl(url: string | null | undefined) {
	if (!url) {
		return null;
	}

	try {
		const resolvedUrl = new URL(url, window.location.href);

		for (const [key, value] of resolvedUrl.searchParams.entries()) {
			if (OAUTH_REDACTED_QUERY_KEYS.has(key)) {
				resolvedUrl.searchParams.set(key, `[redacted:${value.length}]`);
			}
		}

		const query = resolvedUrl.searchParams.toString();

		return `${resolvedUrl.origin}${resolvedUrl.pathname}${query ? `?${query}` : ""}`;
	} catch {
		return url;
	}
}

function stringifyTableValue(value: unknown) {
	if (value == null) {
		return "";
	}

	if (Array.isArray(value)) {
		return value.join(", ");
	}

	return String(value);
}

function getSessionUserId(session: AppSession | null | undefined) {
	return session?.user &&
		"id" in session.user &&
		typeof session.user.id === "string"
		? session.user.id
		: null;
}

function getSessionUserEmail(session: AppSession | null | undefined) {
	return session?.user &&
		"email" in session.user &&
		typeof session.user.email === "string"
		? session.user.email
		: undefined;
}

function getSessionUserName(session: AppSession | null | undefined) {
	return session?.user &&
		"name" in session.user &&
		typeof session.user.name === "string"
		? session.user.name
		: undefined;
}

function isOAuthDebugEnabled() {
	return import.meta.env.DEV;
}
