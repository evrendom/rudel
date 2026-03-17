import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { ORPCError } from "@orpc/client";
import type {
	ProductAnalyticsClientSurface,
	ProductAnalyticsEventName,
	ProductAnalyticsEventPayload,
	ProductAnalyticsPlatformOs,
	ProductAnalyticsUploadMode,
	ProductAnalyticsUploadSkipReason,
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

type AnalyticsState = {
	cli_installation_id?: string;
	cli_first_run_tracked?: boolean;
	cli_login_attempt_count?: number;
};

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

function readAnalyticsState(): AnalyticsState {
	const statePath = getAnalyticsStatePath();
	if (!existsSync(statePath)) {
		return {};
	}

	try {
		return JSON.parse(readFileSync(statePath, "utf8")) as AnalyticsState;
	} catch {
		return {};
	}
}

function writeAnalyticsState(state: AnalyticsState) {
	const statePath = getAnalyticsStatePath();
	mkdirSync(getConfigDir(), { recursive: true, mode: 0o700 });
	writeFileSync(statePath, JSON.stringify(state, null, 2), { mode: 0o600 });
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
	const state = readAnalyticsState();
	if (typeof state.cli_installation_id === "string") {
		return state.cli_installation_id;
	}
	const cliInstallationId = randomUUID();
	writeAnalyticsState({
		...state,
		cli_installation_id: cliInstallationId,
	});
	return cliInstallationId;
}

export function consumeCliFirstRun(
	cliInstallationId = getOrCreateCliInstallationId(),
) {
	const state = readAnalyticsState();
	if (state.cli_first_run_tracked) {
		return {
			cliInstallationId,
			shouldTrack: false,
		} as const;
	}

	writeAnalyticsState({
		...state,
		cli_installation_id: cliInstallationId,
		cli_first_run_tracked: true,
	});
	return {
		cliInstallationId,
		shouldTrack: true,
	} as const;
}

export function getNextCliLoginAttemptNumber() {
	const state = readAnalyticsState();
	const nextAttemptNumber = (state.cli_login_attempt_count ?? 0) + 1;
	writeAnalyticsState({
		...state,
		cli_installation_id:
			state.cli_installation_id ?? getOrCreateCliInstallationId(),
		cli_login_attempt_count: nextAttemptNumber,
	});
	return nextAttemptNumber;
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
		await instance.shutdown(timeoutMs);
	} catch {
		// Ignore shutdown failures.
	}
}

