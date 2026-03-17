import posthog from "posthog-js";

let initialized = false;
const EVENT_VERSION = 1;

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

function getEnvironment(): "production" | "staging" | "development" | "local" {
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

function buildPayload(payload: Record<string, unknown>) {
	return {
		...payload,
		event_version: EVENT_VERSION,
		surface: "web",
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
		capture_pageview: false,
		capture_pageleave: false,
		disable_session_recording: true,
		disable_surveys: true,
	});
	initialized = true;
}

export function identifyProductAnalyticsUser(userId: string) {
	if (!initialized) {
		initProductAnalytics();
	}
	if (!getConfig()) {
		return;
	}
	posthog.identify(userId);
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

export function captureDashboardViewed(payload: {
	organization_id: string;
	user_id: string;
	page_name: "overview";
	has_data: boolean;
	date_range_days: number;
	insight_count: number;
}) {
	captureEvent("Dashboard Viewed", payload);
}

export function captureDashboardLoadFailed(payload: {
	organization_id: string;
	user_id: string;
	page_name: "overview";
	query_name: "overview_kpis";
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
