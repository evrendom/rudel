import * as p from "@clack/prompts";
import {
	type ProductAnalyticsLoginFailureStage,
	parseSafeBrowserUrl,
	sanitizeForTerminalDisplay,
} from "@rudel/api-routes";
import { buildCommand } from "@stricli/core";
import { createApiClient } from "../lib/api-client.js";
import { openUrl } from "../lib/browser-opener.js";
import { loadCredentials, saveCredentials } from "../lib/credentials.js";
import {
	CliProductAnalyticsEvents,
	captureCliProductAnalyticsEvent,
	getBaseCliEventPayload,
	getCliDistinctId,
	getNextCliLoginAttemptNumber,
	normalizeFailureReason,
	shouldDisableCliPersonProfile,
} from "../lib/product-analytics.js";

const PRODUCTION_APP_URL = "https://app.rudel.ai";
const DEVICE_CLIENT_ID = "rudel-cli";
const POLL_SAFETY_TIMEOUT_MS = 120_000;

type DeviceCodeResponse = {
	device_code: string;
	user_code: string;
	verification_uri: string;
	verification_uri_complete?: string;
	expires_in: number;
	interval: number;
};

type DeviceTokenResponse = {
	access_token: string;
	token_type: string;
	expires_in: number;
	scope: string;
};

type ApiKeyCreateResponse = {
	id: string;
	key: string;
};

export function getDefaultApiBase() {
	return process.env.RUDEL_API_BASE ?? PRODUCTION_APP_URL;
}

async function sleep(ms: number): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Build the URL the user must visit to approve the device authorization.
 *
 * Uses `searchParams.set` rather than `?`-concatenation because the server's
 * `verification_uri` may already carry a query string (it is configurable via
 * `CLI_DEVICE_VERIFICATION_URL`), which naive concatenation would corrupt into a
 * malformed URL with two `?` separators.
 *
 * The result is untrusted — it comes from whatever server `--api-base` points at
 * — and must be passed through `parseSafeBrowserUrl` before being printed or
 * opened.
 */
export function buildVerificationUrl(
	device: Pick<
		DeviceCodeResponse,
		"verification_uri" | "verification_uri_complete" | "user_code"
	>,
): string {
	if (device.verification_uri_complete) {
		return device.verification_uri_complete;
	}

	try {
		const url = new URL(device.verification_uri);
		url.searchParams.set("user_code", device.user_code);
		return url.toString();
	} catch {
		// Return it unchanged and let the validator produce the user-facing
		// rejection, so there is a single place that reports a bad URL.
		return device.verification_uri;
	}
}

async function requestDeviceCode(apiBase: string): Promise<DeviceCodeResponse> {
	const response = await fetch(`${apiBase}/api/auth/device/code`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			client_id: DEVICE_CLIENT_ID,
			scope: "ingest:write",
		}),
	});

	const body = (await response.json().catch(() => null)) as
		| DeviceCodeResponse
		| { error_description?: string; message?: string }
		| null;

	if (!response.ok || !body || !("device_code" in body)) {
		throw new Error(
			(body && "error_description" in body && body.error_description) ||
				(body && "message" in body && body.message) ||
				`Failed to start device authorization (${response.status})`,
		);
	}

	return body;
}

async function pollForAccessToken(
	apiBase: string,
	device: DeviceCodeResponse,
): Promise<string> {
	const hardDeadline = Date.now() + POLL_SAFETY_TIMEOUT_MS;
	const deviceDeadline = Date.now() + device.expires_in * 1000;
	const deadline = Math.min(hardDeadline, deviceDeadline);
	let intervalMs = Math.max(1_000, device.interval * 1000);

	while (Date.now() < deadline) {
		const response = await fetch(`${apiBase}/api/auth/device/token`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				grant_type: "urn:ietf:params:oauth:grant-type:device_code",
				device_code: device.device_code,
				client_id: DEVICE_CLIENT_ID,
			}),
		});

		const body = (await response.json().catch(() => null)) as
			| DeviceTokenResponse
			| { error?: string; error_description?: string }
			| null;

		if (response.ok && body && "access_token" in body) {
			return body.access_token;
		}

		const errorCode =
			body && "error" in body && typeof body.error === "string"
				? body.error
				: "";
		const errorDescription =
			body &&
			"error_description" in body &&
			typeof body.error_description === "string"
				? body.error_description
				: "Device authorization failed";

		if (errorCode === "authorization_pending") {
			await sleep(intervalMs);
			continue;
		}

		if (errorCode === "slow_down") {
			intervalMs += 1_000;
			await sleep(intervalMs);
			continue;
		}

		throw new Error(errorDescription);
	}

	throw new Error("Device authorization timed out");
}

