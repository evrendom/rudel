import { createORPCClient, ORPCError } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { ContractRouterClient } from "@orpc/contract";
import type {
	contract,
	IngestSessionInput,
	ProductAnalyticsClientSurface,
	ProductAnalyticsUploadMode,
	Source,
} from "@rudel/api-routes";
import type { Credentials } from "./credentials.js";
import {
	captureCliUploadFailed,
	captureCliUploadInitiated,
	getCliUserId,
	getUploadTerminalFailureStage,
} from "./product-analytics.js";
import type { UploadResult } from "./types.js";

export interface UploadConfig {
	endpoint: string;
	token: string;
	authType?: "bearer" | "api-key";
	onRetry?: (attempt: number, maxAttempts: number, error: string) => void;
	analytics?: {
		clientSurface: ProductAnalyticsClientSurface;
		uploadMode: ProductAnalyticsUploadMode;
		agentSource: Source;
		projectPath: string;
		organizationId?: string;
		userId?: string;
		credentials?: Credentials | null;
	};
}

const RETRYABLE_STATUS_CODES = new Set([502, 503, 429]);
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

function formatError(error: unknown): string {
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
 * Retries on transient errors (502, 503, 429) with exponential backoff.
 */
export async function uploadSession(
	request: IngestSessionInput,
	config: UploadConfig,
): Promise<UploadResult> {
	if (config.analytics) {
		captureCliUploadInitiated({
			surface: config.analytics.clientSurface,
			clientSurface: config.analytics.clientSurface,
			uploadMode: config.analytics.uploadMode,
			agentSource: config.analytics.agentSource,
			organizationId: config.analytics.organizationId,
			userId:
				config.analytics.userId ?? getCliUserId(config.analytics.credentials),
			projectPath: config.analytics.projectPath,
			attemptNumber: 1,
			contentSizeBytes: request.content.length,
		});
	}

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

			if (isRetryable(error) && attempt < MAX_ATTEMPTS) {
				config.onRetry?.(attempt, MAX_ATTEMPTS, errorMessage);
				const delay = BASE_DELAY_MS * 2 ** (attempt - 1);
				await new Promise((resolve) => setTimeout(resolve, delay));
				continue;
			}

			if (config.analytics) {
				captureCliUploadFailed({
					surface: config.analytics.clientSurface,
					clientSurface: config.analytics.clientSurface,
					uploadMode: config.analytics.uploadMode,
					agentSource: config.analytics.agentSource,
					failureStage: getUploadTerminalFailureStage(error),
					error,
					organizationId: config.analytics.organizationId,
					userId:
						config.analytics.userId ??
						getCliUserId(config.analytics.credentials),
					projectPath: config.analytics.projectPath,
					attemptNumber: attempt,
					isRetryable: isRetryable(error),
				});
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
