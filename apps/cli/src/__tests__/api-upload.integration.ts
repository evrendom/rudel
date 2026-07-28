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
import {
	type IngestSessionInput,
	REDACTION_BUDGET_EXCEEDED_CODE,
} from "@rudel/api-routes";
import { FILTER_VERSION } from "@rudel/secret-filter";
import {
	getClickhouse,
	getSafeClickHouseTable,
} from "../../../api/src/clickhouse.js";
import { sqlClient } from "../../../api/src/db.js";
import { createApiClient } from "../lib/api-client.js";
import { uploadSession } from "../lib/uploader.js";
import {
	signUpTestUser,
	startTestServer,
	type TestServer,
} from "./helpers/bun-server.js";
import {
	buildCliArtifact,
	containsAnyCanary,
	createClaudeFixtureSecrets,
	createCodexFixtureSecrets,
	EXPECTED_CLAUDE_REDACTION_SUMMARY,
	type FixtureSecret,
	getNodeMajorVersion,
	hashText,
	hasRealisticClaudeShape,
	hasRealisticClaudeSubagentShape,
	hasRealisticCodexShape,
	parseJsonl,
	readRedactionTemplates,
	renderFixture,
	runBuiltCli,
	startBoundaryRelay,
	stopAllBoundaryRelays,
	writeCliCredentials,
} from "./helpers/cli-e2e.js";
import { createStoredSessionReaders } from "./helpers/stored-sessions.js";

setDefaultTimeout(60_000);

const {
	getPhysicalSessionCount,
	getStoredContentHash,
	getStoredFilteredSession,
	getStoredCodexSession,
	getStoredAnalyticsSession,
} = createStoredSessionReaders({
	getClickhouse,
	getSafeTable: getSafeClickHouseTable,
	sql: sqlClient,
});

let server: TestServer;
let limitedServer: TestServer;
let bearerToken: string;
let limitedBearerToken: string;
let tempDir: string;
let userId: string;
let claudeSessionTemplate: string;
let claudeSubagentTemplate: string;
let codexSessionTemplate: string;

interface ApiKeyCreateResponse {
	id: string;
	key: string;
}

beforeAll(async () => {
	tempDir = await mkdtemp(join(tmpdir(), "rudel-api-test-"));
	server = await startTestServer();
	bearerToken = await signUpTestUser(server.baseUrl);
	const currentUser = await createApiClient({
		apiBaseUrl: server.baseUrl,
		token: bearerToken,
	}).me();
	userId = currentUser.id;

	limitedServer = await startTestServer({
		RATE_LIMIT_INGEST_BYTES_MAX: "1000000",
		RATE_LIMIT_INGEST_REQUESTS_MAX: "2",
	});
	limitedBearerToken = await signUpTestUser(limitedServer.baseUrl);

	await buildCliArtifact();
	const templates = await readRedactionTemplates();
	claudeSessionTemplate = templates.claudeSession;
	claudeSubagentTemplate = templates.claudeSubagent;
	codexSessionTemplate = templates.codexSession;
});

afterAll(async () => {
	await Promise.all([
		server?.stop(),
		limitedServer?.stop(),
		stopAllBoundaryRelays(),
	]);
	if (tempDir) {
		await rm(tempDir, { recursive: true, force: true }).catch(() => {});
	}
});

