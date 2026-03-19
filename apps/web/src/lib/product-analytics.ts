import posthog from "posthog-js";

let initialized = false;
const EVENT_VERSION = 1;
const ANALYTICS_SURFACE = "web";

type AnalyticsEnvironment = "production" | "staging" | "development" | "local";
type AnalyticsPropertyValue = string | number | boolean | null | undefined;

export const DASHBOARD_PAGE_NAMES = [
	"overview",
	"developers",
	"developer_detail",
	"projects",
	"project_detail",
	"sessions",
	"session_detail",
	"errors",
	"learnings",
	"roi",
	"organization",
	"organization_create",
	"invitations",
	"profile",
] as const;

export type DashboardPageName = (typeof DASHBOARD_PAGE_NAMES)[number];

export const APP_PAGE_NAMES = [
	...DASHBOARD_PAGE_NAMES,
	"login",
	"signup",
	"accept_invitation",
	"device_login",
] as const;

export type AppPageName = (typeof APP_PAGE_NAMES)[number];

const DASHBOARD_PAGE_NAME_SET = new Set<string>(DASHBOARD_PAGE_NAMES);

export type UiControlType =
	| "button"
	| "link"
	| "input"
	| "select"
	| "toggle"
	| "menu"
	| "table"
	| "dialog";

export type UiInteractionType =
	| "click"
	| "submit"
	| "change"
	| "open"
	| "close"
	| "copy"
	| "download"
	| "share"
	| "navigate"
	| "reset";

export function isDashboardPageName(
	pageName: AppPageName | null,
): pageName is DashboardPageName {
	return pageName !== null && DASHBOARD_PAGE_NAME_SET.has(pageName);
}

function getConfig() {
	const key = (import.meta.env.VITE_POSTHOG_KEY ?? "").trim();
	const host = (import.meta.env.VITE_POSTHOG_HOST ?? "").trim();
	const enabled =
		(import.meta.env.VITE_POSTHOG_ENABLED ?? "false").trim() === "true";
	if (!enabled || key.length === 0 || host.length === 0) {
		return null;
	}
	return { key, host };
}

function getEnvironment(): AnalyticsEnvironment {
	const configuredEnvironment = (
		import.meta.env.VITE_POSTHOG_ENVIRONMENT ?? ""
	).trim() as AnalyticsEnvironment | "";
	if (
		configuredEnvironment === "production" ||
		configuredEnvironment === "staging" ||
		configuredEnvironment === "development" ||
		configuredEnvironment === "local"
	) {
		return configuredEnvironment;
	}

	const host = window.location.hostname;
	if (host === "localhost" || host === "127.0.0.1") {
		return "local";
	}
	if (host.includes("staging")) {
		return "staging";
	}
	if (import.meta.env.DEV) {
		return "development";
	}
	return "production";
}

function isDebugModeEnabled() {
	if (typeof window === "undefined") {
		return false;
	}
	return (
		new URLSearchParams(window.location.search).get("__posthog_debug") ===
		"true"
	);
}

function buildPayload(payload: Record<string, unknown>) {
	return {
		...payload,
		event_version: EVENT_VERSION,
		surface: ANALYTICS_SURFACE,
		environment: getEnvironment(),
	};
}

export function initProductAnalytics() {
	if (initialized || typeof window === "undefined") {
		return;
	}

	const config = getConfig();
	if (!config) {
		initialized = true;
		return;
	}

	posthog.init(config.key, {
		api_host: config.host,
		autocapture: false,
		capture_pageview: "history_change",
		capture_pageleave: "if_capture_pageview",
		disable_session_recording: true,
		disable_surveys: true,
		debug: isDebugModeEnabled(),
		defaults: "2026-01-30",
	});
	posthog.register({
		event_version: EVENT_VERSION,
		surface: ANALYTICS_SURFACE,
		environment: getEnvironment(),
	});
	initialized = true;
}

export function identifyProductAnalyticsUser(
	userId: string,
	properties?: {
		email?: string;
		name?: string | null;
	},
) {
	if (!initialized) {
		initProductAnalytics();
	}
	if (!getConfig()) {
		return;
	}
	posthog.identify(userId, {
		email: properties?.email,
		name: properties?.name ?? undefined,
	});
}

export function resetProductAnalytics() {
	if (!initialized || !getConfig()) {
		return;
	}
	posthog.reset();
}

export function normalizeWebErrorCode(error: unknown) {
	const code =
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		typeof error.code === "string"
			? error.code
			: null;
	if (code) {
		return code
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "_")
			.replace(/^_+|_+$/g, "")
			.slice(0, 64);
	}

	const message =
		error instanceof Error
			? error.message.toLowerCase()
			: String(error).toLowerCase();
	if (message.includes("already") && message.includes("exist")) {
		return "already_exists";
	}
	if (message.includes("invalid")) {
		return "invalid_input";
	}
	if (message.includes("network")) {
		return "network_error";
	}
	if (message.includes("timeout")) {
		return "timeout";
	}
	if (message.includes("forbidden")) {
		return "forbidden";
	}
	if (message.includes("unauthorized")) {
		return "unauthorized";
	}
	return (
		message
			.replace(/[^a-z0-9]+/g, "_")
			.replace(/^_+|_+$/g, "")
			.slice(0, 64) || "unknown"
	);
}

