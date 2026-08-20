import { describe, expect, test } from "bun:test";
import {
	UsageExtractionExecutionError,
	UsageExtractionQueue,
	UsageExtractionQueueAbortedError,
	UsageExtractionQueueClosedError,
	UsageExtractionQueueFullError,
	UsageExtractionQueueTimeoutError,
} from "./usage-extraction.service.js";

const BASE_INPUT = {
	organizationId: "org-1",
	userId: "user-1",
	sessionId: "session-1",
	source: "claude_code" as const,
	subagents: {},
};

describe("usage extraction worker boundary", () => {
	test("extracts skill facts in the existing bounded worker", async () => {
		const queue = createQueue();
		const body = "# Worker body\n";
		const content = [
			JSON.stringify({
				message: {
					role: "assistant",
					content: [
						{
							type: "tool_use",
							name: "Skill",
							input: { skill: "worker-skill" },
						},
					],
				},
				type: "assistant",
			}),
			JSON.stringify({
				isMeta: true,
				message: {
					role: "user",
					content: `Base directory for this skill: /tmp/worker-skill\n\n${body}`,
				},
				type: "user",
			}),
		].join("\n");

		const result = await queue.extractSessionFacts({
			bytes: Buffer.byteLength(content, "utf8"),
			extractSkills: true,
			input: { ...BASE_INPUT, content },
			signal: new AbortController().signal,
			skillSessionDate: "2026-08-20T10:00:00.000Z",
			userId: "skill-worker-user",
		});

		expect(result.skills).toMatchObject({
			agent: "claude",
			uses: [{ content: body, name: "worker-skill" }],
		});
		queue.close();
	});

	test("keeps the event loop responsive and reports bytes and every parsed line", async () => {
		const queue = createQueue();
		const metadataLine = JSON.stringify({ type: "user" });
		const lineCount = 100_000;
		const content = Array.from({ length: lineCount }, () => metadataLine).join(
			"\n",
		);
		let settled = false;
		const extraction = queue
			.extract({
				bytes: Buffer.byteLength(content, "utf8"),
				input: { ...BASE_INPUT, content },
				signal: new AbortController().signal,
				userId: "event-loop-user",
			})
			.then((result) => {
				settled = true;
				return result;
			});

		await Bun.sleep(0);
		expect(settled).toBe(false);
		const result = await extraction;
		expect(result).toMatchObject({
			status: "complete",
			events: [],
			receipt: { complete: true, eventCount: 0 },
		});
		expect(queue.getMetrics()).toMatchObject({
			activeJobs: 0,
			completedBytes: Buffer.byteLength(content, "utf8"),
			completedLines: lineCount,
			queueDepth: 0,
			queuedBytes: 0,
		});
		queue.close();
	}, 20_000);

	test("times out active work, aborts disconnected work, and clears capacity", async () => {
		const timeoutQueue = createQueue(1);
		const content = `${JSON.stringify({ type: "user" })}\n`.repeat(200_000);
		const timedOut = timeoutQueue.extract({
			bytes: Buffer.byteLength(content, "utf8"),
			input: { ...BASE_INPUT, content },
			signal: new AbortController().signal,
			userId: "timeout-user",
		});

		await expect(timedOut).rejects.toBeInstanceOf(
			UsageExtractionQueueTimeoutError,
		);
		expect(timeoutQueue.getMetrics()).toMatchObject({
			activeJobs: 0,
			queueDepth: 0,
			queuedBytes: 0,
			timeoutCount: 1,
		});
		timeoutQueue.close();

		const abortQueue = createQueue();
		const controller = new AbortController();
		controller.abort();
		await expect(
			abortQueue.extract({
				bytes: 0,
				input: { ...BASE_INPUT, content: "" },
				signal: controller.signal,
				userId: "aborted-user",
			}),
		).rejects.toBeInstanceOf(UsageExtractionQueueAbortedError);
		expect(abortQueue.getMetrics().cancellationCount).toBe(1);
		abortQueue.close();
	});

	test("enforces per-user admission while preserving capacity for another user", async () => {
		const queue = createQueue(10_000, {
			perUserMaxBytes: 5,
			perUserMaxJobs: 1,
		});
		const firstController = new AbortController();
		const otherController = new AbortController();
		const first = queue.extract({
			bytes: 5,
			input: { ...BASE_INPUT, content: "first" },
			signal: firstController.signal,
			userId: "tenant-a",
		});
		const rejected = queue.extract({
			bytes: 1,
			input: { ...BASE_INPUT, content: "second" },
			signal: new AbortController().signal,
			userId: "tenant-a",
		});
		const other = queue.extract({
			bytes: 1,
			input: { ...BASE_INPUT, content: "other" },
			signal: otherController.signal,
			userId: "tenant-b",
		});

		firstController.abort();
		otherController.abort();
		await expect(rejected).rejects.toMatchObject({ limit: "per-user-jobs" });
		await expect(first).rejects.toBeInstanceOf(
			UsageExtractionQueueAbortedError,
		);
		await expect(other).rejects.toBeInstanceOf(
			UsageExtractionQueueAbortedError,
		);
		queue.close();

		const byteQueue = createQueue(10_000, {
			perUserMaxBytes: 5,
			perUserMaxJobs: 3,
		});
		const byteController = new AbortController();
		const acceptedBytes = byteQueue.extract({
			bytes: 5,
			input: { ...BASE_INPUT, content: "first" },
			signal: byteController.signal,
			userId: "tenant-bytes",
		});
		const rejectedBytes = byteQueue.extract({
			bytes: 1,
			input: { ...BASE_INPUT, content: "second" },
			signal: new AbortController().signal,
			userId: "tenant-bytes",
		});

		byteController.abort();
		await expect(rejectedBytes).rejects.toMatchObject({
			limit: "per-user-bytes",
		});
		await expect(acceptedBytes).rejects.toBeInstanceOf(
			UsageExtractionQueueAbortedError,
		);
		byteQueue.close();
	});

	test("dispatches accepted work round-robin across users", async () => {
		const queue = createQueue();
		const slowContent = `${JSON.stringify({ type: "user" })}\n`.repeat(100_000);
		const completionOrder: string[] = [];
		const extract = (label: string, userId: string, content: string) =>
			queue
				.extract({
					bytes: Buffer.byteLength(content, "utf8"),
					input: { ...BASE_INPUT, content },
					signal: new AbortController().signal,
					userId,
				})
				.then(() => {
					completionOrder.push(label);
				});
		const jobs = [
			extract("a1", "tenant-a", slowContent),
			extract("a2", "tenant-a", ""),
			extract("a3", "tenant-a", ""),
			extract("b1", "tenant-b", ""),
		];

		await Promise.all(jobs);
		expect(completionOrder).toEqual(["a1", "b1", "a2", "a3"]);
		queue.close();
	}, 20_000);

	test("an execution error always carries an incomplete retry receipt", () => {
		const cause = new Error("parser exploded");
		const error = new UsageExtractionExecutionError(cause);

		expect(error.cause).toBe(cause);
		expect(error.extraction).toMatchObject({
			status: "incomplete",
			events: [],
			receipt: { complete: false, eventCount: 0 },
		});
		expect(error.shouldPersistReceipt).toBe(true);
	});

	test("never-started outcomes stay distinct and never claim an incomplete receipt", () => {
		const outcomes = [
			new UsageExtractionQueueFullError("per-user-jobs"),
			new UsageExtractionQueueAbortedError(),
			new UsageExtractionQueueClosedError(),
		];

		expect(outcomes.map((error) => error.name)).toEqual([
			"UsageExtractionQueueFullError",
			"UsageExtractionQueueAbortedError",
			"UsageExtractionQueueClosedError",
		]);
		expect(outcomes.every((error) => !error.shouldPersistReceipt)).toBe(true);
		expect(outcomes.every((error) => error.retryAfterMs === 1_000)).toBe(true);
	});
});

function createQueue(
	timeoutMs = 10_000,
	overrides: Partial<{
		perUserMaxBytes: number;
		perUserMaxJobs: number;
	}> = {},
): UsageExtractionQueue {
	return new UsageExtractionQueue({
		globalMaxBytes: 128 * 1024 * 1024,
		globalMaxJobs: 4,
		perUserMaxBytes: overrides.perUserMaxBytes ?? 128 * 1024 * 1024,
		perUserMaxJobs: overrides.perUserMaxJobs ?? 4,
		timeoutMs,
	});
}
