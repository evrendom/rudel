import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	setDefaultTimeout,
	test,
} from "bun:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { claudeCodeAdapter, type SessionFile } from "@rudel/agent-adapters";
import {
	INGEST_LIMIT_REASONS,
	type IngestSessionInput,
} from "@rudel/api-routes";
import {
	FILTER_VERSION,
	filterSessionTextFields,
	getRedactionBudgetAnomaly,
	mergeRedactionCounts,
} from "@rudel/secret-filter";
import {
	getClickhouse,
	getSafeClickHouseTable,
} from "../../../api/src/clickhouse.js";
import { sqlClient } from "../../../api/src/db.js";
import { computeIngestContentHash } from "../../../api/src/lib/ingest-content-hash.js";
import { createApiClient } from "../lib/api-client.js";
import { type BatchUploadItem, batchUpload } from "../lib/batch-upload.js";
import { getGitInfo } from "../lib/git-info.js";
import { uploadSession } from "../lib/uploader.js";
import {
	signUpTestUser,
	startTestServer,
	type TestServer,
} from "./helpers/bun-server.js";
import {
	type BoundaryRelay,
	buildCliArtifact,
	containsAnyCanary,
	createClaudeFixtureSecrets,
	createCodexFixtureSecrets,
	hashText,
	readRedactionTemplates,
	renderFixture,
	runBuiltCli,
	startBoundaryRelay,
	stopAllBoundaryRelays,
	writeCliCredentials,
} from "./helpers/cli-e2e.js";
import { createStoredSessionReaders } from "./helpers/stored-sessions.js";

setDefaultTimeout(90_000);

const {
	getPhysicalSessionCount,
	getStoredContentHash,
	getStoredFilteredSession,
	getStoredCodexSession,
} = createStoredSessionReaders({
	getClickhouse,
	getSafeTable: getSafeClickHouseTable,
	sql: sqlClient,
});

const CLAUDE_SECRETS = createClaudeFixtureSecrets();
const CODEX_SECRETS = createCodexFixtureSecrets();
const ALL_SECRETS = [...CLAUDE_SECRETS, ...CODEX_SECRETS];
const OPENAI_CANARY = CLAUDE_SECRETS[0]?.value ?? "";

let server: TestServer;
let requestLimitedServer: TestServer;
let byteLimitedServer: TestServer;
let sharedRelay: BoundaryRelay;
let bearerToken: string;
let userId: string;
let tempDir: string;
let batchHome: string;
let batchConfigDir: string;
let claudeSessionTemplate: string;
let claudeSubagentTemplate: string;
let codexSessionTemplate: string;
let originalConfigDirEnv: string | undefined;

/** State shared between tests 1–3 (the batch, its wire count, and its queue). */
let batchState:
	| {
			overBudgetSessionId: string;
			overBudgetPath: string;
			missingSessionId: string;
			missingFailedAtBefore: string;
			fixedContent: string;
	  }
	| undefined;

interface QueueEntry {
	sessionId: string;
	transcriptPath: string;
	projectPath: string;
	error: string;
	failedAt: string;
}

type PressureBatchItem = BatchUploadItem & {
	readonly session: SessionFile;
	readonly adapter: typeof claudeCodeAdapter;
};

beforeAll(async () => {
	originalConfigDirEnv = process.env.RUDEL_CONFIG_DIR;
	tempDir = await mkdtemp(join(tmpdir(), "rudel-release-pressure-"));
	batchHome = join(tempDir, "batch-home");
	batchConfigDir = join(batchHome, ".rudel");
	await mkdir(batchConfigDir, { recursive: true });
	// failed-uploads.ts resolves its path per call from RUDEL_CONFIG_DIR, so
	// in-process batchUpload queue writes land in this suite's temp dir instead
	// of the developer's real ~/.rudel. Restored verbatim in afterAll.
	process.env.RUDEL_CONFIG_DIR = batchConfigDir;

	server = await startTestServer();
	bearerToken = await signUpTestUser(server.baseUrl);
	const currentUser = await createApiClient({
		apiBaseUrl: server.baseUrl,
		token: bearerToken,
	}).me();
	userId = currentUser.id;

	requestLimitedServer = await startTestServer({
		RATE_LIMIT_INGEST_REQUESTS_MAX: "2",
	});
	byteLimitedServer = await startTestServer({
		RATE_LIMIT_INGEST_BYTES_MAX: "2000",
	});

	await buildCliArtifact();
	const templates = await readRedactionTemplates();
	claudeSessionTemplate = templates.claudeSession;
	claudeSubagentTemplate = templates.claudeSubagent;
	codexSessionTemplate = templates.codexSession;

	// ONE shared relay fronts the default server for all new-CLI traffic in
	// this file. Test 13 asserts zero canary crossings for its whole lifetime.
	sharedRelay = startBoundaryRelay(
		() => server.baseUrl,
		() => server.ensureAlive(),
		ALL_SECRETS,
	);
	await writeCliCredentials(batchConfigDir, bearerToken, sharedRelay.baseUrl);

	// Warm the ingest pipeline (first ClickHouse insert after boot can be slow;
	// Bun may also kill the server as a "dangling process" before the first
	// test) so test 1's exact wire-count arithmetic is not polluted by retries.
	let warmed = false;
	for (let attempt = 0; attempt < 3 && !warmed; attempt++) {
		const warmup = await Promise.race([
			uploadSession(
				{
					source: "claude_code",
					sessionId: `rp_warmup_${crypto.randomUUID()}`,
					projectPath: "/test/release-pressure-warmup",
					content: JSON.stringify({
						message: { content: "warmup", role: "user" },
						timestamp: "2026-07-24T12:00:00.000Z",
						type: "user",
					}),
					upload_mode: "manual",
				},
				{
					endpoint: server.rpcUrl,
					token: bearerToken,
					allowInsecureEndpoint: false,
				},
			),
			Bun.sleep(25_000).then(() => ({ success: false }) as const),
		]);
		warmed = warmup.success;
		if (!warmed) {
			await server.ensureAlive();
			await Bun.sleep(500);
		}
	}
	if (!warmed) {
		throw new Error("Warmup upload against the default server never succeeded");
	}
});

