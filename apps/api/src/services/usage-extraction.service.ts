import { getLogger } from "@logtape/logtape";
import { INGEST_AGGREGATE_CONTENT_MAX_BYTES } from "@rudel/api-routes";
import {
	createIncompleteUsageExtractionResult,
	type UsageExtractionInput,
	type UsageExtractionResult,
} from "@rudel/usage-events";
import { readPositiveSafeIntegerEnv } from "../lib/env.js";
import type {
	UsageExtractionTelemetry,
	UsageExtractionWorkerResponse,
} from "./usage-extraction.types.js";

const logger = getLogger(["rudel", "api", "usage-extraction-queue"]);
const QUEUE_RETRY_AFTER_MS = 1_000;

export interface UsageExtractionQueueConfig {
	readonly globalMaxBytes: number;
	readonly globalMaxJobs: number;
	readonly perUserMaxBytes: number;
	readonly perUserMaxJobs: number;
	readonly timeoutMs: number;
}

export interface UsageExtractionQueueMetrics {
	readonly activeJobs: number;
	readonly cancellationCount: number;
	readonly completedBytes: number;
	readonly completedLines: number;
	readonly lastDurationMs: number;
	readonly queueDepth: number;
	readonly queuedBytes: number;
	readonly rejectionCount: number;
	readonly timeoutCount: number;
}

export interface UsageExtractionRequest {
	readonly bytes: number;
	readonly input: UsageExtractionInput;
	readonly signal: AbortSignal | undefined;
	readonly userId: string;
}

type QueueLimit =
	| "global-bytes"
	| "global-jobs"
	| "per-user-bytes"
	| "per-user-jobs";

interface PendingUsageExtraction extends UsageExtractionRequest {
	readonly abortListener: () => void;
	readonly reject: (reason: Error) => void;
	readonly requestId: number;
	readonly resolve: (result: UsageExtractionResult) => void;
	timeout: ReturnType<typeof setTimeout>;
}

interface UserQueueUsage {
	bytes: number;
	jobs: number;
}

export class UsageExtractionExecutionError extends Error {
	readonly shouldPersistReceipt: boolean = true;
	readonly extraction = createIncompleteUsageExtractionResult([
		{
			code: "usage_extractor_execution_failed",
			count: 1,
			fatal: true,
		},
	]);

	constructor(
		cause: unknown,
		message = "Usage extraction failed. Retry shortly.",
	) {
		super(message, { cause });
		this.name = "UsageExtractionExecutionError";
	}
}

export class UsageExtractionQueueFullError extends UsageExtractionExecutionError {
	readonly retryAfterMs = QUEUE_RETRY_AFTER_MS;
	readonly shouldPersistReceipt: boolean = false;

	constructor(readonly limit: QueueLimit) {
		super(undefined, "Usage extraction is busy. Retry shortly.");
		this.name = "UsageExtractionQueueFullError";
	}
}

export class UsageExtractionQueueTimeoutError extends UsageExtractionExecutionError {
	readonly retryAfterMs = QUEUE_RETRY_AFTER_MS;

	constructor() {
		super(undefined, "Usage extraction timed out. Retry shortly.");
		this.name = "UsageExtractionQueueTimeoutError";
	}
}

export class UsageExtractionQueueAbortedError extends UsageExtractionExecutionError {
	readonly retryAfterMs = QUEUE_RETRY_AFTER_MS;
	readonly shouldPersistReceipt: boolean = false;

	constructor() {
		super(
			undefined,
			"Usage extraction was cancelled after the request closed.",
		);
		this.name = "UsageExtractionQueueAbortedError";
	}
}

export class UsageExtractionQueueClosedError extends UsageExtractionExecutionError {
	readonly retryAfterMs = QUEUE_RETRY_AFTER_MS;
	readonly shouldPersistReceipt: boolean = false;

	constructor() {
		super(undefined, "Usage extraction is restarting. Retry shortly.");
		this.name = "UsageExtractionQueueClosedError";
	}
}

export class UsageExtractionQueue {
	private activeRequestId: number | undefined;
	private cancellationCount = 0;
	private closed = false;
	private completedBytes = 0;
	private completedLines = 0;
	private extractionWorker: Worker | undefined;
	private lastDurationMs = 0;
	private lastStartedUserId: string | undefined;
	private nextRequestId = 1;
	private readonly pending = new Map<number, PendingUsageExtraction>();
	private rejectionCount = 0;
	private timeoutCount = 0;
	private totalQueuedBytes = 0;
	private readonly userQueueUsage = new Map<string, UserQueueUsage>();
	private readonly waitingIds: number[] = [];

	constructor(private readonly config: UsageExtractionQueueConfig) {}

