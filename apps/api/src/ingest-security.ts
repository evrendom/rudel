import { ORPCError } from "@orpc/server";
import type {
	IngestRetentionMode,
	IngestRetentionPolicy,
} from "@rudel/agent-adapters";
import type { IngestSessionInput } from "@rudel/api-routes";

const DEFAULT_MAX_REQUEST_BYTES = 5 * 1024 * 1024;
const DEFAULT_MAX_CONTENT_BYTES = 2 * 1024 * 1024;
const DEFAULT_MAX_TOTAL_SUBAGENT_BYTES = 1 * 1024 * 1024;
const DEFAULT_MAX_SUBAGENTS = 25;
const DEFAULT_RATE_LIMIT_WINDOW_MS = 60_000;
const DEFAULT_RATE_LIMIT_MAX_REQUESTS = 60;
const DEFAULT_RETENTION_MAX_BYTES = 500_000;
const DEFAULT_SUBAGENT_RETENTION_MAX_BYTES = 100_000;

export class IngestRequestTooLargeError extends Error {
	constructor(public readonly maxRequestBytes: number) {
		super(
			`Ingest request exceeds the configured request size limit of ${maxRequestBytes} bytes.`,
		);
		this.name = "IngestRequestTooLargeError";
	}
}

interface IngestRateLimitConfig {
	windowMs: number;
	maxRequests: number;
}

export interface IngestSecurityConfig {
	maxRequestBytes: number;
	maxContentBytes: number;
	maxTotalSubagentBytes: number;
	maxSubagents: number;
	rateLimit: IngestRateLimitConfig;
	retentionPolicy: IngestRetentionPolicy;
}

interface RateLimitBucket {
	count: number;
	resetAt: number;
}

function parsePositiveInt(
	value: string | undefined,
	fallback: number,
	min = 1,
): number {
	if (!value) return fallback;
	const parsed = Number.parseInt(value, 10);
	if (!Number.isFinite(parsed) || parsed < min) {
		return fallback;
	}
	return parsed;
}

function parseRetentionMode(
	value: string | undefined,
	fallback: IngestRetentionMode,
): IngestRetentionMode {
	if (value === "full" || value === "truncate" || value === "none") {
		return value;
	}
	return fallback;
}

export function createIngestSecurityConfig(
	env: Record<string, string | undefined> = process.env,
): IngestSecurityConfig {
	return {
		maxRequestBytes: parsePositiveInt(
			env.INGEST_MAX_REQUEST_BYTES,
			DEFAULT_MAX_REQUEST_BYTES,
		),
		maxContentBytes: parsePositiveInt(
			env.INGEST_MAX_CONTENT_BYTES,
			DEFAULT_MAX_CONTENT_BYTES,
		),
		maxTotalSubagentBytes: parsePositiveInt(
			env.INGEST_MAX_TOTAL_SUBAGENT_BYTES,
			DEFAULT_MAX_TOTAL_SUBAGENT_BYTES,
		),
		maxSubagents: parsePositiveInt(
			env.INGEST_MAX_SUBAGENTS,
			DEFAULT_MAX_SUBAGENTS,
		),
		rateLimit: {
			windowMs: parsePositiveInt(
				env.INGEST_RATE_LIMIT_WINDOW_MS,
				DEFAULT_RATE_LIMIT_WINDOW_MS,
			),
			maxRequests: parsePositiveInt(
				env.INGEST_RATE_LIMIT_MAX_REQUESTS,
				DEFAULT_RATE_LIMIT_MAX_REQUESTS,
			),
		},
		retentionPolicy: {
			transcriptMode: parseRetentionMode(
				env.INGEST_TRANSCRIPT_RETENTION_MODE,
				"full",
			),
			transcriptMaxBytes: parsePositiveInt(
				env.INGEST_TRANSCRIPT_RETENTION_MAX_BYTES,
				DEFAULT_RETENTION_MAX_BYTES,
			),
			subagentMode: parseRetentionMode(
				env.INGEST_SUBAGENT_RETENTION_MODE,
				"full",
			),
			subagentMaxBytes: parsePositiveInt(
				env.INGEST_SUBAGENT_RETENTION_MAX_BYTES,
				DEFAULT_SUBAGENT_RETENTION_MAX_BYTES,
			),
		},
	};
}

