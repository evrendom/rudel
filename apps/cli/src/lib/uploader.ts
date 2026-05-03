import { createORPCClient, ORPCError } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { ContractRouterClient } from "@orpc/contract";
import type { contract, IngestSessionInput } from "@rudel/api-routes";
import type { UploadResult } from "./types.js";

export interface UploadConfig {
	endpoint: string;
	token: string;
	authType?: "bearer" | "api-key";
	onRetry?: (attempt: number, maxAttempts: number, error: string) => void;
}

const RETRYABLE_STATUS_CODES = new Set([502, 503, 504]);
const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 1_000;

interface ErrorData {
	readonly authMessage: string | null;
	readonly code: string | null;
	readonly limit: number | null;
	readonly reason: string | null;
	readonly tryAgainIn: number | null;
	readonly windowSeconds: number | null;
}

function isRetryable(error: unknown): boolean {
	if (error instanceof ORPCError) {
		return RETRYABLE_STATUS_CODES.has(error.status);
	}
	if (error instanceof TypeError) {
		return true; // network errors (fetch failures)
	}
	return false;
}

function isRateLimited(error: unknown): error is ORPCError<string, unknown> {
	return error instanceof ORPCError && error.status === 429;
}

function isPayloadTooLarge(
	error: unknown,
): error is ORPCError<string, unknown> {
	return error instanceof ORPCError && error.status === 413;
}

function isServerError(error: unknown): error is ORPCError<string, unknown> {
	return (
		error instanceof ORPCError && error.status >= 500 && error.status <= 599
	);
}

function isApiKeyRateLimited(
	error: unknown,
): error is ORPCError<string, unknown> {
	if (!(error instanceof ORPCError)) {
		return false;
	}

	const data = getErrorData(error);
	return (
		data.reason === "api_key_rate_limited" ||
		data.code === "RATE_LIMITED" ||
		(error.status === 429 && data.authMessage !== null)
	);
}

export function formatUploadError(error: unknown): string {
	if (isApiKeyRateLimited(error)) {
		const data = getErrorData(error);
		const wait = data.tryAgainIn
			? ` Wait about ${formatWait(data.tryAgainIn)} before retrying, or run \`rudel login\` to create a fresh ingest key.`
			: " Run `rudel login` to create a fresh ingest key, or wait for the key's rate-limit window to reset.";
		return `API key rate limit reached.${wait}`;
	}

	if (isRateLimited(error)) {
		const data = getErrorData(error);
		const windowMin = data?.windowSeconds
			? Math.round(data.windowSeconds / 60)
			: 60;
		const limit = data?.limit ?? "unknown";
		return `Rate limit reached (${limit} sessions per ${windowMin} min). Wait and retry with: rudel upload --retry`;
	}
	if (isPayloadTooLarge(error)) {
		return formatPayloadTooLargeError(error);
	}
	if (isServerError(error)) {
		return formatServerUploadError(error);
	}
	if (error instanceof ORPCError) {
		return `${error.status} ${error.message}`;
	}
	if (error instanceof TypeError) {
		return `Network error while contacting Rudel API: ${error.message}. Check your connection and retry with: rudel upload --retry`;
	}
	if (error instanceof Error) {
		return error.message;
	}
	return String(error);
}

function formatPayloadTooLargeError(error: ORPCError<string, unknown>): string {
	const status = `${error.status} ${error.message}`;
	const detail = getPayloadTooLargeDetail(error);
	const detailText = detail ? ` ${detail}` : "";
	return `Upload request is too large (${status}).${detailText} This is a request-size limit, not an auth or proxy issue. This session will keep failing until its transcript/subagent payload is smaller; other failed sessions can still be retried with: rudel upload --retry`;
}

function formatServerUploadError(error: ORPCError<string, unknown>): string {
	const status = `${error.status} ${error.message}`;
	if (RETRYABLE_STATUS_CODES.has(error.status)) {
		return `Temporary Rudel server/proxy error (${status}). The CLI retries these automatically; retry remaining failed uploads with: rudel upload --retry`;
	}

	return `Rudel server error (${status}). This is not an auth problem. Retry later with: rudel upload --retry; if it repeats, share this status with the Rudel team.`;
}

function getPayloadTooLargeDetail(
	error: ORPCError<string, unknown>,
): string | null {
	const data = isRecord(error.data) ? error.data : null;
	const bodyValue = data?.body;
	const body = isRecord(bodyValue) ? bodyValue : null;
	return getStringField(body, "error") ?? getStringField(data, "error");
}

function getErrorData(error: ORPCError<string, unknown>): ErrorData {
	const data = isRecord(error.data) ? error.data : null;
	return {
		authMessage: getStringField(data, "authMessage"),
		code: getStringField(data, "code"),
		limit: getNumberField(data, "limit"),
		reason: getStringField(data, "reason"),
		tryAgainIn: getNumberField(data, "tryAgainIn"),
		windowSeconds: getNumberField(data, "windowSeconds"),
	};
}

function getStringField(record: Record<string, unknown> | null, key: string) {
	const value = record?.[key];
	return typeof value === "string" && value.length > 0 ? value : null;
}

function getNumberField(record: Record<string, unknown> | null, key: string) {
	const value = record?.[key];
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function formatWait(milliseconds: number) {
	const seconds = Math.ceil(milliseconds / 1000);
	if (seconds < 60) {
		return `${seconds}s`;
	}

	const minutes = Math.ceil(seconds / 60);
	if (minutes < 60) {
		return `${minutes} min`;
	}

	const hours = Math.ceil(minutes / 60);
	return `${hours} hr`;
}

/**
 * Upload a session transcript to the backend via oRPC.
 * Retries on transient errors (502, 503, 504) with exponential backoff.
 * Rate limit errors (429) are not retried — the window is too long.
 */
export async function uploadSession(
	request: IngestSessionInput,
	config: UploadConfig,
): Promise<UploadResult> {
	const link = new RPCLink({
		url: config.endpoint,
		headers:
			config.authType === "api-key"
				? { "x-api-key": config.token }
				: { Authorization: `Bearer ${config.token}` },
	});

	const client: ContractRouterClient<typeof contract> = createORPCClient(link);

	for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
		try {
			await client.ingestSession(request);
			return { success: true, status: 200, attempts: attempt };
		} catch (error) {
			const errorMessage = formatUploadError(error);

			if (isRateLimited(error) || isApiKeyRateLimited(error)) {
				return {
					success: false,
					error: errorMessage,
					attempts: attempt,
					rateLimited: true,
				};
			}

			if (isRetryable(error) && attempt < MAX_ATTEMPTS) {
				config.onRetry?.(attempt, MAX_ATTEMPTS, errorMessage);
				const delay = BASE_DELAY_MS * 2 ** (attempt - 1);
				await new Promise((resolve) => setTimeout(resolve, delay));
				continue;
			}

			return {
				success: false,
				error: errorMessage,
				attempts: attempt,
			};
		}
	}

	return {
		success: false,
		error: "Max retries exceeded",
		attempts: MAX_ATTEMPTS,
	};
}
