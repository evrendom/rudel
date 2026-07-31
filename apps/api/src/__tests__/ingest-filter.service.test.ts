import { describe, expect, test } from "bun:test";
import {
	MAX_FILTER_PASSES,
	SecretFilterConvergenceError,
} from "@rudel/secret-filter";
import {
	createIngestFilterWorkerError,
	getIngestFilterWorkerError,
} from "../services/ingest-filter.error.js";
import {
	filterSessionTextFieldsOffThread,
	IngestFilterQueue,
	IngestFilterQueueAbortedError,
	IngestFilterQueueClosedError,
	IngestFilterQueueTimeoutError,
} from "../services/ingest-filter.service.js";

const PRIVATE_KEY = [
	"-----BEGIN PRIVATE KEY-----",
	"CANARY".padEnd(64, "A"),
	"-----END PRIVATE KEY-----",
].join("\n");
const AWS_KEY = "AKIACANARY234567ABCD";

describe("filterSessionTextFieldsOffThread", () => {
	test("filters JSON-escaped private keys and subagent secrets", async () => {
		const content = JSON.stringify({ privateKey: PRIVATE_KEY });
		const result = await filterSessionTextFieldsOffThread({
			bytes: Buffer.byteLength(content, "utf8") + AWS_KEY.length,
			fields: {
				content,
				subagents: [
					{ agentId: "agent-1", content: `AWS_ACCESS_KEY_ID=${AWS_KEY}` },
				],
			},
			signal: new AbortController().signal,
			userId: "filter-secrets-test",
		});

		expect(result.content).toBe(
			JSON.stringify({ privateKey: "[REDACTED:private-key]" }),
		);
		expect(result.subagents).toEqual([
			{
				agentId: "agent-1",
				content: "AWS_ACCESS_KEY_ID=[REDACTED:aws-access-key-id]",
			},
		]);
		expect(result.counts).toEqual({
			"aws-access-key-id": 1,
			"private-key": 1,
		});
	});

	test("keeps the API event loop responsive while filtering a large transcript", async () => {
		const content = "ordinary transcript line\n".repeat(350_000);
		let filteringSettled = false;
		const filtering = filterSessionTextFieldsOffThread({
			bytes: Buffer.byteLength(content, "utf8"),
			fields: {
				content,
				subagents: undefined,
			},
			signal: new AbortController().signal,
			userId: "event-loop-test",
		}).then((result) => {
			filteringSettled = true;
			return result;
		});

		await Bun.sleep(0);

		expect(filteringSettled).toBe(false);
		const result = await filtering;
		expect(result.content).toBe(content);
		expect(result.counts).toEqual({});
	}, 20_000);

	test("preserves a structured convergence failure across worker serialization", () => {
		const response = createIngestFilterWorkerError(
			42,
			new SecretFilterConvergenceError(),
		);
		const error = getIngestFilterWorkerError(response);

		expect(response).toEqual({
			status: "error",
			requestId: 42,
			reason: "did-not-converge",
			maxPasses: MAX_FILTER_PASSES,
		});
		expect(error).toBeInstanceOf(SecretFilterConvergenceError);
		expect(error).toMatchObject({ maxPasses: MAX_FILTER_PASSES });
	});
});

