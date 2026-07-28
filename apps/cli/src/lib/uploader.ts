import { createORPCClient, ORPCError } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { ContractRouterClient } from "@orpc/contract";
import {
	type contract,
	INGEST_AGGREGATE_CONTENT_MAX_BYTES,
	INGEST_LIMIT_REASONS,
	type IngestSessionInput,
	parseSafeApiEndpoint,
	REDACTION_BUDGET_EXCEEDED_CODE,
	SESSION_OWNERSHIP_CONFLICT_CODE,
} from "@rudel/api-routes";
import {
	FILTER_VERSION,
	filterSessionTextFields,
	getRedactionBudgetAnomaly,
	getRedactionCount,
	mergeRedactionCounts,
	type RedactionBudgetAnomaly,
	type RedactionCounts,
} from "@rudel/secret-filter";
import type { UploadResult } from "./types.js";
import { describeUploadEndpointRejection } from "./upload-endpoint.js";

export interface UploadConfig {
	endpoint: string;
	token: string;
	allowInsecureEndpoint: boolean;
	authType?: "bearer" | "api-key";
	maxAggregateBytes?: number;
	onRetry?: (attempt: number, maxAttempts: number, error: string) => void;
}

const RETRYABLE_STATUS_CODES = new Set([502, 503, 504]);
const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 1_000;

interface ErrorData {
	readonly authMessage: string | null;
	readonly actualBytes: number | null;
	readonly code: string | null;
	readonly limit: number | null;
	readonly maxBytes: number | null;
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
		const isRequestLimit = data.reason === INGEST_LIMIT_REASONS.requestLimit;
		if (isRequestLimit || data.reason === INGEST_LIMIT_REASONS.byteLimit) {
			const limit =
				data.limit === null
					? null
					: isRequestLimit
						? `${data.limit} requests`
						: `${formatMebibytes(data.limit)} MiB`;
			const detail =
				limit && data.windowSeconds
					? ` (${limit} per ${Math.round(data.windowSeconds / 60)} min)`
					: "";
			const kind = isRequestLimit ? "request" : "byte";
			return `Ingest ${kind} limit reached${detail}. Wait and retry with: rudel upload --retry`;
		}
		const windowMin = data?.windowSeconds
			? Math.round(data.windowSeconds / 60)
			: 60;
		const limit = data?.limit ?? "unknown";
		return `Rate limit reached (${limit} sessions per ${windowMin} min). Wait and retry with: rudel upload --retry`;
	}
	if (
		error instanceof ORPCError &&
		error.code === SESSION_OWNERSHIP_CONFLICT_CODE
	) {
		return "This session ID is already owned by another organization member. Upload it from the original member account or use a different session ID.";
	}
	if (
		error instanceof ORPCError &&
		error.code === REDACTION_BUDGET_EXCEEDED_CODE
	) {
		const data = getRedactionBudgetErrorData(error);
		return data
			? formatRedactionBudgetError(data)
			: "Redaction safety check stopped upload because known-pattern redaction exceeded the 20% transcript budget. The unfiltered transcript was not uploaded.";
	}
	if (isPayloadTooLarge(error)) {
		const data = getErrorData(error);
		if (data.reason === INGEST_LIMIT_REASONS.transcriptTooLarge) {
			return formatTranscriptTooLargeError(data.actualBytes, data.maxBytes);
		}
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
		actualBytes: getNumberField(data, "actualBytes"),
		code: getStringField(data, "code"),
		limit: getNumberField(data, "limit"),
		maxBytes: getNumberField(data, "maxBytes"),
		reason: getStringField(data, "reason"),
		tryAgainIn: getNumberField(data, "tryAgainIn"),
		windowSeconds: getNumberField(data, "windowSeconds"),
	};
}