let cachedConfig: IngestSecurityConfig | null = null;

export function getIngestSecurityConfig(): IngestSecurityConfig {
	if (!cachedConfig) {
		cachedConfig = createIngestSecurityConfig();
	}
	return cachedConfig;
}

export function getContentByteLength(value: string): number {
	return Buffer.byteLength(value, "utf8");
}

export function getTotalSubagentByteLength(
	subagents: IngestSessionInput["subagents"],
): number {
	if (!subagents) return 0;
	return subagents.reduce(
		(total, subagent) => total + getContentByteLength(subagent.content),
		0,
	);
}

export function validateIngestPayload(
	input: IngestSessionInput,
	config: IngestSecurityConfig = getIngestSecurityConfig(),
): void {
	if (input.subagents && input.subagents.length > config.maxSubagents) {
		throw new ORPCError("PAYLOAD_TOO_LARGE", {
			message: `Too many subagent transcripts. Limit is ${config.maxSubagents}.`,
		});
	}

	const contentBytes = getContentByteLength(input.content);
	if (contentBytes > config.maxContentBytes) {
		throw new ORPCError("PAYLOAD_TOO_LARGE", {
			message: `Transcript exceeds ${config.maxContentBytes} bytes.`,
		});
	}

	const subagentBytes = getTotalSubagentByteLength(input.subagents);
	if (subagentBytes > config.maxTotalSubagentBytes) {
		throw new ORPCError("PAYLOAD_TOO_LARGE", {
			message: `Subagent transcripts exceed ${config.maxTotalSubagentBytes} bytes.`,
		});
	}
}

export function isIngestRequestTooLarge(
	request: Request,
	config: IngestSecurityConfig = getIngestSecurityConfig(),
): boolean {
	const contentLength = request.headers.get("content-length");
	if (!contentLength) return false;
	const parsed = Number.parseInt(contentLength, 10);
	if (!Number.isFinite(parsed)) return false;
	return parsed > config.maxRequestBytes;
}

export async function cloneRequestWithBodyLimit(
	request: Request,
	config: IngestSecurityConfig = getIngestSecurityConfig(),
): Promise<Request> {
	if (isIngestRequestTooLarge(request, config)) {
		throw new IngestRequestTooLargeError(config.maxRequestBytes);
	}

	if (!request.body) {
		return request;
	}

	const reader = request.body.getReader();
	const chunks: Uint8Array[] = [];
	let totalBytes = 0;

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		if (!value) continue;

		totalBytes += value.byteLength;
		if (totalBytes > config.maxRequestBytes) {
			throw new IngestRequestTooLargeError(config.maxRequestBytes);
		}

		chunks.push(value);
	}

	const body = new Uint8Array(totalBytes);
	let offset = 0;
	for (const chunk of chunks) {
		body.set(chunk, offset);
		offset += chunk.byteLength;
	}

	const headers = new Headers(request.headers);
	headers.delete("content-length");

	return new Request(request, {
		body,
		headers,
	});
}

export function createInMemoryRateLimiter(config: IngestRateLimitConfig) {
	const buckets = new Map<string, RateLimitBucket>();

	return {
		check(key: string, now = Date.now()) {
			const existing = buckets.get(key);
			if (!existing || existing.resetAt <= now) {
				buckets.set(key, {
					count: 1,
					resetAt: now + config.windowMs,
				});
				return;
			}

			if (existing.count >= config.maxRequests) {
				throw new ORPCError("TOO_MANY_REQUESTS", {
					message: `Ingest rate limit exceeded. Try again after ${Math.ceil((existing.resetAt - now) / 1000)} seconds.`,
				});
			}

			existing.count += 1;
		},
		reset() {
			buckets.clear();
		},
	};
}