describe("IngestFilterQueue limits", () => {
	test("enforces global job and byte limits before accepting work", async () => {
		const jobQueue = new IngestFilterQueue({
			globalMaxBytes: 100,
			globalMaxJobs: 2,
			perUserMaxBytes: 100,
			perUserMaxJobs: 2,
			timeoutMs: 10_000,
		});
		const firstController = new AbortController();
		const secondController = new AbortController();
		const first = jobQueue.filter({
			bytes: 1,
			fields: { content: "first", subagents: undefined },
			signal: firstController.signal,
			userId: "global-job-user-a",
		});
		const second = jobQueue.filter({
			bytes: 1,
			fields: { content: "second", subagents: undefined },
			signal: secondController.signal,
			userId: "global-job-user-b",
		});
		const rejectedForJobs = jobQueue.filter({
			bytes: 1,
			fields: { content: "third", subagents: undefined },
			signal: new AbortController().signal,
			userId: "global-job-user-c",
		});

		expect(jobQueue.getMetrics()).toMatchObject({
			queueDepth: 2,
			queuedBytes: 2,
			rejectionCount: 1,
		});
		firstController.abort();
		secondController.abort();
		await expect(rejectedForJobs).rejects.toMatchObject({
			limit: "global-jobs",
		});
		await expect(first).rejects.toBeInstanceOf(IngestFilterQueueAbortedError);
		await expect(second).rejects.toBeInstanceOf(IngestFilterQueueAbortedError);
		jobQueue.close();

		const byteQueue = new IngestFilterQueue({
			globalMaxBytes: 6,
			globalMaxJobs: 3,
			perUserMaxBytes: 6,
			perUserMaxJobs: 3,
			timeoutMs: 10_000,
		});
		const byteController = new AbortController();
		const accepted = byteQueue.filter({
			bytes: 6,
			fields: { content: "accepted", subagents: undefined },
			signal: byteController.signal,
			userId: "global-byte-user-a",
		});
		const rejectedForBytes = byteQueue.filter({
			bytes: 1,
			fields: { content: "rejected", subagents: undefined },
			signal: new AbortController().signal,
			userId: "global-byte-user-b",
		});

		expect(byteQueue.getMetrics()).toMatchObject({
			queueDepth: 1,
			queuedBytes: 6,
			rejectionCount: 1,
		});
		byteController.abort();
		await expect(rejectedForBytes).rejects.toMatchObject({
			limit: "global-bytes",
		});
		await expect(accepted).rejects.toBeInstanceOf(
			IngestFilterQueueAbortedError,
		);
		byteQueue.close();
	});

	test("enforces per-user job and byte limits without blocking another user", async () => {
		const jobQueue = new IngestFilterQueue({
			globalMaxBytes: 100,
			globalMaxJobs: 3,
			perUserMaxBytes: 100,
			perUserMaxJobs: 1,
			timeoutMs: 10_000,
		});
		const firstController = new AbortController();
		const otherController = new AbortController();
		const first = jobQueue.filter({
			bytes: 1,
			fields: { content: "first", subagents: undefined },
			signal: firstController.signal,
			userId: "per-user-job-user-a",
		});
		const rejectedForJobs = jobQueue.filter({
			bytes: 1,
			fields: { content: "second", subagents: undefined },
			signal: new AbortController().signal,
			userId: "per-user-job-user-a",
		});
		const otherUser = jobQueue.filter({
			bytes: 1,
			fields: { content: "other", subagents: undefined },
			signal: otherController.signal,
			userId: "per-user-job-user-b",
		});

		expect(jobQueue.getMetrics()).toMatchObject({
			queueDepth: 2,
			queuedBytes: 2,
			rejectionCount: 1,
		});
		firstController.abort();
		otherController.abort();
		await expect(rejectedForJobs).rejects.toMatchObject({
			limit: "per-user-jobs",
		});
		await expect(first).rejects.toBeInstanceOf(IngestFilterQueueAbortedError);
		await expect(otherUser).rejects.toBeInstanceOf(
			IngestFilterQueueAbortedError,
		);
		jobQueue.close();

		const byteQueue = new IngestFilterQueue({
			globalMaxBytes: 100,
			globalMaxJobs: 3,
			perUserMaxBytes: 6,
			perUserMaxJobs: 3,
			timeoutMs: 10_000,
		});
		const byteController = new AbortController();
		const accepted = byteQueue.filter({
			bytes: 6,
			fields: { content: "accepted", subagents: undefined },
			signal: byteController.signal,
			userId: "per-user-byte-user",
		});
		const rejectedForBytes = byteQueue.filter({
			bytes: 1,
			fields: { content: "rejected", subagents: undefined },
			signal: new AbortController().signal,
			userId: "per-user-byte-user",
		});

		byteController.abort();
		await expect(rejectedForBytes).rejects.toMatchObject({
			limit: "per-user-bytes",
		});
		await expect(accepted).rejects.toBeInstanceOf(
			IngestFilterQueueAbortedError,
		);
		byteQueue.close();
	});
});