function getRedactionBudgetErrorData(
	error: ORPCError<string, unknown>,
): RedactionBudgetAnomaly | null {
	const data = isRecord(error.data) ? error.data : null;
	const inputBytes = getNumberField(data, "inputBytes");
	const redactedBytes = getNumberField(data, "redactedBytes");
	const ruleIdsValue = data?.ruleIds;
	if (
		inputBytes === null ||
		redactedBytes === null ||
		!Array.isArray(ruleIdsValue) ||
		!ruleIdsValue.every((ruleId) => typeof ruleId === "string")
	) {
		return null;
	}
	return { inputBytes, redactedBytes, ruleIds: ruleIdsValue };
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
	const inputBytes = getUploadAggregateBytes(request);
	const filteredText = filterSessionTextFields({
		content: request.content,
		subagents: request.subagents,
	});
	const redactionBudgetAnomaly = getRedactionBudgetAnomaly(
		filteredText.redactedBytes,
		inputBytes,
		filteredText.counts,
	);
	if (redactionBudgetAnomaly) {
		return {
			success: false,
			error: formatRedactionBudgetError(redactionBudgetAnomaly),
			attempts: 0,
			redactionBudgetExceeded: true,
		};
	}
	const filteredRequest: IngestSessionInput = {
		...request,
		content: filteredText.content,
		subagents: filteredText.subagents ? [...filteredText.subagents] : undefined,
		filter_version: FILTER_VERSION,
	};
	const maxAggregateBytes =
		config.maxAggregateBytes ?? INGEST_AGGREGATE_CONTENT_MAX_BYTES;
	const aggregateBytes = getUploadAggregateBytes(filteredRequest);
	if (aggregateBytes > maxAggregateBytes) {
		return {
			success: false,
			error: formatTranscriptTooLargeError(aggregateBytes, maxAggregateBytes),
			attempts: 0,
		};
	}

	const endpoint = parseSafeApiEndpoint(config.endpoint, {
		allowPlaintext: config.allowInsecureEndpoint,
	});
	if (!endpoint.ok) {
		return {
			success: false,
			error: `Upload endpoint refused: ${describeUploadEndpointRejection(endpoint)}`,
			attempts: 0,
			endpointRejected: true,
		};
	}

	const link = new RPCLink({
		url: endpoint.url,
		headers:
			config.authType === "api-key"
				? { "x-api-key": config.token }
				: { Authorization: `Bearer ${config.token}` },
	});

	const client: ContractRouterClient<typeof contract> = createORPCClient(link);

	for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
		try {
			const response: unknown = await client.ingestSession(filteredRequest);
			// A proxy or SSO gateway can answer 200 with an HTML page or arbitrary
			// JSON. oRPC deserializes those to strings/undefined rather than
			// throwing, so without this guard a dropped upload reports success.
			if (!isIngestSessionResponse(response)) {
				return {
					success: false,
					error: formatUnrecognizedResponseError(),
					attempts: attempt,
				};
			}
			return {
				success: true,
				status: 200,
				attempts: attempt,
				redacted: mergeRedactionCounts(
					filteredText.counts,
					response.redacted ?? {},
				),
				redactedBytes:
					filteredText.redactedBytes + (response.redactedBytes ?? 0),
			};
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

export function formatRedactionSummary(
	counts: RedactionCounts | undefined,
	redactedBytes: number | undefined,
): string | null {
	if (!counts) {
		return null;
	}

	const total = getRedactionCount(counts);
	if (total === 0) {
		return null;
	}

	const details = Object.entries(counts)
		.filter(([, count]) => count > 0)
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([ruleId, count]) => `${ruleId} ×${count}`)
		.join(", ");
	const subject = total === 1 ? "value" : "values";
	const verb = total === 1 ? "was" : "were";
	const byteDetail =
		redactedBytes === undefined ? "" : `, ${formatBytes(redactedBytes)}`;
	return `${total} ${subject} matching known secret patterns ${verb} redacted (${details}${byteDetail}).`;
}

export function formatRedactionBudgetError(
	anomaly: RedactionBudgetAnomaly,
): string {
	const ratio = ((anomaly.redactedBytes / anomaly.inputBytes) * 100).toFixed(1);
	const rules = anomaly.ruleIds.join(", ");
	return `Redaction safety check stopped upload: known-pattern redaction would replace ${formatBytes(anomaly.redactedBytes)} of ${formatBytes(anomaly.inputBytes)} (${ratio}%), above the 20% transcript budget (${rules}). The unfiltered transcript was not uploaded.`;
}

interface IngestSessionResponse {
	readonly success: true;
	readonly sessionId: string;
	readonly redacted?: RedactionCounts;
	readonly redactedBytes?: number;
}

// success + sessionId is the floor every deployed API version returns; redacted
// and redactedBytes only exist on filtering servers, so their absence must not
// fail a response from an older API.
function isIngestSessionResponse(
	value: unknown,
): value is IngestSessionResponse {
	if (!isRecord(value) || value.success !== true) {
		return false;
	}
	if (typeof value.sessionId !== "string") {
		return false;
	}
	if (value.redacted !== undefined && !isRecord(value.redacted)) {
		return false;
	}
	return (
		value.redactedBytes === undefined || typeof value.redactedBytes === "number"
	);
}

function formatUnrecognizedResponseError(): string {
	return "Rudel API returned an unrecognized response instead of an ingest confirmation, so this upload cannot be verified and was treated as failed. This usually means a proxy, SSO gateway, or wrong endpoint URL answered instead of the Rudel API. Check the endpoint and retry with: rudel upload --retry";
}

function getUploadAggregateBytes(request: IngestSessionInput): number {
	return (
		Buffer.byteLength(request.content, "utf8") +
		(request.subagents ?? []).reduce(
			(total, subagent) => total + Buffer.byteLength(subagent.content, "utf8"),
			0,
		)
	);
}

function formatTranscriptTooLargeError(
	actualBytes: number | null,
	maxBytes: number | null,
): string {
	if (actualBytes === null || maxBytes === null) {
		return "Session transcript payload exceeds the per-session limit. Reduce the transcript/subagent payload before retrying.";
	}

	const actualText = `${formatMebibytes(actualBytes)} MiB`;
	const limitText = `the ${formatMebibytes(maxBytes)} MiB per-session limit`;
	return `Session transcript payload is ${actualText}, above ${limitText}. Reduce the transcript/subagent payload before retrying.`;
}

function formatMebibytes(bytes: number): string {
	return (bytes / (1024 * 1024)).toFixed(2);
}

function formatBytes(bytes: number): string {
	if (bytes < 1024) {
		return `${bytes} B`;
	}
	if (bytes < 1024 * 1024) {
		return `${(bytes / 1024).toFixed(1)} KB`;
	}
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