export function getHttpStatusFromError(error: unknown) {
	if (
		typeof error === "object" &&
		error !== null &&
		"status" in error &&
		typeof error.status === "number"
	) {
		return error.status;
	}

	if (
		typeof error === "object" &&
		error !== null &&
		"response" in error &&
		typeof error.response === "object" &&
		error.response !== null &&
		"status" in error.response &&
		typeof error.response.status === "number"
	) {
		return error.response.status;
	}

	return undefined;
}

function captureEvent(event: string, payload: Record<string, unknown>) {
	if (!initialized) {
		initProductAnalytics();
	}
	if (!getConfig()) {
		return;
	}

	try {
		posthog.capture(event, buildPayload(payload));
	} catch {
		// Analytics must never break the UI.
	}
}

export function captureSignUpFailed(payload: {
	signup_method: "email_password" | "google" | "github";
	failure_stage: "form_submit" | "provider_redirect";
	error_code: string;
	is_invite_flow?: boolean;
	entry_point?:
		| "homepage"
		| "cli_device_login"
		| "accept_invitation"
		| "direct";
}) {
	captureEvent("Sign Up Failed", payload);
}

export function captureDashboardViewed(
	payload: {
		organization_id: string;
		user_id: string;
		page_name: DashboardPageName;
		has_data: boolean;
		date_range_days: number;
		insight_count: number;
	} & Record<string, AnalyticsPropertyValue>,
) {
	captureEvent("Dashboard Viewed", payload);
}

export function captureDashboardLoadFailed(payload: {
	organization_id: string;
	user_id: string;
	page_name: DashboardPageName;
	query_name: string;
	error_code: string;
	date_range_days: number;
	is_blocking: true;
	http_status?: number;
}) {
	captureEvent("Dashboard Load Failed", payload);
}

export function captureInsightCardClicked(payload: {
	organization_id: string;
	user_id: string;
	page_name: "overview";
	insight_key: string;
	insight_type: "trend" | "performer" | "alert" | "info";
	insight_severity: "positive" | "warning" | "negative" | "info";
	destination_path: string;
	position_index: number;
	date_range_days: number;
}) {
	captureEvent("Insight Card Clicked", payload);
}

export function captureUiControlUsed(payload: {
	page_name: AppPageName;
	control_name: string;
	control_type: UiControlType;
	interaction_type: UiInteractionType;
	organization_id?: string;
	user_id?: string;
	date_range_days?: number;
	target_path?: string;
	value?: boolean | number | string;
}) {
	captureEvent("UI Control Used", payload);
}

const ANALYTICS_PAGE_MATCHERS: ReadonlyArray<{
	matches: (pathname: string) => boolean;
	pageName: AppPageName;
}> = [
	{
		pageName: "login",
		matches: (pathname) => pathname === "/" || pathname === "",
	},
	{
		pageName: "accept_invitation",
		matches: (pathname) => pathname.startsWith("/invitation/"),
	},
	{ pageName: "overview", matches: (pathname) => pathname === "/dashboard" },
	{
		pageName: "developer_detail",
		matches: (pathname) => pathname.startsWith("/dashboard/developers/"),
	},
	{
		pageName: "developers",
		matches: (pathname) => pathname === "/dashboard/developers",
	},
	{
		pageName: "project_detail",
		matches: (pathname) => pathname.startsWith("/dashboard/projects/"),
	},
	{
		pageName: "projects",
		matches: (pathname) => pathname === "/dashboard/projects",
	},
	{
		pageName: "session_detail",
		matches: (pathname) => pathname.startsWith("/dashboard/sessions/"),
	},
	{
		pageName: "sessions",
		matches: (pathname) => pathname === "/dashboard/sessions",
	},
	{
		pageName: "errors",
		matches: (pathname) => pathname === "/dashboard/errors",
	},
	{
		pageName: "learnings",
		matches: (pathname) => pathname === "/dashboard/learnings",
	},
	{ pageName: "roi", matches: (pathname) => pathname === "/dashboard/roi" },
	{
		pageName: "organization_create",
		matches: (pathname) => pathname === "/dashboard/organization/new",
	},
	{
		pageName: "organization",
		matches: (pathname) => pathname === "/dashboard/organization",
	},
	{
		pageName: "invitations",
		matches: (pathname) => pathname === "/dashboard/invitations",
	},
	{
		pageName: "profile",
		matches: (pathname) => pathname === "/dashboard/profile",
	},
];

export function getAnalyticsPageName(pathname: string): AppPageName | null {
	return (
		ANALYTICS_PAGE_MATCHERS.find(({ matches }) => matches(pathname))
			?.pageName ?? null
	);
}
