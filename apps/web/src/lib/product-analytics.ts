import {
	type ProductAnalyticsPageName as AppPageName,
	type AuthenticationActionTriggeredEvent,
	type ChartExportTriggeredEvent,
	type DashboardDrilldownOpenedEvent,
	type DashboardFilterChangedEvent,
	type DashboardLoadFailedEvent,
	type DashboardNavigationClickedEvent,
	type ProductAnalyticsDashboardPageName as DashboardPageName,
	type DashboardViewedEvent,
	type OrganizationActionTriggeredEvent,
	PRODUCT_ANALYTICS_APP_PAGE_NAMES,
	PRODUCT_ANALYTICS_DASHBOARD_PAGE_NAMES,
	PRODUCT_ANALYTICS_EVENT_VERSION,
	PRODUCT_ANALYTICS_EVENTS,
	type ProductAnalyticsEnvironment,
	type ProductAnalyticsEventName,
	type SignUpFailedEvent,
	type UiUtilityUsedEvent,
} from "@rudel/api-routes";

const EVENT_VERSION = PRODUCT_ANALYTICS_EVENT_VERSION;
const ANALYTICS_SURFACE = "web";

type WebCapturePayload<TEvent> = Omit<
	TEvent,
	"environment" | "event_version" | "surface"
>;
type PostHogClient = typeof import("posthog-js")["default"];

export { PRODUCT_ANALYTICS_APP_PAGE_NAMES as APP_PAGE_NAMES };
export { PRODUCT_ANALYTICS_DASHBOARD_PAGE_NAMES as DASHBOARD_PAGE_NAMES };
export type { AppPageName, DashboardPageName };

let posthogClient: PostHogClient | null = null;
let posthogClientPromise: Promise<PostHogClient | null> | null = null;
const pendingActions: Array<(client: PostHogClient) => void> = [];
const DASHBOARD_PAGE_NAME_SET = new Set<string>(
	PRODUCT_ANALYTICS_DASHBOARD_PAGE_NAMES,
);

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

function getEnvironment(): ProductAnalyticsEnvironment {
	const configuredEnvironment = (
		import.meta.env.VITE_POSTHOG_ENVIRONMENT ?? ""
	).trim() as ProductAnalyticsEnvironment | "";
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

function flushPendingActions(client: PostHogClient) {
	const actions = pendingActions.splice(0);
	for (const action of actions) {
		try {
			action(client);
		} catch {
			// Analytics must never break the UI.
		}
	}
}

async function loadPostHogClient(): Promise<PostHogClient | null> {
	if (posthogClient) {
		return posthogClient;
	}

	if (typeof window === "undefined") {
		return null;
	}

	const config = getConfig();
	if (!config) {
		return null;
	}

	if (!posthogClientPromise) {
		posthogClientPromise = import("posthog-js")
			.then(({ default: client }) => {
				client.init(config.key, {
					api_host: config.host,
					autocapture: false,
					capture_pageview: "history_change",
					capture_pageleave: "if_capture_pageview",
					disable_session_recording: true,
					disable_surveys: true,
					debug: isDebugModeEnabled(),
					defaults: "2026-01-30",
				});
				client.register({
					event_version: EVENT_VERSION,
					surface: ANALYTICS_SURFACE,
					environment: getEnvironment(),
				});
				posthogClient = client;
				flushPendingActions(client);
				return client;
			})
			.catch(() => {
				pendingActions.length = 0;
				posthogClientPromise = null;
				return null;
			});
	}

	return posthogClientPromise;
}

function withPostHogClient(action: (client: PostHogClient) => void) {
	if (!getConfig()) {
		return;
	}

	if (posthogClient) {
		action(posthogClient);
		return;
	}

	pendingActions.push(action);
	void loadPostHogClient();
}

export function initProductAnalytics() {
	void loadPostHogClient();
}

export function identifyProductAnalyticsUser(
	userId: string,
	properties?: {
		email?: string;
		name?: string | null;
	},
) {
	withPostHogClient((client) => {
		client.identify(userId, {
			email: properties?.email,
			name: properties?.name ?? undefined,
		});
	});
}

export function resetProductAnalytics() {
	withPostHogClient((client) => {
		client.reset();
	});
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

function captureEvent(
	event: ProductAnalyticsEventName,
	payload: Record<string, unknown>,
) {
	withPostHogClient((client) => {
		client.capture(event, buildPayload(payload));
	});
}

export function captureSignUpFailed(
	payload: WebCapturePayload<SignUpFailedEvent>,
) {
	captureEvent(PRODUCT_ANALYTICS_EVENTS.SIGN_UP_FAILED, payload);
}

export function captureDashboardViewed(
	payload: WebCapturePayload<DashboardViewedEvent>,
) {
	captureEvent(PRODUCT_ANALYTICS_EVENTS.DASHBOARD_VIEWED, payload);
}

export function captureDashboardLoadFailed(
	payload: WebCapturePayload<DashboardLoadFailedEvent>,
) {
	captureEvent(PRODUCT_ANALYTICS_EVENTS.DASHBOARD_LOAD_FAILED, payload);
}

export function captureDashboardNavigationClicked(
	payload: WebCapturePayload<DashboardNavigationClickedEvent>,
) {
	captureEvent(PRODUCT_ANALYTICS_EVENTS.DASHBOARD_NAVIGATION_CLICKED, payload);
}

export function captureDashboardFilterChanged(
	payload: WebCapturePayload<DashboardFilterChangedEvent>,
) {
	captureEvent(PRODUCT_ANALYTICS_EVENTS.DASHBOARD_FILTER_CHANGED, payload);
}

export function captureDashboardDrilldownOpened(
	payload: WebCapturePayload<DashboardDrilldownOpenedEvent>,
) {
	captureEvent(PRODUCT_ANALYTICS_EVENTS.DASHBOARD_DRILLDOWN_OPENED, payload);
}

export function captureChartExportTriggered(
	payload: WebCapturePayload<ChartExportTriggeredEvent>,
) {
	captureEvent(PRODUCT_ANALYTICS_EVENTS.CHART_EXPORT_TRIGGERED, payload);
}

export function captureOrganizationActionTriggered(
	payload: WebCapturePayload<OrganizationActionTriggeredEvent>,
) {
	captureEvent(PRODUCT_ANALYTICS_EVENTS.ORGANIZATION_ACTION_TRIGGERED, payload);
}

export function captureAuthenticationActionTriggered(
	payload: WebCapturePayload<AuthenticationActionTriggeredEvent>,
) {
	captureEvent(
		PRODUCT_ANALYTICS_EVENTS.AUTHENTICATION_ACTION_TRIGGERED,
		payload,
	);
}

export function captureUiUtilityUsed(
	payload: WebCapturePayload<UiUtilityUsedEvent>,
) {
	captureEvent(PRODUCT_ANALYTICS_EVENTS.UI_UTILITY_USED, payload);
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
