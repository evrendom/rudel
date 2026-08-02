import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MissingTranscriptTimestampError } from "@rudel/agent-adapters";
import { type BatchUploadItem, batchUpload } from "../lib/batch-upload.js";
import {
	loadFailedUploads,
	recordFailedUpload,
} from "../lib/failed-uploads.js";

describe("batchUpload", () => {
	let configDir: string;
	let originalConfigDir: string | undefined;

	beforeAll(async () => {
		originalConfigDir = process.env.RUDEL_CONFIG_DIR;
		configDir = await mkdtemp(join(tmpdir(), "rudel-batch-upload-test-"));
		process.env.RUDEL_CONFIG_DIR = configDir;
	});

	afterAll(async () => {
		if (originalConfigDir === undefined) {
			delete process.env.RUDEL_CONFIG_DIR;
		} else {
			process.env.RUDEL_CONFIG_DIR = originalConfigDir;
		}
		await rm(configDir, { recursive: true, force: true });
	});

	test("skips timestamp-less sessions without poisoning the retry queue", async () => {
		const items: BatchUploadItem[] = [
			{
				sessionId: "client-validation",
				label: "client-validation",
				transcriptPath: "/sessions/client-validation.jsonl",
				projectPath: "/project",
				source: "claude_code",
			},
			{
				sessionId: "server-validation",
				label: "server-validation",
				transcriptPath: "/sessions/server-validation.jsonl",
				projectPath: "/project",
				source: "codex",
			},
		];

		for (const item of items) {
			await recordFailedUpload({
				sessionId: item.sessionId,
				transcriptPath: item.transcriptPath,
				projectPath: item.projectPath,
				source: item.source,
				organizationId: item.organizationId,
				error: "stale retry entry",
			});
		}

		const summary = await batchUpload({
			items,
			upload: async (item) => {
				if (item.sessionId === "client-validation") {
					throw new MissingTranscriptTimestampError("claude_code");
				}
				return {
					success: false,
					error: "Codex transcript contains no valid timestamp",
					retryable: false,
				};
			},
		});

		expect(summary).toMatchObject({
			succeeded: 0,
			failed: 0,
			skipped: 2,
			total: 2,
			errors: [],
			skippedItems: [
				{
					label: "client-validation",
					reason: "Claude Code transcript contains no valid timestamp",
				},
				{
					label: "server-validation",
					reason: "Codex transcript contains no valid timestamp",
				},
			],
		});
		expect(await loadFailedUploads()).toEqual([]);
	});

	test("normalizes legacy failures as retryable and persists dispositions", async () => {
		await writeFile(
			join(configDir, "failed-uploads.json"),
			JSON.stringify({
				failures: [
					{
						error: "legacy transport failure",
						failedAt: "2026-07-31T10:00:00.000Z",
						projectPath: "/project",
						sessionId: "legacy",
						transcriptPath: "/sessions/legacy.jsonl",
					},
				],
			}),
		);

		expect((await loadFailedUploads())[0]?.status).toBe("retryable");
		await recordFailedUpload({
			error: "invalid transcript",
			projectPath: "/project",
			sessionId: "permanent",
			status: "permanent",
			transcriptPath: "/sessions/permanent.jsonl",
		});
		expect(
			(await loadFailedUploads()).find(
				(failure) => failure.sessionId === "permanent",
			)?.status,
		).toBe("permanent");
	});
});
