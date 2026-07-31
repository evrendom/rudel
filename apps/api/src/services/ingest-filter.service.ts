import { getLogger } from "@logtape/logtape";
import { INGEST_AGGREGATE_CONTENT_MAX_BYTES } from "@rudel/api-routes";
import { readPositiveSafeIntegerEnv } from "../lib/env.js";
import { getIngestFilterWorkerError } from "./ingest-filter.error.js";
import type {
	IngestFilterFields,
	IngestFilterResult,
	IngestFilterWorkerResponse,
} from "./ingest-filter.types.js";

const logger = getLogger(["rudel", "api", "ingest-filter-queue"]);
const QUEUE_RETRY_AFTER_MS = 1_000;

export interface IngestFilterQueueConfig {
	readonly globalMaxBytes: number;
	readonly globalMaxJobs: number;
	readonly perUserMaxBytes: number;
	readonly perUserMaxJobs: number;
	readonly timeoutMs: number;
}

export interface IngestFilterQueueMetrics {
	readonly activeJobs: number;
	/** Includes the active job and all jobs waiting behind it. */
	readonly queueDepth: number;
	/** Includes the active job and all jobs waiting behind it. */
	readonly queuedBytes: number;
	readonly waitTimeMs: {
		readonly average: number;
		readonly last: number;
		readonly max: number;
	};
	readonly rejectionCount: number;
	readonly timeoutCount: number;
	readonly cancellationCount: number;
}

export interface IngestFilterRequest {
	readonly bytes: number;
	readonly fields: IngestFilterFields;
	readonly signal: AbortSignal | undefined;
	readonly userId: string;
}

type QueueLimit =
	| "global-bytes"
	| "global-jobs"
	| "per-user-bytes"
	| "per-user-jobs";

interface PendingFilterRequest extends IngestFilterRequest {
	readonly abortListener: () => void;
	readonly enqueuedAt: number;
	readonly reject: (reason: Error) => void;
	readonly requestId: number;
	readonly resolve: (result: IngestFilterResult) => void;
	timeout: ReturnType<typeof setTimeout>;
}

interface UserQueueUsage {
	bytes: number;
	jobs: number;
}

export class IngestFilterQueueFullError extends Error {
	readonly retryAfterMs = QUEUE_RETRY_AFTER_MS;

	constructor(readonly limit: QueueLimit) {
		super("Transcript filtering is busy. Please retry shortly.");
		this.name = "IngestFilterQueueFullError";
	}
}

export class IngestFilterQueueTimeoutError extends Error {
	readonly retryAfterMs = QUEUE_RETRY_AFTER_MS;

	constructor() {
		super("Transcript filtering timed out. Please retry shortly.");
		this.name = "IngestFilterQueueTimeoutError";
	}
}

export class IngestFilterQueueAbortedError extends Error {
	constructor() {
		super(
			"Transcript filtering was cancelled because the request disconnected.",
		);
		this.name = "IngestFilterQueueAbortedError";
	}
}

export class IngestFilterQueueClosedError extends Error {
	readonly retryAfterMs = QUEUE_RETRY_AFTER_MS;

	constructor() {
		super("Transcript filtering is restarting. Please retry shortly.");
		this.name = "IngestFilterQueueClosedError";
	}
}

/**
 * One worker processes one job at a time. When possible, the next job belongs
 * to a different user than the previous job so one tenant cannot put another
 * accepted tenant behind its entire backlog.
 */
export class IngestFilterQueue {
	private activeRequestId: number | undefined;
	private cancellationCount = 0;
	private closed = false;
	private filterWorker: Worker | undefined;
	private lastWaitTimeMs = 0;
	private lastStartedUserId: string | undefined;
	private maxWaitTimeMs = 0;
	private nextRequestId = 1;
	private readonly pendingRequests = new Map<number, PendingFilterRequest>();
	private rejectionCount = 0;
	private timeoutCount = 0;
	private totalQueuedBytes = 0;
	private totalWaitTimeMs = 0;
	private readonly userQueueUsage = new Map<string, UserQueueUsage>();
	private readonly waitingRequestIds: number[] = [];
	private waitTimeSampleCount = 0;