async function createIngestApiKey(
	apiBase: string,
	accessToken: string,
): Promise<ApiKeyCreateResponse> {
	const response = await fetch(`${apiBase}/api/auth/api-key/create`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${accessToken}`,
		},
		body: JSON.stringify({
			name: "rudel-cli-ingest",
			expiresIn: null,
		}),
	});

	const body = (await response.json().catch(() => null)) as
		| ApiKeyCreateResponse
		| { error_description?: string; message?: string }
		| null;

	if (!response.ok || !body || !("key" in body) || !("id" in body)) {
		throw new Error(
			(body && "error_description" in body && body.error_description) ||
				(body && "message" in body && body.message) ||
				`Failed to create CLI API key (${response.status})`,
		);
	}

	return body;
}

async function runLogin(flags: {
	apiBase: string;
	noBrowser: boolean;
}): Promise<undefined | Error> {
	const openedBrowser = !flags.noBrowser;
	const attemptNumber = getNextCliLoginAttemptNumber();
	const captureLoginFailure = (
		failureStage: ProductAnalyticsLoginFailureStage,
		error: unknown,
	) => {
		captureCliProductAnalyticsEvent({
			distinctId: getCliDistinctId(),
			event: CliProductAnalyticsEvents.CLI_LOGIN_FAILED,
			surface: "cli",
			disablePersonProfile: shouldDisableCliPersonProfile(),
			payload: {
				auth_flow: "device_authorization",
				failure_stage: failureStage,
				failure_reason: normalizeFailureReason(error),
				opened_browser: openedBrowser,
				attempt_number: attemptNumber,
				...getBaseCliEventPayload(),
			},
		});
	};

	p.intro("rudel login");

	const existing = loadCredentials();
	if (existing) {
		p.log.warn("Already logged in.");
		p.outro("Run `rudel logout` first to switch accounts.");
		return;
	}

	let deviceCode: DeviceCodeResponse;
	try {
		deviceCode = await requestDeviceCode(flags.apiBase);
	} catch (error) {
		captureLoginFailure("device_code_request", error);
		return error instanceof Error ? error : new Error(String(error));
	}
	// The verification URL is server-controlled. Validate it before it reaches the
	// terminal or a platform opener, and use the reserialized form so control
	// characters stay percent-encoded (RUD-203).
	const rawVerifyUrl = buildVerificationUrl(deviceCode);
	const verifyUrlResult = parseSafeBrowserUrl(rawVerifyUrl);
	if (!verifyUrlResult.ok) {
		const error = new Error(
			`Refusing the verification URL returned by ${sanitizeForTerminalDisplay(flags.apiBase)}: ${verifyUrlResult.detail}. Received: ${sanitizeForTerminalDisplay(rawVerifyUrl)}`,
		);
		captureLoginFailure("verification_url_rejected", error);
		return error;
	}
	const verifyUrl = verifyUrlResult.url;

	captureCliProductAnalyticsEvent({
		distinctId: getCliDistinctId(),
		event: CliProductAnalyticsEvents.CLI_LOGIN_STARTED,
		surface: "cli",
		disablePersonProfile: shouldDisableCliPersonProfile(),
		payload: {
			auth_flow: "device_authorization",
			opened_browser: openedBrowser,
			attempt_number: attemptNumber,
			...getBaseCliEventPayload(),
		},
	});

	p.log.info(`If the browser doesn't open, visit:\n${verifyUrl}`);
	p.log.info(`User code: ${deviceCode.user_code}`);

	if (!flags.noBrowser) {
		openUrl(verifyUrl);
	}

	const spin = p.spinner();
	spin.start("Waiting for browser authentication...");

	let accessToken: string;
	try {
		accessToken = await pollForAccessToken(flags.apiBase, deviceCode);
	} catch (error) {
		const failureReason = normalizeFailureReason(error);
		captureLoginFailure(
			failureReason === "timeout"
				? "browser_approval_timeout"
				: "token_exchange",
			error,
		);
		spin.stop("Authentication failed");
		return error instanceof Error ? error : new Error(String(error));
	}

	spin.message("Creating ingest token...");
	let ingestKey: ApiKeyCreateResponse;
	try {
		ingestKey = await createIngestApiKey(flags.apiBase, accessToken);
	} catch (error) {
		captureLoginFailure("api_key_create", error);
		spin.stop("Authentication failed");
		return error instanceof Error ? error : new Error(String(error));
	}

	const client = createApiClient({
		apiBaseUrl: flags.apiBase,
		token: accessToken,
		authType: "bearer",
	});

	let user: { id: string; email: string; name: string };
	let organizations: Array<{ id: string; name: string; slug: string }>;
	try {
		const [me, orgs] = await Promise.all([
			client.me(),
			client.listMyOrganizations(),
		]);
		user = { id: me.id, email: me.email, name: me.name };
		organizations = orgs.map((org) => ({
			id: org.id,
			name: org.name,
			slug: org.slug,
		}));
	} catch (error) {
		captureLoginFailure("account_fetch", error);
		spin.stop("Authentication failed");
		return new Error("Login failed: unable to fetch account details");
	}

	try {
		saveCredentials({
			token: ingestKey.key,
			apiBaseUrl: flags.apiBase,
			authType: "api-key",
			apiKeyId: ingestKey.id,
			user,
			organizations,
		});
	} catch (error) {
		captureLoginFailure("account_fetch", error);
		spin.stop("Authentication failed");
		return new Error("Login failed: unable to persist credentials");
	}

	captureCliProductAnalyticsEvent({
		distinctId: user.id,
		event: CliProductAnalyticsEvents.CLI_LOGIN_APPROVED,
		surface: "cli",
		payload: {
			user_id: user.id,
			auth_flow: "device_authorization",
			opened_browser: openedBrowser,
			...getBaseCliEventPayload(),
		},
	});
	spin.stop("Authenticated");
	p.log.success(`Logged in as ${user.name} (${user.email})`);
	p.outro("Done!");
}

export const loginCommand = buildCommand({
	loader: async () => ({ default: runLogin }),
	parameters: {
		flags: {
			apiBase: {
				kind: "parsed",
				parse: String,
				brief: "API server base URL",
				default: getDefaultApiBase(),
			},
			noBrowser: {
				kind: "boolean",
				brief: "Skip opening the browser automatically",
				default: false,
			},
		},
	},
	docs: {
		brief: "Authenticate with the Rudel API via browser login",
	},
});
