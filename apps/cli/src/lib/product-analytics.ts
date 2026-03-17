import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { ORPCError } from "@orpc/client";
import type {
	ProductAnalyticsEventName,
	ProductAnalyticsEventPayload,
	ProductAnalyticsPlatformOs,
	Source,
} from "@rudel/api-routes";
import {
	PRODUCT_ANALYTICS_EVENT_VERSION,
	PRODUCT_ANALYTICS_EVENTS,
	parseProductAnalyticsEvent,
} from "@rudel/api-routes";
import { PostHog } from "posthog-node";
import pkg from "../../package.json" with { type: "json" };
import type { Credentials } from "./credentials.js";

type CliSurface = "cli" | "hook";
type CliAutoProps = "event_version" | "surface" | "environment";
type CliCapturePayload<Name extends ProductAnalyticsEventName> = Omit<
	ProductAnalyticsEventPayload<Name>,
	CliAutoProps
>;

const ANALYTICS_STATE_FILE = "product-analytics.json";

let client: PostHog | null | undefined;

function isAnalyticsEnabled() {
	return process.env.POSTHOG_ENABLED === "true";
}

function getEnvironment(): "production" | "staging" | "development" | "local" {
	const apiBase = process.env.RUDEL_API_BASE ?? "";
	if (apiBase.includes("localhost") || apiBase.includes("127.0.0.1")) {
		return "local";
	}
	if (apiBase.includes("staging")) {
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

function getConfigDir() {
	return process.env.RUDEL_CONFIG_DIR ?? join(homedir(), ".rudel");
}

function getAnalyticsStatePath() {
	return join(getConfigDir(), ANALYTICS_STATE_FILE);
}

function buildPayload<Name extends ProductAnalyticsEventName>(
	surface: CliSurface,
	event: Name,
	payload: CliCapturePayload<Name>,
) {
	return parseProductAnalyticsEvent(event, {
		...payload,
		event_version: PRODUCT_ANALYTICS_EVENT_VERSION,
		surface,
		environment: getEnvironment(),
	});
}

export function getCliVersion() {
	return pkg.version;
}

export function getPlatformOs(): ProductAnalyticsPlatformOs {
	switch (process.platform) {
		case "darwin":
			return "macos";
		case "win32":
			return "windows";
		default:
			return "linux";
	}
}

export function getOrCreateCliInstallationId() {
	const statePath = getAnalyticsStatePath();
	if (existsSync(statePath)) {
		try {
			const parsed = JSON.parse(readFileSync(statePath, "utf8")) as {
				cli_installation_id?: string;
			};
			if (typeof parsed.cli_installation_id === "string") {
				return parsed.cli_installation_id;
			}
		} catch {
			// Ignore corrupted analytics state and recreate it.
		}
	}

	const cliInstallationId = randomUUID();
	mkdirSync(getConfigDir(), { recursive: true, mode: 0o700 });
	writeFileSync(
		statePath,
		JSON.stringify({ cli_installation_id: cliInstallationId }, null, 2),
		{ mode: 0o600 },
	);
	return cliInstallationId;
}

export function captureCliProductAnalyticsEvent<
	Name extends ProductAnalyticsEventName,
>(options: {
	distinctId: string;
	event: Name;
	payload: CliCapturePayload<Name>;
	surface: CliSurface;
	disablePersonProfile?: boolean;
}) {
	const instance = getClient();
	if (!instance) {
		return;
	}

	try {
		const payload = buildPayload(
			options.surface,
			options.event,
			options.payload,
		);
		instance.capture({
			distinctId: options.distinctId,
			event: options.event,
			properties: options.disablePersonProfile
				? { ...payload, $process_person_profile: false }
				: payload,
		});
	} catch {
		// Analytics must never break CLI execution.
	}
}

export async function shutdownCliProductAnalytics(timeoutMs = 5_000) {
	const instance = getClient();
	if (!instance) {
		return;
	}

	try {
		const shutdown = (
			instance as unknown as {
				_shutdown?: (shutdownTimeoutMs?: number) => Promise<void>;
				shutdown?: (shutdownTimeoutMs?: number) => void;
			}
		)._shutdown;
		if (typeof shutdown === "function") {
			await shutdown.call(instance, timeoutMs);
			return;
		}
		instance.shutdown(timeoutMs);
	} catch {
		// Ignore shutdown failures.
	}
}

export function normalizeFailureReason(error: unknown) {
	if (error instanceof ORPCError) {
		if (error.status === 429) {
			return "rate_limit";
		}
		if (error.status >= 500) {
			return "server_error";
		}
		if (error.status === 401 || error.status === 403) {
			return "auth_error";
		}
		if (error.status === 400) {
			return "validation_error";
		}
	}

	if (error instanceof TypeError) {
		return "network_error";
	}

	const message =
		error instanceof Error
			? error.message.toLowerCase()
			: String(error).toLowerCase();
	if (message.includes("access denied") || message.includes("access_denied")) {
		return "access_denied";
	}
	if (message.includes("timed out") || message.includes("timeout")) {
		return "timeout";
	}
	if (message.includes("network")) {
		return "network_error";
	}
	if (message.includes("validation")) {
		return "validation_error";
	}
	if (message.includes("forbidden") || message.includes("unauthorized")) {
		return "auth_error";
	}
	return (
		message
			.replace(/[^a-z0-9]+/g, "_")
			.replace(/^_+|_+$/g, "")
			.slice(0, 64) || "unknown"
	);
}

export function normalizeSignUpErrorCode(error: unknown) {
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
	return (
		message
			.replace(/[^a-z0-9]+/g, "_")
			.replace(/^_+|_+$/g, "")
			.slice(0, 64) || "unknown"
	);
}

export function getCliDistinctId(userId?: string | null) {
	return userId ?? getOrCreateCliInstallationId();
}

export function shouldDisableCliPersonProfile(userId?: string | null) {
	return !userId;
}

export function getBaseCliEventPayload() {
	return {
		cli_version: getCliVersion(),
		platform_os: getPlatformOs(),
	} as const;
}

export function getCliUserId(credentials?: Credentials | null) {
	return credentials?.user?.id;
}

export function getUploadTerminalFailureStage(
	error: unknown,
): "auth" | "network" | "api" | "validation" | "rate_limit" | "unknown" {
	if (error instanceof ORPCError) {
		if (error.status === 401 || error.status === 403) {
			return "auth";
		}
		if (error.status === 429) {
			return "rate_limit";
		}
		if (error.status === 400) {
			return "validation";
		}
		return "api";
	}

	if (error instanceof TypeError) {
		return "network";
	}

	const message =
		error instanceof Error
			? error.message.toLowerCase()
			: String(error).toLowerCase();
	if (message.includes("network")) {
		return "network";
	}
	if (message.includes("timeout")) {
		return "network";
	}
	if (message.includes("validation")) {
		return "validation";
	}
	if (message.includes("unauthorized") || message.includes("forbidden")) {
		return "auth";
	}
	return "unknown";
}

export const CliProductAnalyticsEvents = PRODUCT_ANALYTICS_EVENTS;