export function hashProjectPath(projectPath: string) {
	return createHash("sha256").update(projectPath).digest("hex").slice(0, 24);
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

export function getUploadFailureHttpStatus(error: unknown) {
	return error instanceof ORPCError ? error.status : undefined;
}

export function isUploadFailureRetryable(error: unknown) {
	if (error instanceof ORPCError) {
		return error.status === 429 || error.status === 502 || error.status === 503;
	}
	return error instanceof TypeError;
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

export function getUploadPreparationFailureStage(
	error: unknown,
): "session_discovery" | "read" | "serialize" | "auth" | "unknown" {
	const message =
		error instanceof Error
			? error.message.toLowerCase()
			: String(error).toLowerCase();

	if (
		message.includes("not authenticated") ||
		message.includes("session expired") ||
		message.includes("re-authenticate")
	) {
		return "auth";
	}
	if (
		message.includes("session not found") ||
		message.includes("subagent file") ||
		message.includes("missing session")
	) {
		return "session_discovery";
	}
	if (
		message.includes("enoent") ||
		message.includes("eacces") ||
		message.includes("transcript") ||
		message.includes("file not found") ||
		message.includes("permission denied")
	) {
		return "read";
	}
	if (
		message.includes("parse") ||
		message.includes("invalid json") ||
		message.includes("unexpected token")
	) {
		return "serialize";
	}
	return "unknown";
}

export function captureCliUploadFailed(options: {
	surface: CliSurface;
	clientSurface: ProductAnalyticsClientSurface;
	uploadMode: ProductAnalyticsUploadMode;
	agentSource: Source;
	failureStage:
		| "session_discovery"
		| "read"
		| "serialize"
		| "auth"
		| "network"
		| "api"
		| "validation"
		| "rate_limit"
		| "unknown";
	error: unknown;
	organizationId?: string;
	userId?: string;
	projectPath?: string;
	attemptNumber?: number;
	httpStatus?: number;
	isRetryable?: boolean;
}) {
	const userId = options.userId;
	captureCliProductAnalyticsEvent({
		distinctId: getCliDistinctId(userId),
		event: PRODUCT_ANALYTICS_EVENTS.SESSION_UPLOAD_FAILED,
		surface: options.surface,
		disablePersonProfile: shouldDisableCliPersonProfile(userId),
		payload: {
			client_surface: options.clientSurface,
			upload_mode: options.uploadMode,
			agent_source: options.agentSource,
			failure_stage: options.failureStage,
			failure_reason: normalizeFailureReason(options.error),
			is_retryable:
				options.isRetryable ?? isUploadFailureRetryable(options.error),
			organization_id: options.organizationId,
			user_id: userId,
			http_status:
				options.httpStatus ?? getUploadFailureHttpStatus(options.error),
			attempt_number: options.attemptNumber,
			project_id_hash: options.projectPath
				? hashProjectPath(options.projectPath)
				: undefined,
			...getBaseCliEventPayload(),
		},
	});
}

export function captureCliUploadInitiated(options: {
	surface: CliSurface;
	clientSurface: ProductAnalyticsClientSurface;
	uploadMode: ProductAnalyticsUploadMode;
	agentSource: Source;
	organizationId?: string;
	userId?: string;
	projectPath?: string;
	attemptNumber: number;
	contentSizeBytes?: number;
}) {
	const userId = options.userId;
	captureCliProductAnalyticsEvent({
		distinctId: getCliDistinctId(userId),
		event: PRODUCT_ANALYTICS_EVENTS.SESSION_UPLOAD_INITIATED,
		surface: options.surface,
		disablePersonProfile: shouldDisableCliPersonProfile(userId),
		payload: {
			client_surface: options.clientSurface,
			upload_mode: options.uploadMode,
			agent_source: options.agentSource,
			organization_id: options.organizationId,
			user_id: userId,
			attempt_number: options.attemptNumber,
			project_id_hash: options.projectPath
				? hashProjectPath(options.projectPath)
				: undefined,
			content_size_bucket:
				typeof options.contentSizeBytes === "number"
					? bucketContentSize(options.contentSizeBytes)
					: undefined,
			...getBaseCliEventPayload(),
		},
	});
}

export function captureCliUploadSkipped(options: {
	surface: CliSurface;
	clientSurface: ProductAnalyticsClientSurface;
	uploadMode: ProductAnalyticsUploadMode;
	agentSource: Source;
	skipReason: ProductAnalyticsUploadSkipReason;
	organizationId?: string;
	userId?: string;
	projectPath?: string;
	contentSizeBytes?: number;
}) {
	const userId = options.userId;
	captureCliProductAnalyticsEvent({
		distinctId: getCliDistinctId(userId),
		event: PRODUCT_ANALYTICS_EVENTS.SESSION_UPLOAD_SKIPPED,
		surface: options.surface,
		disablePersonProfile: shouldDisableCliPersonProfile(userId),
		payload: {
			client_surface: options.clientSurface,
			upload_mode: options.uploadMode,
			agent_source: options.agentSource,
			skip_reason: options.skipReason,
			organization_id: options.organizationId,
			user_id: userId,
			project_id_hash: options.projectPath
				? hashProjectPath(options.projectPath)
				: undefined,
			content_size_bucket:
				typeof options.contentSizeBytes === "number"
					? bucketContentSize(options.contentSizeBytes)
					: undefined,
			...getBaseCliEventPayload(),
		},
	});
}

export const CliProductAnalyticsEvents = PRODUCT_ANALYTICS_EVENTS;