afterAll(async () => {
	if (originalConfigDirEnv === undefined) {
		delete process.env.RUDEL_CONFIG_DIR;
	} else {
		process.env.RUDEL_CONFIG_DIR = originalConfigDirEnv;
	}
	await Promise.all([
		server?.stop(),
		requestLimitedServer?.stop(),
		byteLimitedServer?.stop(),
		stopAllBoundaryRelays(),
	]);
	if (tempDir) {
		await rm(tempDir, { recursive: true, force: true }).catch(() => {});
	}
});

describe("release pressure: E2E integration", () => {
	beforeEach(async () => {
		await Promise.all([
			server.ensureAlive(),
			requestLimitedServer.ensureAlive(),
			byteLimitedServer.ensureAlive(),
		]);
	});

	// ── Test 1 ── mixed batch: 2 clean + 2 dirty + 1 over-budget + 1 missing.
	test("mixed batch reports exact counts, merged redactions, and a canary-free queue", async () => {
		const projectDir = join(tempDir, "batch-project");
		await mkdir(projectDir, { recursive: true });
		const gitInfo = await getGitInfo(projectDir);

		const clean1Id = `rp_batch_clean1_${crypto.randomUUID()}`;
		const clean2Id = `rp_batch_clean2_${crypto.randomUUID()}`;
		const dirty1Id = `rp_batch_dirty1_${crypto.randomUUID()}`;
		const dirty2Id = `rp_batch_dirty2_${crypto.randomUUID()}`;
		const overBudgetId = `rp_batch_budget_${crypto.randomUUID()}`;
		const missingId = `rp_batch_missing_${crypto.randomUUID()}`;

		const cleanContent = (sessionId: string) =>
			[
				JSON.stringify({ type: "summary", summary: "clean batch item" }),
				JSON.stringify({
					message: { content: `clean content for ${sessionId}`, role: "user" },
					timestamp: "2026-07-24T20:00:00.000Z",
					type: "user",
				}),
			].join("\n");
		const rawDirty1 = renderFixture(
			claudeSessionTemplate,
			dirty1Id,
			CLAUDE_SECRETS,
			false,
		);
		const rawDirty2 = renderFixture(
			claudeSessionTemplate,
			dirty2Id,
			CLAUDE_SECRETS,
			false,
		);
		const rawSubagent1 = renderFixture(
			claudeSubagentTemplate,
			dirty1Id,
			CLAUDE_SECRETS,
			false,
		);
		const overBudgetContent = JSON.stringify({
			message: { content: OPENAI_CANARY, role: "user" },
			timestamp: "2026-07-24T16:30:00.000Z",
			type: "user",
		});

		const subagentDir = join(projectDir, dirty1Id, "subagents");
		await mkdir(subagentDir, { recursive: true });
		const overBudgetPath = join(projectDir, `${overBudgetId}.jsonl`);
		await Promise.all([
			writeFile(join(projectDir, `${clean1Id}.jsonl`), cleanContent(clean1Id)),
			writeFile(join(projectDir, `${clean2Id}.jsonl`), cleanContent(clean2Id)),
			writeFile(join(projectDir, `${dirty1Id}.jsonl`), rawDirty1),
			writeFile(join(projectDir, `${dirty2Id}.jsonl`), rawDirty2),
			writeFile(
				join(subagentDir, "agent-nested-agent-001.jsonl"),
				rawSubagent1,
			),
			writeFile(overBudgetPath, overBudgetContent),
		]);

		// dirty1 uploads content + its subagent file; dirty2 has no subagent file
		// on disk, so the adapter uploads content only.
		const expectedDirty1 = filterSessionTextFields({
			content: rawDirty1,
			subagents: [{ agentId: "nested-agent-001", content: rawSubagent1 }],
		});
		const expectedDirty2 = filterSessionTextFields({
			content: rawDirty2,
			subagents: undefined,
		});
		const expectedRedacted = mergeRedactionCounts(
			expectedDirty1.counts,
			expectedDirty2.counts,
		);
		const expectedRedactedBytes =
			expectedDirty1.redactedBytes + expectedDirty2.redactedBytes;

		const items: PressureBatchItem[] = [
			clean1Id,
			clean2Id,
			dirty1Id,
			dirty2Id,
			overBudgetId,
			missingId,
		].map((sessionId) => ({
			sessionId,
			label: sessionId,
			transcriptPath: join(projectDir, `${sessionId}.jsonl`),
			projectPath: projectDir,
			source: "claude_code" as const,
			session: {
				sessionId,
				transcriptPath: join(projectDir, `${sessionId}.jsonl`),
				projectPath: projectDir,
			},
			adapter: claudeCodeAdapter,
		}));

		const requestCountBefore = sharedRelay.getObservation().requestCount;
		const summary = await batchUpload({
			items,
			upload: async (item, onRetry) => {
				// Mirrors runInteractiveUpload's callback: build the request from
				// the real transcript on disk, then upload. The missing-transcript
				// item throws inside buildUploadRequest and is counted as failed.
				const request = await item.adapter.buildUploadRequest(item.session, {
					gitInfo,
					organizationId: undefined,
					uploadMode: "manual",
				});
				return uploadSession(request, {
					endpoint: sharedRelay.rpcUrl,
					token: bearerToken,
					allowInsecureEndpoint: false,
					onRetry,
				});
			},
		});

		expect(summary.succeeded).toBe(4);
		expect(summary.failed).toBe(2);
		expect(summary.total).toBe(6);
		expect(summary.redacted).toEqual(expectedRedacted);
		expect(summary.redactedBytes).toBe(expectedRedactedBytes);

		// Only the 4 transportable items reached the wire: the over-budget item
		// aborted client-side and the missing item threw before upload.
		expect(sharedRelay.getObservation().requestCount - requestCountBefore).toBe(
			4,
		);

		expect(summary.errors).toHaveLength(2);
		const errorLabels = summary.errors.map((entry) => entry.label).sort();
		expect(errorLabels).toEqual([missingId, overBudgetId].sort());
		for (const entry of summary.errors) {
			expect(containsAnyCanary(entry.error, ALL_SECRETS)).toBe(false);
		}
		const overBudgetError = summary.errors.find(
			(entry) => entry.label === overBudgetId,
		);
		assert(overBudgetError);
		expect(overBudgetError.error).toContain(
			"Redaction safety check stopped upload",
		);

		const queueRaw = await readFile(
			join(batchConfigDir, "failed-uploads.json"),
			"utf8",
		);
		expect(containsAnyCanary(queueRaw, ALL_SECRETS)).toBe(false);
		const queue = (JSON.parse(queueRaw) as { failures: QueueEntry[] }).failures;
		expect(queue).toHaveLength(2);
		expect(queue.map((entry) => entry.sessionId).sort()).toEqual(
			[missingId, overBudgetId].sort(),
		);

		const missingEntry = queue.find((entry) => entry.sessionId === missingId);
		assert(missingEntry);
		batchState = {
			overBudgetSessionId: overBudgetId,
			overBudgetPath,
			missingSessionId: missingId,
			missingFailedAtBefore: missingEntry.failedAt,
			fixedContent: JSON.stringify({
				message: {
					content: "Credentials rotated; transcript rewritten clean.",
					role: "user",
				},
				timestamp: "2026-07-24T16:30:00.000Z",
				type: "user",
			}),
		};
	}, 120_000);

	// ── Test 2 ── the budget abort happens before transport.
	test("over-budget upload aborts client-side and never reaches the wire", async () => {
		const requestCountBefore = sharedRelay.getObservation().requestCount;
		const result = await uploadSession(
			{
				source: "claude_code",
				sessionId: `rp_budget_wire_${crypto.randomUUID()}`,
				projectPath: "/test/release-pressure-budget",
				content: JSON.stringify({
					message: { content: OPENAI_CANARY, role: "user" },
					timestamp: "2026-07-24T16:35:00.000Z",
					type: "user",
				}),
				upload_mode: "manual",
			},
			{
				endpoint: sharedRelay.rpcUrl,
				token: bearerToken,
				allowInsecureEndpoint: false,
			},
		);

		expect(result).toMatchObject({
			success: false,
			attempts: 0,
			redactionBudgetExceeded: true,
		});
		expect(result.error).toContain("Redaction safety check stopped upload");
		expect(containsAnyCanary(result.error ?? "", ALL_SECRETS)).toBe(false);
		expect(sharedRelay.getObservation().requestCount).toBe(requestCountBefore);
	});

	// ── Test 3 ── `upload --retry --yes` drains the fixed item, re-queues the rest.
	test("upload --retry --yes drains the fixed queue item and refreshes the unfixed one", async () => {
		assert(batchState, "test 1 must have populated the failed-upload queue");
		await writeFile(batchState.overBudgetPath, batchState.fixedContent);

		const result = await runBuiltCli(
			["upload", "--retry", "--yes", "--endpoint", sharedRelay.rpcUrl],
			{ configDir: batchConfigDir, home: batchHome },
		);

		// The missing-transcript item still fails, so the command exits 1 while
		// the fixed item drains.
		expect(result.exitCode).toBe(1);
		expect(containsAnyCanary(result.stdout, ALL_SECRETS)).toBe(false);
		expect(containsAnyCanary(result.stderr, ALL_SECRETS)).toBe(false);

		const queueRaw = await readFile(
			join(batchConfigDir, "failed-uploads.json"),
			"utf8",
		);
		const queue = (JSON.parse(queueRaw) as { failures: QueueEntry[] }).failures;
		expect(queue).toHaveLength(1);
		const remaining = queue[0];
		assert(remaining);
		expect(remaining.sessionId).toBe(batchState.missingSessionId);
		expect(Date.parse(remaining.failedAt)).toBeGreaterThan(
			Date.parse(batchState.missingFailedAtBefore),
		);

		const storedRow = await getStoredFilteredSession(
			userId,
			batchState.overBudgetSessionId,
		);
		assert(storedRow);
		expect(storedRow.filter_version).toBe(FILTER_VERSION);
		expect(hashText(storedRow.content)).toBe(hashText(batchState.fixedContent));
	}, 120_000);

	// ── Test 4 ── rate-limited batch: 2 succeed, 1 real 429, 1 skipped, 3 wire requests.
	test("batch against the request-limited server stops at the 429 and queues the rest", async () => {
		const rateLimitConfigDir = join(tempDir, "rate-limit-config");
		await mkdir(rateLimitConfigDir, { recursive: true });
		process.env.RUDEL_CONFIG_DIR = rateLimitConfigDir;

		const limitedToken = await signUpTestUser(requestLimitedServer.baseUrl);
		const limitedRelay = startBoundaryRelay(
			() => requestLimitedServer.baseUrl,
			() => requestLimitedServer.ensureAlive(),
			ALL_SECRETS,
		);

		const projectDir = join(tempDir, "rate-limit-project");
		await mkdir(projectDir, { recursive: true });
		const gitInfo = await getGitInfo(projectDir);
		const sessionIds = [0, 1, 2, 3].map(
			(index) => `rp_ratelimit_${index}_${crypto.randomUUID()}`,
		);
		await Promise.all(
			sessionIds.map((sessionId) =>
				writeFile(
					join(projectDir, `${sessionId}.jsonl`),
					JSON.stringify({
						message: { content: `rate-limit item ${sessionId}`, role: "user" },
						timestamp: "2026-07-24T22:00:00.000Z",
						type: "user",
					}),
				),
			),
		);

		const items: PressureBatchItem[] = sessionIds.map((sessionId) => ({
			sessionId,
			label: sessionId,
			transcriptPath: join(projectDir, `${sessionId}.jsonl`),
			projectPath: projectDir,
			source: "claude_code" as const,
			session: {
				sessionId,
				transcriptPath: join(projectDir, `${sessionId}.jsonl`),
				projectPath: projectDir,
			},
			adapter: claudeCodeAdapter,
		}));

		// concurrency 1: the default of 5 would fire all four requests before the
		// 429 lands, defeating the stop-and-queue behavior under test.
		const summary = await batchUpload({
			items,
			concurrency: 1,
			upload: async (item, onRetry) => {
				const request = await item.adapter.buildUploadRequest(item.session, {
					gitInfo,
					organizationId: undefined,
					uploadMode: "manual",
				});
				return uploadSession(request, {
					endpoint: limitedRelay.rpcUrl,
					token: limitedToken,
					allowInsecureEndpoint: false,
					onRetry,
				});
			},
		});

		expect(summary.succeeded).toBe(2);
		expect(summary.failed).toBe(2);
		expect(summary.total).toBe(4);
		// Exactly 3 requests crossed the wire: two successes plus the real 429.
		// The fourth item was skipped without transport.
		expect(limitedRelay.getObservation().requestCount).toBe(3);

		expect(summary.errors).toHaveLength(2);
		expect(summary.errors[0]).toEqual({
			label: sessionIds[2] as string,
			error:
				"Ingest request limit reached (2 requests per 60 min). Wait and retry with: rudel upload --retry",
		});
		expect(summary.errors[1]).toEqual({
			label: "Rate limit",
			error:
				"1 session(s) skipped. Run `rudel upload --retry` later to upload them.",
		});

		const queueRaw = await readFile(
			join(rateLimitConfigDir, "failed-uploads.json"),
			"utf8",
		);
		const queue = (JSON.parse(queueRaw) as { failures: QueueEntry[] }).failures;
		expect(queue.map((entry) => entry.sessionId).sort()).toEqual(
			[sessionIds[2], sessionIds[3]].sort(),
		);
		const skippedEntry = queue.find(
			(entry) => entry.sessionId === sessionIds[3],
		);
		assert(skippedEntry);
		expect(skippedEntry.error).toBe(
			"Skipped — rate limit reached. Run `rudel upload --retry` to upload remaining sessions.",
		);
		process.env.RUDEL_CONFIG_DIR = batchConfigDir;
	}, 120_000);

	// ── Test 5 ── server precedence: the per-user request limiter beats the budget 422.
	//
	// PLAN-VS-CODE FINDING: the plan's claim "rate limit beats budget 422" is
	// correct for the limiter its own beforeAll configures. The env-driven
	// request and byte limiters both run before the redaction-budget throw. The
	// manual per-session limiter runs after that throw and would lose to the
	// 422, but it is not the limiter these servers configure.
	test("request rate limit (429) wins over the redaction-budget 422 on the server", async () => {
		const token = await signUpTestUser(requestLimitedServer.baseUrl);
		const client = createApiClient({
			apiBaseUrl: requestLimitedServer.baseUrl,
			token,
		});
		const limitedUser = await client.me();

		const first = await client.ingestSession(
			cleanRawInput(`rp_reqlimit_a_${crypto.randomUUID()}`),
		);
		const second = await client.ingestSession(
			cleanRawInput(`rp_reqlimit_b_${crypto.randomUUID()}`),
		);
		expect(first.success).toBe(true);
		expect(second.success).toBe(true);

		// Old-client path: raw over-budget payload straight to the API.
		const overBudgetSessionId = `rp_reqlimit_budget_${crypto.randomUUID()}`;
		const overBudgetContent = JSON.stringify({
			message: { content: OPENAI_CANARY, role: "user" },
			timestamp: "2026-07-24T16:40:00.000Z",
			type: "user",
		});
		expectOverBudget(overBudgetContent);

		await expect(
			client.ingestSession({
				content: overBudgetContent,
				projectPath: "/test/rp-request-limit",
				sessionId: overBudgetSessionId,
				source: "claude_code",
				upload_mode: "manual",
			}),
		).rejects.toMatchObject({
			code: "TOO_MANY_REQUESTS",
			data: { limit: 2, reason: INGEST_LIMIT_REASONS.requestLimit },
		});
		expect(
			await getStoredFilteredSession(limitedUser.id, overBudgetSessionId),
		).toBeNull();
	});

	// ── Test 6 ── server precedence: the per-user byte limiter also beats the budget 422.
	test("byte rate limit (429) wins over the redaction-budget 422 on the server", async () => {
		const token = await signUpTestUser(byteLimitedServer.baseUrl);
		const client = createApiClient({
			apiBaseUrl: byteLimitedServer.baseUrl,
			token,
		});
		const limitedUser = await client.me();

		const filler = "byte window filler segment. ".repeat(62);
		const cleanContent = JSON.stringify({
			message: { content: filler, role: "user" },
			timestamp: "2026-07-24T21:00:00.000Z",
			type: "user",
		});
		const overBudgetContent = JSON.stringify({
			message: {
				content: `${OPENAI_CANARY} ${OPENAI_CANARY} ${OPENAI_CANARY}`,
				role: "user",
			},
			timestamp: "2026-07-24T21:00:05.000Z",
			type: "user",
		});
		expectOverBudget(overBudgetContent);
		const cleanBytes = Buffer.byteLength(cleanContent, "utf8");
		const overBudgetBytes = Buffer.byteLength(overBudgetContent, "utf8");
		// Calibration guards: the clean upload must fit the 2000-byte window on
		// its own, and the follow-up must overflow it.
		expect(cleanBytes).toBeLessThanOrEqual(2000);
		expect(cleanBytes + overBudgetBytes).toBeGreaterThan(2000);

		const first = await client.ingestSession({
			content: cleanContent,
			projectPath: "/test/rp-byte-limit",
			sessionId: `rp_bytelimit_clean_${crypto.randomUUID()}`,
			source: "claude_code",
			upload_mode: "manual",
		});
		expect(first.success).toBe(true);

		const overBudgetSessionId = `rp_bytelimit_budget_${crypto.randomUUID()}`;
		await expect(
			client.ingestSession({
				content: overBudgetContent,
				projectPath: "/test/rp-byte-limit",
				sessionId: overBudgetSessionId,
				source: "claude_code",
				upload_mode: "manual",
			}),
		).rejects.toMatchObject({
			code: "TOO_MANY_REQUESTS",
			data: { limit: 2000, reason: INGEST_LIMIT_REASONS.byteLimit },
		});
		expect(
			await getStoredFilteredSession(limitedUser.id, overBudgetSessionId),
		).toBeNull();
	});

	// ── Test 7 ── client precedence: budget abort runs before the aggregate-size abort.
	test("client budget abort wins over the aggregate-size abort", async () => {
		const requestCountBefore = sharedRelay.getObservation().requestCount;
		const result = await uploadSession(
			{
				source: "claude_code",
				sessionId: `rp_client_precedence_${crypto.randomUUID()}`,
				projectPath: "/test/rp-client-precedence",
				content: JSON.stringify({
					message: { content: OPENAI_CANARY, role: "user" },
					timestamp: "2026-07-24T16:45:00.000Z",
					type: "user",
				}),
				upload_mode: "manual",
			},
			{
				endpoint: sharedRelay.rpcUrl,
				token: bearerToken,
				allowInsecureEndpoint: false,
				// Far below the payload size: if the aggregate-size check ran first,
				// the error would be the per-session-limit message instead.
				maxAggregateBytes: 16,
			},
		);

		expect(result).toMatchObject({
			success: false,
			attempts: 0,
			redactionBudgetExceeded: true,
		});
		expect(result.error).toContain("Redaction safety check stopped upload");
		expect(result.error).not.toContain("per-session limit");
		expect(sharedRelay.getObservation().requestCount).toBe(requestCountBefore);
	});

	// ── Tests 8 + 9 ── hook chaos for both agents: dead endpoint queues at exit 0,
	// live endpoint drains the queue and stores a filtered row.
	const HOOK_CASES = [
		{ name: "claude SessionEnd", source: "claude_code" as const },
		{ name: "codex turn-complete", source: "codex" as const },
	];
	for (const hookCase of HOOK_CASES) {
		test(`hook chaos (${hookCase.name}): server down queues at exit 0, recovery drains`, async () => {
			const isClaude = hookCase.source === "claude_code";
			const secrets = isClaude ? CLAUDE_SECRETS : CODEX_SECRETS;
			const sessionId = `rp_hook_${hookCase.source}_${crypto.randomUUID()}`;
			const home = join(tempDir, sessionId);
			const configDir = join(home, ".rudel");
			const projectDir = join(home, "hook-project");
			const sessionFile = join(projectDir, `${sessionId}.jsonl`);
			const template = isClaude ? claudeSessionTemplate : codexSessionTemplate;
			const rawContent = renderFixture(template, sessionId, secrets, false);
			const expectedContent = renderFixture(template, sessionId, secrets, true);

			await Promise.all([
				mkdir(configDir, { recursive: true }),
				mkdir(projectDir, { recursive: true }),
			]);
			await Promise.all([
				writeCliCredentials(configDir, bearerToken, sharedRelay.baseUrl),
				writeFile(sessionFile, rawContent),
			]);
			let expectedSubagent: string | undefined;
			if (isClaude) {
				const subagentDir = join(projectDir, sessionId, "subagents");
				await mkdir(subagentDir, { recursive: true });
				expectedSubagent = renderFixture(
					claudeSubagentTemplate,
					sessionId,
					secrets,
					true,
				);
				await writeFile(
					join(subagentDir, "agent-nested-agent-001.jsonl"),
					renderFixture(claudeSubagentTemplate, sessionId, secrets, false),
				);
			}

			const stdin = isClaude
				? JSON.stringify({
						session_id: sessionId,
						transcript_path: sessionFile,
						cwd: projectDir,
					})
				: JSON.stringify({
						type: "agent-turn-complete",
						thread_id: sessionId,
						turn_id: "99999999-9999-4999-8999-999999999999",
						cwd: projectDir,
						transcript_path: sessionFile,
					});
			const hookArgs = isClaude
				? ["hooks", "claude", "session-end"]
				: ["hooks", "codex", "turn-complete"];

			// Phase 1: dead loopback endpoint. Hooks must exit 0 on transport
			// failures (they only exit 1 on endpointRejected) and queue the session.
			const deadBaseUrl = await acquireDeadEndpoint();
			const downResult = await runBuiltCli(hookArgs, {
				configDir,
				env: {
					RUDEL_API_BASE: deadBaseUrl,
					RUDEL_ALLOW_INSECURE_ENDPOINT: "",
				},
				home,
				stdin,
			});

			const queuePath = join(configDir, "failed-uploads.json");
			const logPath = join(configDir, "logs", "hook-upload.log");
			const [queuedRaw, downLog] = await Promise.all([
				readFile(queuePath, "utf8"),
				readFile(logPath, "utf8"),
			]);
			expect(downResult.exitCode).toBe(0);
			expect(queuedRaw).toContain(sessionId);
			expect(downLog).toContain("Upload failed for session");
			expect(containsAnyCanary(downLog, secrets)).toBe(false);
			expect(containsAnyCanary(queuedRaw, secrets)).toBe(false);
			expect(containsAnyCanary(downResult.stdout, secrets)).toBe(false);
			expect(containsAnyCanary(downResult.stderr, secrets)).toBe(false);

			// Phase 2: the real server is back — the same hook drains the queue.
			// The drain is idempotent (server-side content-hash dedupe), and one
			// run can overrun the subprocess timeout when the shared cluster is
			// contended, so give it the retry allowance api-upload gives
			// dangling servers.
			let upResult = await runBuiltCli(hookArgs, {
				configDir,
				env: {
					RUDEL_API_BASE: sharedRelay.baseUrl,
					RUDEL_ALLOW_INSECURE_ENDPOINT: "",
				},
				home,
				stdin,
			});
			for (let retry = 0; retry < 2 && upResult.exitCode !== 0; retry += 1) {
				await server.ensureAlive();
				upResult = await runBuiltCli(hookArgs, {
					configDir,
					env: {
						RUDEL_API_BASE: sharedRelay.baseUrl,
						RUDEL_ALLOW_INSECURE_ENDPOINT: "",
					},
					home,
					stdin,
				});
			}

			const [drainedRaw, upLog] = await Promise.all([
				readFile(queuePath, "utf8"),
				readFile(logPath, "utf8"),
			]);
			expect(upResult.exitCode).toBe(0);
			const drainedQueue = (
				JSON.parse(drainedRaw) as { failures: QueueEntry[] }
			).failures;
			expect(drainedQueue.some((entry) => entry.sessionId === sessionId)).toBe(
				false,
			);
			expect(upLog).toContain(
				"values matching known secret patterns were redacted",
			);
			expect(containsAnyCanary(upLog, secrets)).toBe(false);

			if (isClaude) {
				const storedRow = await getStoredFilteredSession(userId, sessionId);
				assert(storedRow);
				expect(storedRow.filter_version).toBe(FILTER_VERSION);
				expect(hashText(storedRow.content)).toBe(hashText(expectedContent));
				const storedSubagent = storedRow.subagents["nested-agent-001"];
				assert(storedSubagent);
				assert(expectedSubagent);
				expect(hashText(storedSubagent)).toBe(hashText(expectedSubagent));
			} else {
				const storedRow = await getStoredCodexSession(userId, sessionId);
				assert(storedRow);
				expect(storedRow.filter_version).toBe(FILTER_VERSION);
				expect(hashText(storedRow.content)).toBe(hashText(expectedContent));
			}
		}, 120_000);
	}

	// ── Test 10 ── chaos relay: first attempt 502s AFTER the body is observed;
	// the retry succeeds and both attempts crossed the boundary marker-clean.
	test("502-then-success retry sends two canary-free attempts and lands the upload", async () => {
		const sessionId = `rp_chaos_502_${crypto.randomUUID()}`;
		const home = join(tempDir, sessionId);
		const configDir = join(home, ".rudel");
		const projectDir = join(home, "chaos-project");
		const sessionFile = join(projectDir, `${sessionId}.jsonl`);
		const subagentDir = join(projectDir, sessionId, "subagents");
		const rawContent = renderFixture(
			claudeSessionTemplate,
			sessionId,
			CLAUDE_SECRETS,
			false,
		);
		const expectedContent = renderFixture(
			claudeSessionTemplate,
			sessionId,
			CLAUDE_SECRETS,
			true,
		);
		const chaosRelay = startBoundaryRelay(
			() => server.baseUrl,
			() => server.ensureAlive(),
			CLAUDE_SECRETS,
			{ failFirstN: { n: 1, status: 502 } },
		);

		await Promise.all([
			mkdir(configDir, { recursive: true }),
			mkdir(subagentDir, { recursive: true }),
		]);
		await Promise.all([
			writeCliCredentials(configDir, bearerToken, chaosRelay.baseUrl),
			writeFile(sessionFile, rawContent),
			writeFile(
				join(subagentDir, "agent-nested-agent-001.jsonl"),
				renderFixture(claudeSubagentTemplate, sessionId, CLAUDE_SECRETS, false),
			),
		]);

		const result = await runBuiltCli(
			["upload", sessionFile, "--endpoint", chaosRelay.rpcUrl],
			{ configDir, home },
		);

		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("Upload successful!");
		expect(containsAnyCanary(result.stdout, CLAUDE_SECRETS)).toBe(false);
		expect(containsAnyCanary(result.stderr, CLAUDE_SECRETS)).toBe(false);

		const boundary = chaosRelay.getObservation();
		expect(boundary.requestCount).toBe(2);
		expect(boundary.leakedRuleIds).toEqual([]);
		for (const secret of CLAUDE_SECRETS) {
			expect(boundary.markerCounts[secret.ruleId]).toBe(2);
		}

		const storedRow = await getStoredFilteredSession(userId, sessionId);
		assert(storedRow);
		expect(hashText(storedRow.content)).toBe(hashText(expectedContent));
	}, 120_000);

	// ── Test 11 ── concurrent identical dirty uploads converge, and the follow-up
	// duplicate short-circuits on the recorded content hash.
	test("concurrent identical dirty uploads store only redacted bytes and dedupe the follow-up", async () => {
		const sessionId = `rp_concurrent_identical_${crypto.randomUUID()}`;
		const sessionDate = "2026-07-24 18:00:00.000";
		const request: IngestSessionInput = {
			content: JSON.stringify({
				message: { content: `Use ${OPENAI_CANARY}`, role: "user" },
				notes: "Benign transcript context. ".repeat(20),
				timestamp: "2026-07-24T18:00:00.000Z",
				type: "user",
			}),
			projectPath: "/test/rp-concurrent-identical",
			sessionId,
			source: "claude_code",
			upload_mode: "manual",
		};
		const expectedFiltered = filterSessionTextFields({
			content: request.content,
			subagents: undefined,
		});
		const uploadOnce = () =>
			uploadSession(request, {
				endpoint: sharedRelay.rpcUrl,
				token: bearerToken,
				allowInsecureEndpoint: false,
			});

		const results = await Promise.all([
			uploadOnce(),
			uploadOnce(),
			uploadOnce(),
			uploadOnce(),
		]);
		for (const result of results) {
			expect(result.success).toBe(true);
			expect(result.redacted).toEqual(expectedFiltered.counts);
			expect(result.redactedBytes).toBe(expectedFiltered.redactedBytes);
		}

		// Best-effort dedupe: 1..4 physical rows are possible, but every stored
		// row must be byte-identical to the redacted output.
		const rows = await getPhysicalRowContents(userId, sessionId);
		expect(rows.length).toBeGreaterThanOrEqual(1);
		expect(rows.length).toBeLessThanOrEqual(4);
		for (const row of rows) {
			expect(hashText(row.content)).toBe(hashText(expectedFiltered.content));
		}
		expect(await getStoredContentHash(userId, sessionId)).toBe(
			computeExpectedServerContentHash(request),
		);

		// Identical rows share one sorting key, so a background merge can shrink
		// the physical count between any two reads. The dedupe invariant is that
		// the follow-up duplicate ADDS nothing — merges only ever collapse, so
		// assert monotone non-increase rather than exact equality.
		const countBeforeDuplicate = await getPhysicalSessionCount(
			userId,
			sessionDate,
			sessionId,
		);
		expect(countBeforeDuplicate).toBeGreaterThanOrEqual(1);
		expect(countBeforeDuplicate).toBeLessThanOrEqual(rows.length);
		const duplicate = await uploadOnce();
		expect(duplicate.success).toBe(true);
		const countAfterDuplicate = await getPhysicalSessionCount(
			userId,
			sessionDate,
			sessionId,
		);
		expect(countAfterDuplicate).toBeGreaterThanOrEqual(1);
		expect(countAfterDuplicate).toBeLessThanOrEqual(countBeforeDuplicate);
	}, 120_000);

	// ── Test 12 ── concurrent divergent same-session uploads: the FINAL row is
	// exactly one candidate and session_ownership points at that same candidate.
	test("concurrent divergent uploads leave one FINAL winner matching last_content_sha256", async () => {
		// Two observations here are racy and warrant a reroll with a fresh
		// session id rather than a hard assertion:
		//  - recordSessionIngestContent only orders bookkeeping for DISTINCT
		//    ingested_at values (equal-millisecond versions are documented
		//    best-effort in session-ownership.service.ts);
		//  - both rows share one sorting key by design, so a background
		//    ReplacingMergeTree merge (or delayed row visibility on the shared
		//    cluster) can leave fewer than 2 physical rows in the poll window.
		let scenario:
			| {
					sessionId: string;
					contentA: string;
					contentB: string;
					hashA: string;
					hashB: string;
					rows: Array<{ content: string; ingested_at: string }>;
			  }
			| undefined;
		for (let attempt = 0; attempt < 5 && !scenario; attempt++) {
			const sessionId = `rp_divergent_${crypto.randomUUID()}`;
			const buildRequest = (marker: string): IngestSessionInput => ({
				content: JSON.stringify({
					message: { content: `Divergent payload ${marker}`, role: "user" },
					// Identical first timestamp keeps both rows on the same
					// (organization_id, session_date, session_id) sorting key so
					// ReplacingMergeTree FINAL collapses them.
					timestamp: "2026-07-24T19:00:00.000Z",
					type: "user",
				}),
				projectPath: "/test/rp-divergent",
				sessionId,
				source: "claude_code",
				upload_mode: "manual",
			});
			const requestA = buildRequest("alpha");
			const requestB = buildRequest("bravo");

			const [resultA, resultB] = await Promise.all([
				uploadSession(requestA, {
					endpoint: sharedRelay.rpcUrl,
					token: bearerToken,
					allowInsecureEndpoint: false,
				}),
				uploadSession(requestB, {
					endpoint: sharedRelay.rpcUrl,
					token: bearerToken,
					allowInsecureEndpoint: false,
				}),
			]);
			expect(resultA.success).toBe(true);
			expect(resultB.success).toBe(true);

			// Divergent hashes can never trip the dedupe short-circuit, so both
			// uploads inserted; observing both rows before they merge is the
			// racy part.
			const rows = await pollPhysicalRows(userId, sessionId, 2);
			const [firstRow, secondRow] = rows;
			if (
				rows.length === 2 &&
				firstRow &&
				secondRow &&
				firstRow.ingested_at !== secondRow.ingested_at
			) {
				scenario = {
					sessionId,
					contentA: requestA.content,
					contentB: requestB.content,
					hashA: computeExpectedServerContentHash(requestA),
					hashB: computeExpectedServerContentHash(requestB),
					rows,
				};
			}
		}
		assert(
			scenario,
			"five consecutive attempts raced the observation window (equal-millisecond ingested_at tie or pre-poll ReplacingMergeTree merge) — with fresh sessions each time, that points at a real ingest problem",
		);

		const storedSha = await getStoredContentHash(userId, scenario.sessionId);
		assert(storedSha);
		expect(scenario.hashA).not.toBe(scenario.hashB);
		expect([scenario.hashA, scenario.hashB]).toContain(storedSha);
		const winnerContent =
			storedSha === scenario.hashA ? scenario.contentA : scenario.contentB;

		const finalRows = await getClickhouse().query<{ content: string }>({
			query: `SELECT content FROM ${getSafeClickHouseTable("rudel.claude_sessions")} FINAL WHERE organization_id = {organizationId:String} AND session_id = {sessionId:String}`,
			query_params: { organizationId: userId, sessionId: scenario.sessionId },
		});
		expect(finalRows).toHaveLength(1);
		const finalRow = finalRows[0];
		assert(finalRow);
		// Byte-identical to exactly the candidate the ownership hash points at —
		// no torn or merged row, and Postgres bookkeeping agrees with FINAL.
		expect(finalRow.content).toBe(winnerContent);
		const newestRow = [...scenario.rows].sort((left, right) =>
			left.ingested_at < right.ingested_at ? 1 : -1,
		)[0];
		assert(newestRow);
		expect(finalRow.content).toBe(newestRow.content);
	}, 120_000);

	// ── Test 13 ── whole-file invariant: the shared relay saw real traffic and
	// zero canary crossings. Declared last so it runs after every other test.
	test("shared boundary relay observed zero canary crossings across the whole file", () => {
		const observation = sharedRelay.getObservation();
		expect(observation.requestCount).toBeGreaterThan(0);
		expect(observation.leakedRuleIds).toEqual([]);
	});
});

