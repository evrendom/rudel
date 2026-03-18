import { createHash } from "node:crypto";
import type {
	ProductAnalyticsEventName,
	ProductAnalyticsEventPayload,
} from "@rudel/api-routes";
import {
	PRODUCT_ANALYTICS_EVENT_VERSION,
	parseProductAnalyticsEvent,
} from "@rudel/api-routes";
import { PostHog } from "posthog-node";

type ApiAutoProps = "event_version" | "surface" | "environment";
type ApiCapturePayload<Name extends ProductAnalyticsEventName> = Omit<
	ProductAnalyticsEventPayload<Name>,
	ApiAutoProps
>;

let client: PostHog | null | undefined;

function isAnalyticsEnabled() {
	return process.env.POSTHOG_ENABLED === "true";
}

function getEnvironment(): "production" | "staging" | "development" | "local" {
	const appUrl = process.env.APP_URL ?? "";
	if (appUrl.includes("localhost") || appUrl.includes("127.0.0.1")) {
		return "local";
	}
	if (appUrl.includes("staging")) {
		return "staging";
	}
	if (process.env.NODE_ENV === "production") {
		return "production";
	}
	return "development";
}

function getClient() {
	if (client !== undefined) {
		return client;
	}

	const key = (process.env.POSTHOG_KEY ?? "").trim();
	const host = (process.env.POSTHOG_HOST ?? "").trim();
	if (!isAnalyticsEnabled() || key.length === 0 || host.length === 0) {
		client = null;
		return client;
	}

	client = new PostHog(key, { host });
	return client;
}

function buildPayload<Name extends ProductAnalyticsEventName>(
	event: Name,
	payload: ApiCapturePayload<Name>,
) {
	return parseProductAnalyticsEvent(event, {
		...payload,
		event_version: PRODUCT_ANALYTICS_EVENT_VERSION,
		surface: "api",
		environment: getEnvironment(),
	});
}

export function captureApiProductAnalyticsEvent<
	Name extends ProductAnalyticsEventName,
>(options: {
	distinctId: string;
	event: Name;
	payload: ApiCapturePayload<Name>;
}) {
	const instance = getClient();
	if (!instance) {
		return;
	}

	try {
		instance.capture({
			distinctId: options.distinctId,
			event: options.event,
			properties: buildPayload(options.event, options.payload),
		});
	} catch {
		// Analytics must never break the request path.
	}
}

export async function shutdownApiProductAnalytics(timeoutMs = 5_000) {
	const instance = getClient();
	if (!instance) {
		return;
	}

	try {
		await instance.shutdown(timeoutMs);
	} catch {
		// Ignore shutdown failures.
	}
}

export function hashProjectPath(projectPath: string) {
	return createHash("sha256").update(projectPath).digest("hex").slice(0, 24);
}

export function bucketContentSize(bytes: number) {
	if (bytes < 100_000) {
		return "lt_100kb";
	}
	if (bytes <= 1_000_000) {
		return "100kb_to_1mb";
	}
	return "gt_1mb";
}
