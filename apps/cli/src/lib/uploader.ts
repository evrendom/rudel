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

const RETRYABLE_STATUS_CODES = new Set([502, 503]);
const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 1_000;

function isRetryable(error: unknown): boolean {
	if (error instanceof ORPCError) {
		return RETRYABLE_STATUS_CODES.has(error.status);
	}
	if (error instanceof TypeError) {
		return true; // network errors (fetch failures)
	}
	return false;
}

function isRateLimited(error: unknown): boolean {
	return error instanceof ORPCError && error.status === 429;
}

function formatError(error: unknown): string {
	if (isRateLimited(error)) {
		const data = (error as { data?: unknown }).data as {
			limit?: number;
			windowSeconds?: number;
		} | null;
		const windowMin = data?.windowSeconds
			? Math.round(data.windowSeconds / 60)
			: 60;
		const limit = data?.limit ?? "unknown";
		return `Rate limit reached (${limit} sessions per ${windowMin} min). Wait and retry with: rudel upload --retry`;
	}
	if (error instanceof ORPCError) {
		return `${error.status} ${error.message}`;
	}
	if (error instanceof Error) {
		return error.message;
	}
	return String(error);
}

/**
 * Upload a session transcript to the backend via oRPC.
 * Retries on transient errors (502, 503) with exponential backoff.
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
			const errorMessage = formatError(error);

			if (isRateLimited(error)) {
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