function cleanRawInput(sessionId: string): IngestSessionInput {
	return {
		content: JSON.stringify({
			message: {
				content: `clean window filler for ${sessionId}`,
				role: "user",
			},
			timestamp: "2026-07-24T15:00:00.000Z",
			type: "user",
		}),
		projectPath: "/test/rp-rate-limit-window",
		sessionId,
		source: "claude_code",
		upload_mode: "manual",
	};
}

/** Fails the test unless `content` trips the 20% redaction budget. */
function expectOverBudget(content: string): void {
	const filtered = filterSessionTextFields({ content, subagents: undefined });
	const anomaly = getRedactionBudgetAnomaly(
		filtered.redactedBytes,
		Buffer.byteLength(content, "utf8"),
		filtered.counts,
	);
	expect(anomaly).not.toBeNull();
}

/**
 * The hash the server records in session_ownership.last_content_sha256:
 * computeIngestContentHash over the server-side filtered input (router.ts
 * filters, pins filter_version, and hashes exactly this shape).
 */
function computeExpectedServerContentHash(request: IngestSessionInput): string {
	const filtered = filterSessionTextFields({
		content: request.content,
		subagents: request.subagents,
	});
	return computeIngestContentHash({
		...request,
		content: filtered.content,
		subagents: filtered.subagents ? [...filtered.subagents] : undefined,
		filter_version: FILTER_VERSION,
	});
}

