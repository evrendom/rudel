import type { Logger } from "@logtape/logtape";
import { type FailedUpload, recordFailedUpload } from "./failed-uploads.js";
import type { UploadResult } from "./types.js";

/**
 * Make hook upload failures durable and surface destination refusals without
 * interfering with the agent's session.
 */
export async function reportHookUploadFailure(
	logger: Logger,
	result: UploadResult,
	failure: Omit<FailedUpload, "error" | "failedAt" | "status">,
): Promise<undefined | Error> {
	const uploadError = result.error ?? "Unknown error";
	logger.error("Upload failed for session {sessionId}: {error}", {
		sessionId: failure.sessionId,
		error: uploadError,
	});

	const disposition = result.retryable === false ? "permanent" : "retryable";
	const verb = result.endpointRejected ? "refused" : "failed";
	process.stderr.write(
		`Opaline hook upload ${verb} for session ${failure.sessionId} [${disposition}]: ${uploadError}\n`,
	);

	await recordFailedUpload({
		...failure,
		error: uploadError,
		failureKind: result.failureKind,
		status: disposition,
	});

	if (result.endpointRejected) {
		return new Error(uploadError);
	}
}
