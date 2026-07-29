import { filterSessionTextFields } from "@rudel/secret-filter";
import { createIngestFilterWorkerError } from "./ingest-filter.error.js";
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
		return createIngestFilterWorkerError(request.requestId, error);
	}
}