async function getPhysicalRowContents(
	organizationId: string,
	sessionId: string,
): Promise<Array<{ content: string; ingested_at: string }>> {
	return getClickhouse().query<{ content: string; ingested_at: string }>({
		query: `SELECT content, ingested_at FROM ${getSafeClickHouseTable("rudel.claude_sessions")} WHERE organization_id = {organizationId:String} AND session_id = {sessionId:String} ORDER BY ingested_at, content`,
		query_params: { organizationId, sessionId },
	});
}

async function pollPhysicalRows(
	organizationId: string,
	sessionId: string,
	minimumRows: number,
): Promise<Array<{ content: string; ingested_at: string }>> {
	let rows: Array<{ content: string; ingested_at: string }> = [];
	for (let attempt = 0; attempt < 20; attempt += 1) {
		rows = await getPhysicalRowContents(organizationId, sessionId);
		if (rows.length >= minimumRows) {
			return rows;
		}
		await Bun.sleep(250);
	}
	return rows;
}

/** Bind a loopback port, note it, and free it: a guaranteed-dead endpoint. */
async function acquireDeadEndpoint(): Promise<string> {
	const probe = Bun.serve({
		hostname: "127.0.0.1",
		port: 0,
		fetch: () => new Response("probe"),
	});
	const port = probe.port;
	await probe.stop(true);
	return `http://127.0.0.1:${port}`;
}