describe("CLI upload to local API", () => {
	// Bun's test runner may kill the server as a "dangling process" between
	// beforeAll and the first test, or between tests. Restart it if needed.
	beforeEach(async () => {
		await Promise.all([server.ensureAlive(), limitedServer.ensureAlive()]);
	});

	test("uploads a session via uploadSession to the local API", async () => {
		expect(bearerToken).toBeTruthy();

		const testId = `cli_api_test_${Date.now()}`;
		const request: IngestSessionInput = {
			source: "claude_code",
			sessionId: testId,
			projectPath: "/test/cli-api-upload",
			gitBranch: "main",
			gitSha: "abc123",
			tag: "tests",
			content: "cli api integration test content",
			subagents: [{ agentId: "sub-1", content: "subagent content" }],
		};

		// Retry up to 3 times — Bun may kill the server as a "dangling process"
		// and the restarted server's ClickHouse connection can be slow to warm up.
		// Each attempt has a per-call timeout so a hanging request doesn't
		// consume the entire test timeout and block retries.
		// Note: uploadSession itself retries up to 3 times with exponential backoff
		// (1s, 2s delays), so a full internal cycle can take ~20s. The per-attempt
		// timeout must exceed this to avoid cutting off mid-retry.
		let result = { success: false, error: "not attempted" } as Awaited<
			ReturnType<typeof uploadSession>
		>;
		for (let attempt = 0; attempt < 3; attempt++) {
			result = await Promise.race([
				uploadSession(request, {
					endpoint: server.rpcUrl,
					token: bearerToken,
					allowInsecureEndpoint: false,
				}),
				Bun.sleep(25_000).then(
					() =>
						({ success: false, error: "attempt timed out" }) as Awaited<
							ReturnType<typeof uploadSession>
						>,
				),
			]);
			if (result.success) break;
			await server.ensureAlive();
			await Bun.sleep(1000);
		}

		if (!result.success) {
			throw new Error(`uploadSession failed after 3 attempts: ${result.error}`);
		}
		expect(result.status).toBe(200);
	}, 90_000);

	test("full CLI upload via subprocess to local API", async () => {
		expect(bearerToken).toBeTruthy();

		const projectDir = join(tempDir, "cli-e2e-test");
		await mkdir(projectDir, { recursive: true });

		// Write credentials file using the current server URL (port may have changed)
		const credDir = join(tempDir, "cli-creds");
		await mkdir(credDir, { recursive: true });
		await writeFile(
			join(credDir, "credentials.json"),
			JSON.stringify({
				token: bearerToken,
				apiBaseUrl: server.baseUrl,
				authType: "bearer",
			}),
		);

		const sessionFile = join(projectDir, "e2e-test-session.jsonl");
		await writeFile(
			sessionFile,
			[
				JSON.stringify({
					type: "summary",
					sessionId: "e2e-test-session",
				}),
				JSON.stringify({
					type: "message",
					role: "human",
					content: "test",
				}),
			].join("\n"),
		);

		const cliPath = join(import.meta.dir, "..", "bin", "cli.ts");

		// Retry up to 3 times — same dangling-process issue as the direct-call test.
		// Each subprocess gets a per-attempt timeout so a hanging process
		// doesn't consume the entire test timeout.
		let lastStdout = "";
		let lastStderr = "";
		let lastExitCode = -1;
		for (let attempt = 0; attempt < 3; attempt++) {
			const proc = Bun.spawn(
				["bun", cliPath, "upload", sessionFile, "--endpoint", server.rpcUrl],
				{
					stdin: "ignore",
					stdout: "pipe",
					stderr: "pipe",
					env: {
						...process.env,
						RUDEL_CONFIG_DIR: credDir,
					},
				},
			);

			const timeout = setTimeout(() => proc.kill(), 25_000);
			const [exitCode, stdout, stderr] = await Promise.all([
				proc.exited,
				new Response(proc.stdout).text(),
				new Response(proc.stderr).text(),
			]);
			clearTimeout(timeout);

			lastStdout = stdout;
			lastStderr = stderr;
			lastExitCode = exitCode;

			if (stdout.includes("Upload successful!")) break;
			await server.ensureAlive();
			await Bun.sleep(1000);
		}

		if (!lastStdout.includes("Upload successful!")) {
			throw new Error(
				`Expected "Upload successful!" in stdout after 3 attempts.\n` +
					`Exit code: ${lastExitCode}\n` +
					`stdout: ${lastStdout}\n` +
					`stderr: ${lastStderr}`,
			);
		}
		expect(lastExitCode).toBe(0);
	}, 90_000);

	test("full CLI upload exits nonzero when the API rejects the request", async () => {
		const projectDir = join(tempDir, "cli-rejected-upload-test");
		const credDir = join(tempDir, "cli-rejected-upload-creds");
		await Promise.all([
			mkdir(projectDir, { recursive: true }),
			mkdir(credDir, { recursive: true }),
		]);

		await writeFile(
			join(credDir, "credentials.json"),
			JSON.stringify({
				token: "invalid-api-key",
				apiBaseUrl: server.baseUrl,
				authType: "api-key",
			}),
		);

		const sessionFile = join(projectDir, "rejected-session.jsonl");
		await writeFile(
			sessionFile,
			[
				JSON.stringify({
					type: "summary",
					sessionId: "rejected-session",
				}),
				JSON.stringify({
					type: "message",
					role: "human",
					content: "test",
				}),
			].join("\n"),
		);

		const cliPath = join(import.meta.dir, "..", "bin", "cli.ts");
		const proc = Bun.spawn(
			["bun", cliPath, "upload", sessionFile, "--endpoint", server.rpcUrl],
			{
				stdin: "ignore",
				stdout: "pipe",
				stderr: "pipe",
				env: {
					...process.env,
					RUDEL_CONFIG_DIR: credDir,
				},
			},
		);

		const [exitCode, stderr] = await Promise.all([
			proc.exited,
			new Response(proc.stderr).text(),
		]);

		expect(exitCode).toBe(1);
		expect(stderr).toContain("Upload failed:");
	}, 90_000);

	test("rejects unauthenticated requests", async () => {
		const request: IngestSessionInput = {
			source: "claude_code",
			sessionId: "unauth-test",
			projectPath: "/test/unauth",
			content: "should fail",
		};

		const result = await uploadSession(request, {
			endpoint: server.rpcUrl,
			token: "invalid-token",
			allowInsecureEndpoint: false,
		});

		expect(result.success).toBe(false);
	});

	test("does not cap CLI API key auth at Better Auth's default request limit", async () => {
		const apiKey = await createIngestApiKey(server.baseUrl, bearerToken);
		const client = createApiClient({
			apiBaseUrl: server.baseUrl,
			token: apiKey.key,
			authType: "api-key",
		});

		const results = [];
		for (let index = 0; index < 12; index += 1) {
			results.push(await client.cli.authStatus());
		}

		expect(results).toHaveLength(12);
		for (const user of results) {
			expect(user.name).toBe("Test User");
			expect(user.email).toContain("test-");
		}
	});

	test("short-circuits a sequential duplicate, then ingests appended content", async () => {
		const sessionId = `cli_dedup_${crypto.randomUUID()}`;
		const sessionDate = "2026-07-24 13:00:00.000";
		const request = createDedupeInput(sessionId, "initial");

		const firstUpload = await uploadSession(request, {
			endpoint: server.rpcUrl,
			token: bearerToken,
			allowInsecureEndpoint: false,
		});
		expect(firstUpload.success).toBe(true);
		const firstPhysicalCount = await getPhysicalSessionCount(
			userId,
			sessionDate,
			sessionId,
		);
		expect(firstPhysicalCount).toBe(1);
		const firstHash = await getStoredContentHash(userId, sessionId);
		expect(firstHash).toHaveLength(64);

		const duplicateUpload = await uploadSession(request, {
			endpoint: server.rpcUrl,
			token: bearerToken,
			allowInsecureEndpoint: false,
		});
		expect(duplicateUpload.success).toBe(true);
		expect(await getPhysicalSessionCount(userId, sessionDate, sessionId)).toBe(
			firstPhysicalCount,
		);

		const appendedUpload = await uploadSession(
			{
				...request,
				content: `${request.content}\n${JSON.stringify({
					message: {
						content: "Appended response",
						role: "assistant",
						usage: { input_tokens: 1, output_tokens: 1 },
					},
					timestamp: "2026-07-24T13:00:01.000Z",
					type: "assistant",
				})}`,
			},
			{
				endpoint: server.rpcUrl,
				token: bearerToken,
				allowInsecureEndpoint: false,
			},
		);
		expect(appendedUpload.success).toBe(true);
		expect(await getPhysicalSessionCount(userId, sessionDate, sessionId)).toBe(
			firstPhysicalCount + 1,
		);
		expect(await getStoredContentHash(userId, sessionId)).not.toBe(firstHash);
	}, 60_000);

	test("redacts known patterns in all transcript fields and dedupes old and new clients", async () => {
		const sessionId = `cli_redaction_${crypto.randomUUID()}`;
		const sessionDate = "2026-07-24 16:00:00.000";
		const openAiCanary = `sk-${"CANARY".padEnd(20, "A")}T3BlbkFJ${"CANARY".padEnd(20, "B")}`;
		const awsCanary = "AKIACANARY234567ABCD";
		const request: IngestSessionInput = {
			content: JSON.stringify({
				message: {
					content: `Use ${openAiCanary}`,
					role: "user",
				},
				notes: "Benign transcript context. ".repeat(20),
				timestamp: "2026-07-24T16:00:00.000Z",
				type: "user",
			}),
			projectPath: "/test/cli-redaction",
			sessionId,
			source: "claude_code",
			subagents: [
				{
					agentId: "agent-canary",
					content: `AWS_ACCESS_KEY_ID=${awsCanary}`,
				},
			],
			upload_mode: "manual",
		};

		const oldClientResponse = await createApiClient({
			apiBaseUrl: server.baseUrl,
			token: bearerToken,
		}).ingestSession(request);
		expect(oldClientResponse.redacted).toEqual({
			"aws-access-key-id": 1,
			"openai-api-key": 1,
		});
		expect(oldClientResponse.redactedBytes).toBe(71);

		const storedRow = await getStoredFilteredSession(userId, sessionId);
		assert(storedRow);
		expect(storedRow.content.includes(openAiCanary)).toBe(false);
		expect(
			storedRow.subagents["agent-canary"]?.includes(awsCanary) ?? false,
		).toBe(false);
		expect(storedRow.content).toContain("[REDACTED:openai-api-key]");
		expect(storedRow.subagents["agent-canary"]).toContain(
			"[REDACTED:aws-access-key-id]",
		);
		expect(storedRow.filter_version).toBe(FILTER_VERSION);

		const newClientResponse = await uploadSession(request, {
			endpoint: server.rpcUrl,
			token: bearerToken,
		});
		expect(newClientResponse.success).toBe(true);
		expect(newClientResponse.redacted).toEqual({
			"aws-access-key-id": 1,
			"openai-api-key": 1,
		});
		expect(newClientResponse.redactedBytes).toBe(71);
		expect(await getPhysicalSessionCount(userId, sessionDate, sessionId)).toBe(
			1,
		);
	}, 90_000);

	test("API rejects an over-budget redaction without storing the session", async () => {
		const sessionId = `api_redaction_budget_${crypto.randomUUID()}`;
		const openAiCanary = `sk-${"CANARY".padEnd(20, "A")}T3BlbkFJ${"CANARY".padEnd(20, "B")}`;
		const request = createApiClient({
			apiBaseUrl: server.baseUrl,
			token: bearerToken,
		}).ingestSession({
			content: JSON.stringify({
				message: { content: openAiCanary, role: "user" },
				timestamp: "2026-07-24T16:30:00.000Z",
				type: "user",
			}),
			projectPath: "/test/api-redaction-budget",
			sessionId,
			source: "claude_code",
			upload_mode: "manual",
		});

		await expect(request).rejects.toMatchObject({
			code: REDACTION_BUDGET_EXCEEDED_CODE,
			data: {
				redactedBytes: 51,
				ruleIds: ["openai-api-key"],
			},
		});
		expect(await getStoredFilteredSession(userId, sessionId)).toBeNull();
		expect(await getStoredContentHash(userId, sessionId)).toBeNull();
	}, 60_000);

	test("SessionEnd hook queues an over-budget transcript without transport", async () => {
		const sessionId = `cli_redaction_budget_hook_${crypto.randomUUID()}`;
		const openAiCanary = `sk-${"CANARY".padEnd(20, "A")}T3BlbkFJ${"CANARY".padEnd(20, "B")}`;
		const secrets: readonly FixtureSecret[] = [
			{
				placeholder: "{{OPENAI_CANARY}}",
				ruleId: "openai-api-key",
				value: openAiCanary,
			},
		];
		const home = join(tempDir, sessionId);
		const configDir = join(home, ".rudel");
		const projectDir = join(home, "claude-hook-project");
		const sessionFile = join(projectDir, `${sessionId}.jsonl`);
		const rawContent = JSON.stringify({
			message: { content: openAiCanary, role: "user" },
			timestamp: "2026-07-24T16:45:00.000Z",
			type: "user",
		});
		const relay = startBoundaryRelay(
			() => server.baseUrl,
			() => server.ensureAlive(),
			secrets,
		);

		await Promise.all([
			mkdir(configDir, { recursive: true }),
			mkdir(projectDir, { recursive: true }),
		]);
		await Promise.all([
			writeCliCredentials(configDir, bearerToken, relay.baseUrl),
			writeFile(sessionFile, rawContent),
		]);

		const manualResult = await runBuiltCli(
			["upload", sessionFile, "--endpoint", relay.rpcUrl],
			{ configDir, home },
		);
		expect(manualResult.exitCode).not.toBe(0);
		expect(manualResult.stderr).toContain(
			"Redaction safety check stopped upload",
		);
		expect(manualResult.stderr).not.toContain(openAiCanary);
		expect(relay.getObservation().requestCount).toBe(0);

		const hookResult = await runBuiltCli(["hooks", "claude", "session-end"], {
			configDir,
			env: {
				RUDEL_API_BASE: relay.baseUrl,
				RUDEL_ALLOW_INSECURE_ENDPOINT: "",
			},
			home,
			stdin: JSON.stringify({
				session_id: sessionId,
				transcript_path: sessionFile,
				cwd: projectDir,
			}),
		});

		const [hookLog, failedUploads] = await Promise.all([
			readFile(join(home, ".rudel", "logs", "hook-upload.log"), "utf8"),
			readFile(join(home, ".rudel", "failed-uploads.json"), "utf8"),
		]);
		expect(hookResult.exitCode).toBe(0);
		expect(relay.getObservation().requestCount).toBe(0);
		expect(hookLog).toContain("Redaction safety check stopped upload");
		expect(failedUploads).toContain(sessionId);
		expect(failedUploads).toContain("above the 20% transcript budget");
		expect(hookLog).not.toContain(openAiCanary);
		expect(failedUploads).not.toContain(openAiCanary);
		expect(await getStoredFilteredSession(userId, sessionId)).toBeNull();
	}, 90_000);

	test("built CLI redacts a realistic Claude transcript before transport and persistence", async () => {
		const sessionId = `cli_claude_realistic_${crypto.randomUUID()}`;
		const secrets = createClaudeFixtureSecrets();
		const home = join(tempDir, sessionId);
		const configDir = join(home, ".rudel");
		const projectDir = join(home, "claude-project");
		const sessionFile = join(projectDir, `${sessionId}.jsonl`);
		const subagentDir = join(projectDir, sessionId, "subagents");
		const subagentFile = join(subagentDir, "agent-nested-agent-001.jsonl");
		const rawContent = renderFixture(
			claudeSessionTemplate,
			sessionId,
			secrets,
			false,
		);
		const expectedContent = renderFixture(
			claudeSessionTemplate,
			sessionId,
			secrets,
			true,
		);
		const rawSubagent = renderFixture(
			claudeSubagentTemplate,
			sessionId,
			secrets,
			false,
		);
		const expectedSubagent = renderFixture(
			claudeSubagentTemplate,
			sessionId,
			secrets,
			true,
		);
		const relay = startBoundaryRelay(
			() => server.baseUrl,
			() => server.ensureAlive(),
			secrets,
		);

		await Promise.all([
			mkdir(configDir, { recursive: true }),
			mkdir(projectDir, { recursive: true }),
			mkdir(subagentDir, { recursive: true }),
		]);
		await Promise.all([
			writeCliCredentials(configDir, bearerToken, relay.baseUrl),
			writeFile(sessionFile, rawContent),
			writeFile(subagentFile, rawSubagent),
		]);

		const rawEntries = parseJsonl(rawContent);
		const rawSubagentEntries = parseJsonl(rawSubagent);
		expect(hasRealisticClaudeShape(rawEntries)).toBe(true);
		expect(hasRealisticClaudeSubagentShape(rawSubagentEntries)).toBe(true);
		expect(await getNodeMajorVersion()).toBeGreaterThanOrEqual(20);

		const result = await runBuiltCli(
			["upload", sessionFile, "--endpoint", relay.rpcUrl],
			{
				configDir,
				home,
			},
		);

		expect(result.exitCode).toBe(0);
		expect(result.stdout.includes("Upload successful!")).toBe(true);
		expect(result.stdout.includes(EXPECTED_CLAUDE_REDACTION_SUMMARY)).toBe(
			true,
		);
		expect(containsAnyCanary(result.stdout, secrets)).toBe(false);
		expect(containsAnyCanary(result.stderr, secrets)).toBe(false);

		const boundary = relay.getObservation();
		expect(boundary.requestCount).toBeGreaterThan(0);
		expect(boundary.leakedRuleIds).toEqual([]);
		for (const secret of secrets) {
			expect(boundary.markerCounts[secret.ruleId]).toBe(boundary.requestCount);
		}

		const storedRow = await getStoredFilteredSession(userId, sessionId);
		assert(storedRow);
		const storedSubagent = storedRow.subagents["nested-agent-001"];
		assert(storedSubagent);
		expect(containsAnyCanary(storedRow.content, secrets)).toBe(false);
		expect(containsAnyCanary(storedSubagent, secrets)).toBe(false);
		expect(hashText(storedRow.content)).toBe(hashText(expectedContent));
		expect(hashText(storedSubagent)).toBe(hashText(expectedSubagent));
		expect(storedRow.filter_version).toBe(FILTER_VERSION);
		expect(hasRealisticClaudeShape(parseJsonl(storedRow.content))).toBe(true);
		expect(hasRealisticClaudeSubagentShape(parseJsonl(storedSubagent))).toBe(
			true,
		);

		const analytics = await getStoredAnalyticsSession(
			userId,
			sessionId,
			"claude_code",
		);
		assert(analytics);
		const analyticsSubagent = analytics.subagents["nested-agent-001"];
		assert(analyticsSubagent);
		expect(containsAnyCanary(analytics.content, secrets)).toBe(false);
		expect(containsAnyCanary(analyticsSubagent, secrets)).toBe(false);
		expect(hashText(analytics.content)).toBe(hashText(expectedContent));
		expect(hashText(analyticsSubagent)).toBe(hashText(expectedSubagent));
		expect(analytics.filter_version).toBe(FILTER_VERSION);
	}, 120_000);

	test("built CLI redacts a realistic Claude transcript through the SessionEnd hook", async () => {
		const sessionId = `cli_claude_hook_realistic_${crypto.randomUUID()}`;
		const secrets = createClaudeFixtureSecrets();
		const home = join(tempDir, sessionId);
		const configDir = join(home, ".rudel");
		const projectDir = join(home, "claude-hook-project");
		const sessionFile = join(projectDir, `${sessionId}.jsonl`);
		const subagentDir = join(projectDir, sessionId, "subagents");
		const subagentFile = join(subagentDir, "agent-nested-agent-001.jsonl");
		const rawContent = renderFixture(
			claudeSessionTemplate,
			sessionId,
			secrets,
			false,
		);
		const expectedContent = renderFixture(
			claudeSessionTemplate,
			sessionId,
			secrets,
			true,
		);
		const rawSubagent = renderFixture(
			claudeSubagentTemplate,
			sessionId,
			secrets,
			false,
		);
		const expectedSubagent = renderFixture(
			claudeSubagentTemplate,
			sessionId,
			secrets,
			true,
		);
		const relay = startBoundaryRelay(
			() => server.baseUrl,
			() => server.ensureAlive(),
			secrets,
		);

		await Promise.all([
			mkdir(configDir, { recursive: true }),
			mkdir(projectDir, { recursive: true }),
			mkdir(subagentDir, { recursive: true }),
		]);
		await Promise.all([
			writeCliCredentials(configDir, bearerToken, relay.baseUrl),
			writeFile(sessionFile, rawContent),
			writeFile(subagentFile, rawSubagent),
		]);

		const result = await runBuiltCli(["hooks", "claude", "session-end"], {
			configDir,
			env: {
				RUDEL_API_BASE: relay.baseUrl,
				RUDEL_ALLOW_INSECURE_ENDPOINT: "",
			},
			home,
			stdin: JSON.stringify({
				session_id: sessionId,
				transcript_path: sessionFile,
				cwd: projectDir,
			}),
		});

		const hookLog = await readFile(
			join(home, ".rudel", "logs", "hook-upload.log"),
			"utf8",
		);
		expect(result.exitCode).toBe(0);
		expect(hookLog.includes("Upload successful for session")).toBe(true);
		expect(hookLog.includes(EXPECTED_CLAUDE_REDACTION_SUMMARY)).toBe(true);
		expect(containsAnyCanary(result.stdout, secrets)).toBe(false);
		expect(containsAnyCanary(result.stderr, secrets)).toBe(false);
		expect(containsAnyCanary(hookLog, secrets)).toBe(false);

		const boundary = relay.getObservation();
		expect(boundary.requestCount).toBeGreaterThan(0);
		expect(boundary.leakedRuleIds).toEqual([]);
		for (const secret of secrets) {
			expect(boundary.markerCounts[secret.ruleId]).toBe(boundary.requestCount);
		}

		const storedRow = await getStoredFilteredSession(userId, sessionId);
		assert(storedRow);
		const storedSubagent = storedRow.subagents["nested-agent-001"];
		assert(storedSubagent);
		expect(containsAnyCanary(storedRow.content, secrets)).toBe(false);
		expect(containsAnyCanary(storedSubagent, secrets)).toBe(false);
		expect(hashText(storedRow.content)).toBe(hashText(expectedContent));
		expect(hashText(storedSubagent)).toBe(hashText(expectedSubagent));
		expect(storedRow.filter_version).toBe(FILTER_VERSION);
	}, 120_000);

	test("built CLI redacts a realistic Codex rollout through the hook path", async () => {
		const sessionId = `cli_codex_realistic_${crypto.randomUUID()}`;
		const secrets = createCodexFixtureSecrets();
		const home = join(tempDir, sessionId);
		const configDir = join(home, ".rudel");
		const projectDir = join(home, "codex-project");
		const sessionFile = join(projectDir, `${sessionId}.jsonl`);
		const rawContent = renderFixture(
			codexSessionTemplate,
			sessionId,
			secrets,
			false,
		);
		const expectedContent = renderFixture(
			codexSessionTemplate,
			sessionId,
			secrets,
			true,
		);
		const relay = startBoundaryRelay(
			() => server.baseUrl,
			() => server.ensureAlive(),
			secrets,
		);

		await Promise.all([
			mkdir(configDir, { recursive: true }),
			mkdir(projectDir, { recursive: true }),
		]);
		await Promise.all([
			writeCliCredentials(configDir, bearerToken, relay.baseUrl),
			writeFile(sessionFile, rawContent),
		]);

		expect(hasRealisticCodexShape(parseJsonl(rawContent))).toBe(true);

		const result = await runBuiltCli(["hooks", "codex", "turn-complete"], {
			configDir,
			env: {
				RUDEL_API_BASE: relay.baseUrl,
				RUDEL_ALLOW_INSECURE_ENDPOINT: "",
			},
			home,
			stdin: JSON.stringify({
				type: "agent-turn-complete",
				thread_id: sessionId,
				turn_id: "88888888-8888-4888-8888-888888888888",
				cwd: projectDir,
				transcript_path: sessionFile,
			}),
		});

		const hookLog = await readFile(
			join(home, ".rudel", "logs", "hook-upload.log"),
			"utf8",
		);
		const expectedSummary =
			"3 values matching known secret patterns were redacted (anthropic-api-key ×1, sendgrid-api-token ×1, stripe-access-token ×1, 209 B).";
		expect(result.exitCode).toBe(0);
		expect(hookLog.includes(expectedSummary)).toBe(true);
		expect(containsAnyCanary(result.stdout, secrets)).toBe(false);
		expect(containsAnyCanary(result.stderr, secrets)).toBe(false);
		expect(containsAnyCanary(hookLog, secrets)).toBe(false);

		const boundary = relay.getObservation();
		expect(boundary.requestCount).toBeGreaterThan(0);
		expect(boundary.leakedRuleIds).toEqual([]);
		for (const secret of secrets) {
			expect(boundary.markerCounts[secret.ruleId]).toBe(boundary.requestCount);
		}

		const storedRow = await getStoredCodexSession(userId, sessionId);
		assert(storedRow);
		expect(containsAnyCanary(storedRow.content, secrets)).toBe(false);
		expect(hashText(storedRow.content)).toBe(hashText(expectedContent));
		expect(storedRow.filter_version).toBe(FILTER_VERSION);
		expect(hasRealisticCodexShape(parseJsonl(storedRow.content))).toBe(true);

		const analytics = await getStoredAnalyticsSession(
			userId,
			sessionId,
			"codex",
		);
		assert(analytics);
		expect(containsAnyCanary(analytics.content, secrets)).toBe(false);
		expect(hashText(analytics.content)).toBe(hashText(expectedContent));
		expect(analytics.filter_version).toBe(FILTER_VERSION);
	}, 120_000);

	test("allows concurrent identical ingests with best-effort deduplication", async () => {
		const sessionId = `cli_concurrent_dedup_${crypto.randomUUID()}`;
		const sessionDate = "2026-07-24 14:00:00.000";
		const request = createDedupeInput(sessionId, "concurrent", "14:00:00");

		const results = await Promise.all([
			uploadSession(request, {
				endpoint: server.rpcUrl,
				token: bearerToken,
				allowInsecureEndpoint: false,
			}),
			uploadSession(request, {
				endpoint: server.rpcUrl,
				token: bearerToken,
				allowInsecureEndpoint: false,
			}),
		]);

		expect(results.every((result) => result.success)).toBe(true);
		expect(
			await getPhysicalSessionCount(userId, sessionDate, sessionId),
		).toBeGreaterThanOrEqual(1);
	}, 60_000);

	test("charges duplicate requests to the request limiter", async () => {
		const request = createDedupeInput(
			`cli_limited_dedup_${crypto.randomUUID()}`,
			"limited",
			"15:00:00",
		);

		const firstUpload = await uploadSession(request, {
			endpoint: limitedServer.rpcUrl,
			token: limitedBearerToken,
			allowInsecureEndpoint: false,
		});
		const duplicateUpload = await uploadSession(request, {
			endpoint: limitedServer.rpcUrl,
			token: limitedBearerToken,
			allowInsecureEndpoint: false,
		});
		const limitedUpload = await uploadSession(request, {
			endpoint: limitedServer.rpcUrl,
			token: limitedBearerToken,
			allowInsecureEndpoint: false,
		});

		expect(firstUpload.success).toBe(true);
		expect(duplicateUpload.success).toBe(true);
		expect(limitedUpload).toEqual({
			success: false,
			error:
				"Ingest request limit reached (2 requests per 60 min). Wait and retry with: rudel upload --retry",
			attempts: 1,
			rateLimited: true,
		});
	}, 60_000);
});

async function createIngestApiKey(apiBase: string, accessToken: string) {
	const response = await fetch(`${apiBase}/api/auth/api-key/create`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${accessToken}`,
		},
		body: JSON.stringify({
			name: "rudel-cli-ingest",
			expiresIn: null,
		}),
	});

	expect(response.ok).toBe(true);
	const body: unknown = await response.json();
	assert(isApiKeyCreateResponse(body));
	return body;
}

function isApiKeyCreateResponse(value: unknown): value is ApiKeyCreateResponse {
	return (
		typeof value === "object" &&
		value !== null &&
		"id" in value &&
		"key" in value &&
		typeof value.id === "string" &&
		typeof value.key === "string"
	);
}

function createDedupeInput(
	sessionId: string,
	contentMarker: string,
	time = "13:00:00",
): IngestSessionInput {
	return {
		content: JSON.stringify({
			message: {
				content: `Session content from ${contentMarker}`,
				role: "user",
			},
			timestamp: `2026-07-24T${time}.000Z`,
			type: "user",
		}),
		projectPath: "/test/cli-dedup",
		sessionId,
		source: "claude_code",
		upload_mode: "manual",
	};
}