	constructor(private readonly config: IngestFilterQueueConfig) {}

	filter(request: IngestFilterRequest): Promise<IngestFilterResult> {
		if (this.closed) {
			return Promise.reject(new IngestFilterQueueClosedError());
		}

		if (request.signal?.aborted) {
			this.cancellationCount += 1;
			return Promise.reject(new IngestFilterQueueAbortedError());
		}

		const exceededLimit = this.getExceededLimit(request);
		if (exceededLimit) {
			this.rejectionCount += 1;
			logger.warn(
				"Transcript filtering queue rejected work at {limit}: {queueDepth} jobs and {queuedBytes} bytes queued",
				{
					limit: exceededLimit,
					queueDepth: this.pendingRequests.size,
					queuedBytes: this.totalQueuedBytes,
				},
			);
			return Promise.reject(new IngestFilterQueueFullError(exceededLimit));
		}

		const requestId = this.nextRequestId;
		this.nextRequestId += 1;

		return new Promise((resolve, reject) => {
			const abortListener = () => {
				this.cancelRequest(requestId);
			};
			const timeout = setTimeout(() => {
				this.timeoutRequest(requestId);
			}, this.config.timeoutMs);
			const pending: PendingFilterRequest = {
				...request,
				abortListener,
				enqueuedAt: performance.now(),
				reject,
				requestId,
				resolve,
				timeout,
			};

			this.pendingRequests.set(requestId, pending);
			this.totalQueuedBytes += request.bytes;
			request.signal?.addEventListener("abort", abortListener, { once: true });

			const userUsage = this.getOrCreateUserQueueUsage(request.userId);
			userUsage.bytes += request.bytes;
			userUsage.jobs += 1;
			this.waitingRequestIds.push(requestId);
			this.dispatchNextRequest();
		});
	}

	getMetrics(): IngestFilterQueueMetrics {
		const averageWaitTimeMs =
			this.waitTimeSampleCount === 0
				? 0
				: Math.round(this.totalWaitTimeMs / this.waitTimeSampleCount);

		return {
			activeJobs: this.activeRequestId === undefined ? 0 : 1,
			queueDepth: this.pendingRequests.size,
			queuedBytes: this.totalQueuedBytes,
			waitTimeMs: {
				average: averageWaitTimeMs,
				last: this.lastWaitTimeMs,
				max: this.maxWaitTimeMs,
			},
			rejectionCount: this.rejectionCount,
			timeoutCount: this.timeoutCount,
			cancellationCount: this.cancellationCount,
		};
	}

	close(): void {
		if (this.closed) {
			return;
		}
		this.closed = true;
		this.stopWorker();

		const error = new IngestFilterQueueClosedError();
		for (const pending of this.pendingRequests.values()) {
			clearTimeout(pending.timeout);
			pending.signal?.removeEventListener("abort", pending.abortListener);
			pending.reject(error);
		}

		this.activeRequestId = undefined;
		this.pendingRequests.clear();
		this.totalQueuedBytes = 0;
		this.userQueueUsage.clear();
		this.waitingRequestIds.length = 0;
	}

