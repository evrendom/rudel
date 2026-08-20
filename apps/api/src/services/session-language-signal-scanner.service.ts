import type { LanguageSignalCounts } from "@rudel/language-signals";
import type { SessionLanguageSignalScannerWorkerResponse } from "./session-language-signal-scanner.types.js";

interface PendingLanguageSignalScan {
	readonly reject: (error: Error) => void;
	readonly resolve: (counts: LanguageSignalCounts) => void;
	readonly timeout: ReturnType<typeof setTimeout>;
}

const DEFAULT_SCAN_TIMEOUT_MS = 60_000;

export class SessionLanguageSignalScanner {
	private closed = false;
	private readonly createWorker: () => Worker;
	private nextRequestId = 1;
	private readonly pending = new Map<number, PendingLanguageSignalScan>();
	private readonly scanTimeoutMs: number;
	private worker: Worker | undefined;

	constructor(input?: {
		readonly createWorker?: () => Worker;
		readonly scanTimeoutMs?: number;
	}) {
		this.createWorker = input?.createWorker ?? createScannerWorker;
		this.scanTimeoutMs = input?.scanTimeoutMs ?? DEFAULT_SCAN_TIMEOUT_MS;
	}

	scan(content: string): Promise<LanguageSignalCounts> {
		if (this.closed) {
			return Promise.reject(
				new Error("Language-signal scanner is shutting down"),
			);
		}
		const requestId = this.nextRequestId;
		this.nextRequestId += 1;

		return new Promise((resolve, reject) => {
			try {
				const worker = this.getWorker();
				const timeout = setTimeout(() => {
					this.handleWorkerFailure(
						worker,
						new Error(
							`Language-signal scan exceeded ${this.scanTimeoutMs}ms deadline`,
						),
					);
				}, this.scanTimeoutMs);
				timeout.unref();
				this.pending.set(requestId, { reject, resolve, timeout });
				worker.postMessage({ content, requestId });
			} catch (error) {
				const pending = this.pending.get(requestId);
				if (pending) clearTimeout(pending.timeout);
				this.pending.delete(requestId);
				reject(toError(error));
			}
		});
	}

	close(): void {
		this.closed = true;
		this.failAll(new Error("Language-signal scanner is shutting down"));
	}

	private getWorker(): Worker {
		if (this.worker) return this.worker;
		const worker = this.createWorker();
		worker.addEventListener(
			"message",
			(event: MessageEvent<SessionLanguageSignalScannerWorkerResponse>) => {
				this.handleMessage(worker, event.data);
			},
		);
		worker.addEventListener("error", (event) => {
			this.handleWorkerFailure(worker, new Error(event.message));
		});
		worker.addEventListener("close", () => {
			this.handleWorkerFailure(
				worker,
				new Error("Language-signal scanner stopped unexpectedly"),
			);
		});
		worker.unref();
		this.worker = worker;
		return worker;
	}

	private handleMessage(
		worker: Worker,
		response: SessionLanguageSignalScannerWorkerResponse,
	): void {
		if (worker !== this.worker) return;
		const pending = this.pending.get(response.requestId);
		if (!pending) return;
		this.pending.delete(response.requestId);
		clearTimeout(pending.timeout);

		if (response.status === "error") {
			pending.reject(new Error(response.message));
			return;
		}
		pending.resolve(response.counts);
	}

	private handleWorkerFailure(worker: Worker, error: Error): void {
		if (worker !== this.worker) return;
		this.failAll(error);
	}

	private failAll(error: Error): void {
		const worker = this.worker;
		this.worker = undefined;
		worker?.terminate();
		for (const pending of this.pending.values()) {
			clearTimeout(pending.timeout);
			pending.reject(error);
		}
		this.pending.clear();
	}
}

function createScannerWorker(): Worker {
	return new Worker(
		new URL("./session-language-signal-scanner.worker.ts", import.meta.url)
			.href,
	);
}

const scanner = new SessionLanguageSignalScanner();

export function scanSessionLanguageSignalsOffThread(
	content: string,
): Promise<LanguageSignalCounts> {
	return scanner.scan(content);
}

export function shutdownSessionLanguageSignalScanner(): void {
	scanner.close();
}

function toError(error: unknown): Error {
	return error instanceof Error
		? error
		: new Error("Language-signal scanner failed");
}