	extract(request: UsageExtractionRequest): Promise<UsageExtractionResult> {
		if (this.closed) {
			return Promise.reject(new UsageExtractionQueueClosedError());
		}
		if (request.signal?.aborted) {
			this.cancellationCount += 1;
			return Promise.reject(new UsageExtractionQueueAbortedError());
		}
		const exceededLimit = this.getExceededLimit(request);
		if (exceededLimit) {
			this.rejectionCount += 1;
			return Promise.reject(new UsageExtractionQueueFullError(exceededLimit));
		}

		const requestId = this.nextRequestId;
		this.nextRequestId += 1;
		return new Promise((resolve, reject) => {
			const abortListener = () => this.cancelRequest(requestId);
			const timeout = setTimeout(
				() => this.timeoutRequest(requestId),
				this.config.timeoutMs,
			);
			this.pending.set(requestId, {
				...request,
				abortListener,
				reject,
				requestId,
				resolve,
				timeout,
			});
			this.totalQueuedBytes += request.bytes;
			const userUsage = this.getOrCreateUserQueueUsage(request.userId);
			userUsage.bytes += request.bytes;
			userUsage.jobs += 1;
			request.signal?.addEventListener("abort", abortListener, { once: true });
			this.waitingIds.push(requestId);
			this.dispatchNext();
		});
	}

	getMetrics(): UsageExtractionQueueMetrics {
		return {
			activeJobs: this.activeRequestId === undefined ? 0 : 1,
			cancellationCount: this.cancellationCount,
			completedBytes: this.completedBytes,
			completedLines: this.completedLines,
			lastDurationMs: this.lastDurationMs,
			queueDepth: this.pending.size,
			queuedBytes: this.totalQueuedBytes,
			rejectionCount: this.rejectionCount,
			timeoutCount: this.timeoutCount,
		};
	}

	close(): void {
		if (this.closed) return;
		this.closed = true;
		this.stopWorker();
		for (const request of this.pending.values()) {
			this.removeRequest(request);
			request.reject(new UsageExtractionQueueClosedError());
		}
		this.activeRequestId = undefined;
		this.userQueueUsage.clear();
		this.waitingIds.length = 0;
	}

	private getExceededLimit(
		request: UsageExtractionRequest,
	): QueueLimit | undefined {
		if (this.pending.size + 1 > this.config.globalMaxJobs) {
			return "global-jobs";
		}
		if (this.totalQueuedBytes + request.bytes > this.config.globalMaxBytes) {
			return "global-bytes";
		}
		const userUsage = this.userQueueUsage.get(request.userId);
		if ((userUsage?.jobs ?? 0) + 1 > this.config.perUserMaxJobs) {
			return "per-user-jobs";
		}
		if ((userUsage?.bytes ?? 0) + request.bytes > this.config.perUserMaxBytes) {
			return "per-user-bytes";
		}
		return undefined;
	}

	private getOrCreateUserQueueUsage(userId: string): UserQueueUsage {
		const existing = this.userQueueUsage.get(userId);
		if (existing) return existing;
		const created = { bytes: 0, jobs: 0 };
		this.userQueueUsage.set(userId, created);
		return created;
	}

	private dispatchNext(): void {
		if (this.closed || this.activeRequestId !== undefined) return;
		const request = this.takeNextWaitingRequest();
		if (!request) {
			return;
		}
		this.activeRequestId = request.requestId;
		this.lastStartedUserId = request.userId;
		try {
			this.getWorker().postMessage({
				input: request.input,
				requestId: request.requestId,
			});
		} catch (error) {
			this.stopWorker();
			this.failActive(new UsageExtractionExecutionError(error));
		}
	}

	private takeNextWaitingRequest(): PendingUsageExtraction | undefined {
		while (this.waitingIds.length > 0) {
			const differentUserIndex = this.waitingIds.findIndex(
				(requestId) =>
					this.pending.get(requestId)?.userId !== this.lastStartedUserId,
			);
			const nextIndex = differentUserIndex === -1 ? 0 : differentUserIndex;
			const [requestId] = this.waitingIds.splice(nextIndex, 1);
			if (requestId === undefined) continue;
			const request = this.pending.get(requestId);
			if (request) return request;
		}
		return undefined;
	}

	private getWorker(): Worker {
		if (this.extractionWorker) return this.extractionWorker;
		const worker = new Worker(
			new URL("./usage-extraction.worker.ts", import.meta.url).href,
		);
		worker.addEventListener(
			"message",
			(event: MessageEvent<UsageExtractionWorkerResponse>) => {
				this.handleWorkerMessage(worker, event.data);
			},
		);
		worker.addEventListener("error", (event) => {
			this.handleWorkerFailure(worker, new Error(event.message));
		});
		worker.addEventListener("close", () => {
			this.handleWorkerFailure(
				worker,
				new Error("Usage extraction worker stopped unexpectedly"),
			);
		});
		worker.unref();
		this.extractionWorker = worker;
		return worker;
	}

