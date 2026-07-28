import { SecretFilterConvergenceError } from "@rudel/secret-filter";
import type {
	IngestFilterFields,
	IngestFilterResult,
	IngestFilterWorkerResponse,
} from "./ingest-filter.types.js";

interface PendingFilterRequest {
	readonly reject: (reason: Error) => void;
	readonly resolve: (result: IngestFilterResult) => void;
}

const pendingRequests = new Map<number, PendingFilterRequest>();
let filterWorker: Worker | undefined;
let nextRequestId = 1;

export function filterSessionTextFieldsOffThread(
	fields: IngestFilterFields,
): Promise<IngestFilterResult> {
	const requestId = nextRequestId;
	nextRequestId += 1;

	return new Promise((resolve, reject) => {
		pendingRequests.set(requestId, { resolve, reject });
		getFilterWorker().postMessage({ requestId, fields });
	});
}

function getFilterWorker(): Worker {
	if (filterWorker) {
		return filterWorker;
	}

	const worker = new Worker(
		new URL("./ingest-filter.worker.ts", import.meta.url).href,
	);
	worker.addEventListener(
		"message",
		(event: MessageEvent<IngestFilterWorkerResponse>) => {
			handleFilterWorkerMessage(event.data);
		},
	);
	worker.addEventListener("error", (event) => {
		handleFilterWorkerFailure(worker, new Error(event.message));
	});
	worker.addEventListener("close", () => {
		handleFilterWorkerFailure(
			worker,
			new Error("Transcript filtering worker stopped unexpectedly"),
		);
	});
	worker.unref();
	filterWorker = worker;
	return worker;
}

function handleFilterWorkerMessage(response: IngestFilterWorkerResponse): void {
	const pending = pendingRequests.get(response.requestId);
	if (!pending) {
		handleFilterWorkerFailure(
			filterWorker,
			new Error("Transcript filtering worker returned an unknown request"),
		);
		return;
	}

	pendingRequests.delete(response.requestId);
	if (response.status === "error") {
		if (response.reason === "did-not-converge") {
			pending.reject(new SecretFilterConvergenceError(response.maxPasses));
			return;
		}
		pending.reject(new Error(response.message));
		return;
	}
	pending.resolve(response.result);
}

function handleFilterWorkerFailure(
	worker: Worker | undefined,
	error: Error,
): void {
	if (!worker || filterWorker !== worker) {
		return;
	}

	filterWorker = undefined;
	worker.terminate();
	for (const pending of pendingRequests.values()) {
		pending.reject(error);
	}
	pendingRequests.clear();
}
