import { SecretFilterConvergenceError } from "@rudel/secret-filter";
import type { IngestFilterWorkerErrorResponse } from "./ingest-filter.types.js";

export function createIngestFilterWorkerError(
	requestId: number,
	error: unknown,
): IngestFilterWorkerErrorResponse {
	if (error instanceof SecretFilterConvergenceError) {
		return {
			status: "error",
			requestId,
			reason: "did-not-converge",
			maxPasses: error.maxPasses,
		};
	}
	return {
		status: "error",
		requestId,
		reason: "worker-error",
		message:
			error instanceof Error
				? error.message
				: "Transcript filtering failed in the worker",
	};
}

export function getIngestFilterWorkerError(
	response: IngestFilterWorkerErrorResponse,
): Error {
	if (response.reason === "did-not-converge") {
		return new SecretFilterConvergenceError(response.maxPasses);
	}
	return new Error(response.message);
}
