import {
	SecretFilterConvergenceError,
	SecretFilterJsonIntegrityError,
} from "@rudel/secret-filter";
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
	if (error instanceof SecretFilterJsonIntegrityError) {
		return {
			status: "error",
			requestId,
			reason: "json-integrity",
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
	if (response.reason === "json-integrity") {
		return new SecretFilterJsonIntegrityError();
	}
	return new Error(response.message);
}