	private handleWorkerMessage(
		worker: Worker,
		response: UsageExtractionWorkerResponse,
	): void {
		if (
			worker !== this.extractionWorker ||
			response.requestId !== this.activeRequestId
		) {
			this.handleWorkerFailure(
				worker,
				new Error("Usage extraction worker returned an unknown request"),
			);
			return;
		}
		const request = this.pending.get(response.requestId);
		if (!request) {
			this.handleWorkerFailure(
				worker,
				new Error("Usage extraction worker returned a missing request"),
			);
			return;
		}

		this.activeRequestId = undefined;
		this.removeRequest(request);
		if (response.status === "error") {
			request.reject(
				new UsageExtractionExecutionError(new Error(response.message)),
			);
		} else {
			this.recordTelemetry(response.telemetry, response.result);
			request.resolve(response.result);
		}
		this.dispatchNext();
	}

	private recordTelemetry(
		telemetry: UsageExtractionTelemetry,
		result: UsageExtractionResult,
	): void {
		this.completedBytes += telemetry.contentBytes;
		this.completedLines += telemetry.lineCount;
		this.lastDurationMs = telemetry.durationMs;
		logger.info(
			"Usage extraction completed (bytes={bytes} lines={lines} events={events} complete={complete} duration_ms={durationMs})",
			{
				bytes: telemetry.contentBytes,
				complete: result.receipt.complete,
				durationMs: Math.round(telemetry.durationMs),
				events: result.events.length,
				lines: telemetry.lineCount,
			},
		);
	}

	private handleWorkerFailure(worker: Worker, cause: Error): void {
		if (worker !== this.extractionWorker) return;
		this.stopWorker();
		this.failActive(new UsageExtractionExecutionError(cause));
	}

	private failActive(error: UsageExtractionExecutionError): void {
		const request =
			this.activeRequestId === undefined
				? undefined
				: this.pending.get(this.activeRequestId);
		this.activeRequestId = undefined;
		if (request) {
			this.removeRequest(request);
			request.reject(error);
		}
		this.dispatchNext();
	}

	private timeoutRequest(requestId: number): void {
		const request = this.pending.get(requestId);
		if (!request) return;
		this.timeoutCount += 1;
		this.rejectRequest(request, new UsageExtractionQueueTimeoutError());
	}

	private cancelRequest(requestId: number): void {
		const request = this.pending.get(requestId);
		if (!request) return;
		this.cancellationCount += 1;
		this.rejectRequest(request, new UsageExtractionQueueAbortedError());
	}

	private rejectRequest(
		request: PendingUsageExtraction,
		error: UsageExtractionExecutionError,
	): void {
		if (request.requestId === this.activeRequestId) {
			this.activeRequestId = undefined;
			this.stopWorker();
		} else {
			const waitingIndex = this.waitingIds.indexOf(request.requestId);
			if (waitingIndex !== -1) this.waitingIds.splice(waitingIndex, 1);
		}
		this.removeRequest(request);
		request.reject(error);
		this.dispatchNext();
	}

	private removeRequest(request: PendingUsageExtraction): void {
		clearTimeout(request.timeout);
		request.signal?.removeEventListener("abort", request.abortListener);
		if (this.pending.delete(request.requestId)) {
			this.totalQueuedBytes -= request.bytes;
			const userUsage = this.userQueueUsage.get(request.userId);
			if (userUsage) {
				userUsage.bytes -= request.bytes;
				userUsage.jobs -= 1;
				if (userUsage.jobs === 0) this.userQueueUsage.delete(request.userId);
			}
		}
	}

	private stopWorker(): void {
		const worker = this.extractionWorker;
		this.extractionWorker = undefined;
		worker?.terminate();
	}
}

const usageExtractionQueue = new UsageExtractionQueue({
	globalMaxBytes: readPositiveSafeIntegerEnv(
		"USAGE_EXTRACTION_QUEUE_GLOBAL_MAX_BYTES",
		INGEST_AGGREGATE_CONTENT_MAX_BYTES * 2,
	),
	globalMaxJobs: readPositiveSafeIntegerEnv(
		"USAGE_EXTRACTION_QUEUE_GLOBAL_MAX_JOBS",
		8,
	),
	perUserMaxBytes: readPositiveSafeIntegerEnv(
		"USAGE_EXTRACTION_QUEUE_PER_USER_MAX_BYTES",
		INGEST_AGGREGATE_CONTENT_MAX_BYTES,
	),
	perUserMaxJobs: readPositiveSafeIntegerEnv(
		"USAGE_EXTRACTION_QUEUE_PER_USER_MAX_JOBS",
		5,
	),
	timeoutMs: readPositiveSafeIntegerEnv(
		"USAGE_EXTRACTION_QUEUE_TIMEOUT_MS",
		30_000,
	),
});

export function extractUsageEventsOffThread(
	request: UsageExtractionRequest,
): Promise<UsageExtractionResult> {
	return usageExtractionQueue.extract(request);
}

export function getUsageExtractionQueueMetrics(): UsageExtractionQueueMetrics {
	return usageExtractionQueue.getMetrics();
}

export function shutdownUsageExtractionQueue(): void {
	usageExtractionQueue.close();
}