describe("IngestFilterQueue cleanup and fairness", () => {
	test("restarts the worker after dispatch rejects an uncloneable request", async () => {
		const queue = new IngestFilterQueue({
			globalMaxBytes: 100,
			globalMaxJobs: 2,
			perUserMaxBytes: 100,
			perUserMaxJobs: 2,
			timeoutMs: 10_000,
		});
		const uncloneableFields = new Proxy(
			{ content: "uncloneable", subagents: undefined },
			{},
		);
		const failed = queue.filter({
			bytes: 11,
			fields: uncloneableFields,
			signal: new AbortController().signal,
			userId: "dispatch-failure-user",
		});

		await expect(failed).rejects.toThrow();

		const recovered = await queue.filter({
			bytes: 9,
			fields: { content: "recovered", subagents: undefined },
			signal: new AbortController().signal,
			userId: "recovered-user",
		});
		expect(recovered.content).toBe("recovered");
		expect(queue.getMetrics()).toMatchObject({
			activeJobs: 0,
			queueDepth: 0,
			queuedBytes: 0,
		});
		queue.close();
	});

	test("rejects pending and future work with a retryable closed error", async () => {
		const queue = new IngestFilterQueue({
			globalMaxBytes: 100,
			globalMaxJobs: 2,
			perUserMaxBytes: 100,
			perUserMaxJobs: 2,
			timeoutMs: 10_000,
		});
		const pending = queue.filter({
			bytes: 7,
			fields: { content: "pending", subagents: undefined },
			signal: new AbortController().signal,
			userId: "pending-at-close-user",
		});

		queue.close();

		const afterClose = queue.filter({
			bytes: 11,
			fields: { content: "after close", subagents: undefined },
			signal: new AbortController().signal,
			userId: "after-close-user",
		});
		await expect(pending).rejects.toBeInstanceOf(IngestFilterQueueClosedError);
		await expect(afterClose).rejects.toMatchObject({
			retryAfterMs: 1_000,
		});
		expect(queue.getMetrics()).toMatchObject({
			activeJobs: 0,
			queueDepth: 0,
			queuedBytes: 0,
		});
	});

	test("removes timed-out work from pending state", async () => {
		const queue = new IngestFilterQueue({
			globalMaxBytes: 16 * 1024 * 1024,
			globalMaxJobs: 2,
			perUserMaxBytes: 16 * 1024 * 1024,
			perUserMaxJobs: 2,
			timeoutMs: 20,
		});
		const largeContent = "ordinary transcript line\n".repeat(350_000);
		const timedOut = queue.filter({
			bytes: Buffer.byteLength(largeContent, "utf8"),
			fields: { content: largeContent, subagents: undefined },
			signal: new AbortController().signal,
			userId: "timeout-user",
		});

		await expect(timedOut).rejects.toBeInstanceOf(
			IngestFilterQueueTimeoutError,
		);
		expect(queue.getMetrics()).toMatchObject({
			activeJobs: 0,
			queueDepth: 0,
			queuedBytes: 0,
			timeoutCount: 1,
		});
		queue.close();
	});

	test("removes disconnected work from pending state", async () => {
		const queue = new IngestFilterQueue({
			globalMaxBytes: 100,
			globalMaxJobs: 2,
			perUserMaxBytes: 100,
			perUserMaxJobs: 2,
			timeoutMs: 10_000,
		});
		const activeController = new AbortController();
		const waitingController = new AbortController();
		const active = queue.filter({
			bytes: 7,
			fields: { content: "active", subagents: undefined },
			signal: activeController.signal,
			userId: "active-user",
		});
		const waiting = queue.filter({
			bytes: 5,
			fields: { content: "waiting", subagents: undefined },
			signal: waitingController.signal,
			userId: "waiting-user",
		});

		waitingController.abort();
		expect(queue.getMetrics()).toMatchObject({
			queueDepth: 1,
			queuedBytes: 7,
			cancellationCount: 1,
		});
		activeController.abort();
		await expect(waiting).rejects.toBeInstanceOf(IngestFilterQueueAbortedError);
		await expect(active).rejects.toBeInstanceOf(IngestFilterQueueAbortedError);
		expect(queue.getMetrics()).toMatchObject({
			activeJobs: 0,
			queueDepth: 0,
			queuedBytes: 0,
			cancellationCount: 2,
		});
		queue.close();
	});

	test("continues with accepted work after the active request disconnects", async () => {
		const queue = new IngestFilterQueue({
			globalMaxBytes: 16 * 1024 * 1024,
			globalMaxJobs: 2,
			perUserMaxBytes: 16 * 1024 * 1024,
			perUserMaxJobs: 2,
			timeoutMs: 10_000,
		});
		const activeController = new AbortController();
		const largeContent = "ordinary transcript line\n".repeat(100_000);
		const active = queue.filter({
			bytes: Buffer.byteLength(largeContent, "utf8"),
			fields: { content: largeContent, subagents: undefined },
			signal: activeController.signal,
			userId: "disconnected-active-user",
		});
		const waiting = queue.filter({
			bytes: 12,
			fields: { content: "other tenant", subagents: undefined },
			signal: new AbortController().signal,
			userId: "accepted-waiting-user",
		});

		activeController.abort();

		await expect(active).rejects.toBeInstanceOf(IngestFilterQueueAbortedError);
		expect((await waiting).content).toBe("other tenant");
		expect(queue.getMetrics()).toMatchObject({
			activeJobs: 0,
			queueDepth: 0,
			queuedBytes: 0,
			cancellationCount: 1,
		});
		queue.close();
	});

	test("schedules another tenant before one user's accepted backlog", async () => {
		const queue = new IngestFilterQueue({
			globalMaxBytes: 32 * 1024 * 1024,
			globalMaxJobs: 4,
			perUserMaxBytes: 24 * 1024 * 1024,
			perUserMaxJobs: 3,
			timeoutMs: 20_000,
		});
		const largeContent = "ordinary transcript line\n".repeat(100_000);
		const largeBytes = Buffer.byteLength(largeContent, "utf8");
		const completionOrder: string[] = [];
		const first = queue
			.filter({
				bytes: largeBytes,
				fields: { content: largeContent, subagents: undefined },
				signal: new AbortController().signal,
				userId: "tenant-a",
			})
			.then(() => {
				completionOrder.push("tenant-a-first");
			});
		const second = queue
			.filter({
				bytes: largeBytes,
				fields: { content: largeContent, subagents: undefined },
				signal: new AbortController().signal,
				userId: "tenant-a",
			})
			.then(() => {
				completionOrder.push("tenant-a-second");
			});
		const otherTenant = queue
			.filter({
				bytes: 12,
				fields: { content: "other tenant", subagents: undefined },
				signal: new AbortController().signal,
				userId: "tenant-b",
			})
			.then(() => {
				completionOrder.push("tenant-b");
			});

		await Promise.all([first, second, otherTenant]);

		expect(completionOrder).toEqual([
			"tenant-a-first",
			"tenant-b",
			"tenant-a-second",
		]);
		expect(queue.getMetrics().waitTimeMs.max).toBeGreaterThan(0);
		queue.close();
	}, 20_000);
});