	private getExceededLimit(
		request: IngestFilterRequest,
	): QueueLimit | undefined {
		if (this.pendingRequests.size + 1 > this.config.globalMaxJobs) {
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
		if (existing) {
			return existing;
		}

		const created: UserQueueUsage = {
			bytes: 0,
			jobs: 0,
		};
		this.userQueueUsage.set(userId, created);
		return created;
	}

	private dispatchNextRequest(): void {
		if (this.closed || this.activeRequestId !== undefined) {
			return;
		}

		const pending = this.takeNextWaitingRequest();
		if (!pending) {
			return;
		}

		this.activeRequestId = pending.requestId;
		this.lastStartedUserId = pending.userId;
		this.restartTimeout(pending);
		this.recordWaitTime(pending);

		try {
			this.getFilterWorker().postMessage({
				requestId: pending.requestId,
				fields: pending.fields,
			});
		} catch (error) {
			this.stopWorker();
			this.failActiveRequest(toError(error));
		}
	}

	private takeNextWaitingRequest(): PendingFilterRequest | undefined {
		while (this.waitingRequestIds.length > 0) {
			const differentUserIndex = this.waitingRequestIds.findIndex(
				(requestId) =>
					this.pendingRequests.get(requestId)?.userId !==
					this.lastStartedUserId,
			);
			const nextIndex = differentUserIndex === -1 ? 0 : differentUserIndex;
			const [requestId] = this.waitingRequestIds.splice(nextIndex, 1);
			if (requestId === undefined) {
				continue;
			}

			const pending = this.pendingRequests.get(requestId);
			if (pending) {
				return pending;
			}
		}

		return undefined;
	}

	private restartTimeout(pending: PendingFilterRequest): void {
		clearTimeout(pending.timeout);
		pending.timeout = setTimeout(() => {
			this.timeoutRequest(pending.requestId);
		}, this.config.timeoutMs);
	}

	private recordWaitTime(pending: PendingFilterRequest): void {
		const waitTimeMs = Math.max(
			0,
			Math.round(performance.now() - pending.enqueuedAt),
		);
		this.lastWaitTimeMs = waitTimeMs;
		this.maxWaitTimeMs = Math.max(this.maxWaitTimeMs, waitTimeMs);
		this.totalWaitTimeMs += waitTimeMs;
		this.waitTimeSampleCount += 1;
	}

	private getFilterWorker(): Worker {
		if (this.filterWorker) {
			return this.filterWorker;
		}

		const worker = new Worker(
			new URL("./ingest-filter.worker.ts", import.meta.url).href,
		);
		worker.addEventListener(
			"message",
			(event: MessageEvent<IngestFilterWorkerResponse>) => {
				this.handleWorkerMessage(worker, event.data);
			},
		);
		worker.addEventListener("error", (event) => {
			this.handleWorkerFailure(worker, new Error(event.message));
		});
		worker.addEventListener("close", () => {
			this.handleWorkerFailure(
				worker,
				new Error("Transcript filtering worker stopped unexpectedly"),
			);
		});
		worker.unref();
		this.filterWorker = worker;
		return worker;
	}

	private handleWorkerMessage(
		worker: Worker,
		response: IngestFilterWorkerResponse,
	): void {
		if (worker !== this.filterWorker) {
			return;
		}
		if (response.requestId !== this.activeRequestId) {
			this.handleWorkerFailure(
				worker,
				new Error("Transcript filtering worker returned an unknown request"),
			);
			return;
		}

		const pending = this.pendingRequests.get(response.requestId);
		if (!pending) {
			this.handleWorkerFailure(
				worker,
				new Error("Transcript filtering worker returned an unknown request"),
			);
			return;
		}

		this.activeRequestId = undefined;
		this.removePendingRequest(pending);
		if (response.status === "error") {
			pending.reject(getIngestFilterWorkerError(response));
		} else {
			pending.resolve(response.result);
		}

		this.dispatchNextRequest();
	}

	private handleWorkerFailure(worker: Worker, error: Error): void {
		if (worker !== this.filterWorker) {
			return;
		}

		this.stopWorker();
		this.failActiveRequest(error);
	}

	private failActiveRequest(error: Error): void {
		const pending = this.getActiveRequest();
		this.activeRequestId = undefined;
		if (!pending) {
			this.dispatchNextRequest();
			return;
		}

		this.removePendingRequest(pending);
		pending.reject(error);
		this.dispatchNextRequest();
	}

	private timeoutRequest(requestId: number): void {
		const pending = this.pendingRequests.get(requestId);
		if (!pending) {
			return;
		}

		this.timeoutCount += 1;
		logger.warn(
			"Transcript filtering request timed out after {timeoutMs}ms with {queueDepth} jobs queued",
			{
				queueDepth: this.pendingRequests.size,
				timeoutMs: this.config.timeoutMs,
			},
		);
		this.rejectPendingRequest(pending, new IngestFilterQueueTimeoutError());
	}

	private cancelRequest(requestId: number): void {
		const pending = this.pendingRequests.get(requestId);
		if (!pending) {
			return;
		}

		this.cancellationCount += 1;
		this.rejectPendingRequest(pending, new IngestFilterQueueAbortedError());
	}

	private rejectPendingRequest(
		pending: PendingFilterRequest,
		error: Error,
	): void {
		if (pending.requestId === this.activeRequestId) {
			this.activeRequestId = undefined;
			this.stopWorker();
		} else {
			this.removeWaitingRequest(pending);
		}

		this.removePendingRequest(pending);
		pending.reject(error);
		this.dispatchNextRequest();
	}

	private removeWaitingRequest(pending: PendingFilterRequest): void {
		const index = this.waitingRequestIds.indexOf(pending.requestId);
		if (index !== -1) {
			this.waitingRequestIds.splice(index, 1);
		}
	}

	private removePendingRequest(pending: PendingFilterRequest): void {
		clearTimeout(pending.timeout);
		pending.signal?.removeEventListener("abort", pending.abortListener);
		this.pendingRequests.delete(pending.requestId);
		this.totalQueuedBytes -= pending.bytes;

		const userUsage = this.userQueueUsage.get(pending.userId);
		if (!userUsage) {
			return;
		}
		userUsage.bytes -= pending.bytes;
		userUsage.jobs -= 1;
		if (userUsage.jobs === 0) {
			this.userQueueUsage.delete(pending.userId);
		}
	}

	private getActiveRequest(): PendingFilterRequest | undefined {
		if (this.activeRequestId === undefined) {
			return undefined;
		}
		return this.pendingRequests.get(this.activeRequestId);
	}

	private stopWorker(): void {
		const worker = this.filterWorker;
		this.filterWorker = undefined;
		worker?.terminate();
	}
}

const ingestFilterQueue = new IngestFilterQueue({
	globalMaxBytes: readPositiveSafeIntegerEnv(
		"INGEST_FILTER_QUEUE_GLOBAL_MAX_BYTES",
		INGEST_AGGREGATE_CONTENT_MAX_BYTES * 2,
	),
	globalMaxJobs: readPositiveSafeIntegerEnv(
		"INGEST_FILTER_QUEUE_GLOBAL_MAX_JOBS",
		8,
	),
	perUserMaxBytes: readPositiveSafeIntegerEnv(
		"INGEST_FILTER_QUEUE_PER_USER_MAX_BYTES",
		INGEST_AGGREGATE_CONTENT_MAX_BYTES,
	),
	perUserMaxJobs: readPositiveSafeIntegerEnv(
		"INGEST_FILTER_QUEUE_PER_USER_MAX_JOBS",
		5,
	),
	timeoutMs: readPositiveSafeIntegerEnv(
		"INGEST_FILTER_QUEUE_TIMEOUT_MS",
		30_000,
	),
});

export function filterSessionTextFieldsOffThread(
	request: IngestFilterRequest,
): Promise<IngestFilterResult> {
	return ingestFilterQueue.filter(request);
}

export function getIngestFilterQueueMetrics(): IngestFilterQueueMetrics {
	return ingestFilterQueue.getMetrics();
}

export function shutdownIngestFilterQueue(): void {
	ingestFilterQueue.close();
}

function toError(error: unknown): Error {
	return error instanceof Error
		? error
		: new Error("Transcript filtering worker failed");
}
