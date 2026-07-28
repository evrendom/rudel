import {
	filterSessionTextFields,
	SecretFilterConvergenceError,
} from "@rudel/secret-filter";
import type {
	IngestFilterWorkerRequest,
	IngestFilterWorkerResponse,
} from "./ingest-filter.types.js";

declare const self: {
	addEventListener(
		type: "message",
		listener: (event: MessageEvent<IngestFilterWorkerRequest>) => void,
	): void;
	postMessage(message: IngestFilterWorkerResponse): void;
};

self.addEventListener(
	"message",
	(event: MessageEvent<IngestFilterWorkerRequest>) => {
		const response = filterIngestText(event.data);
		self.postMessage(response);
	},
);

function filterIngestText(
	request: IngestFilterWorkerRequest,
): IngestFilterWorkerResponse {
	try {
		return {
			status: "success",
			requestId: request.requestId,
			result: filterSessionTextFields(request.fields),
		};
	} catch (error) {
		if (error instanceof SecretFilterConvergenceError) {
			return {
				status: "error",
				requestId: request.requestId,
				reason: "did-not-converge",
				maxPasses: error.maxPasses,
			};
		}
		return {
			status: "error",
			requestId: request.requestId,
			reason: "worker-error",
			message:
				error instanceof Error
					? error.message
					: "Transcript filtering failed in the worker",
		};
	}
}
