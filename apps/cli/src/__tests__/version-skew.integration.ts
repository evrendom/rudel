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
import { REDACTION_BUDGET_EXCEEDED_MESSAGE } from "@rudel/api-routes";
import { FILTER_VERSION } from "@rudel/secret-filter";
import {
	getClickhouse,
	getSafeClickHouseTable,
} from "../../../api/src/clickhouse.js";
import { sqlClient } from "../../../api/src/db.js";
import { createApiClient } from "../lib/api-client.js";
import {
	signUpTestUser,
	startTestServer,
	type TestServer,
} from "./helpers/bun-server.js";
import {
	type BuiltCliOptions,
	type BuiltCliResult,
	buildCliArtifact,
	containsAnyCanary,
	createClaudeFixtureSecrets,
	type FixtureSecret,
	hashText,
	readRedactionTemplates,
	renderFixture,
	runBuiltCli,
	writeCliCredentials,
} from "./helpers/cli-e2e.js";
import { createStoredSessionReaders } from "./helpers/stored-sessions.js";

/**
 * Axis A1 — version skew: the published rudel@0.1.17 tarball driven against
 * the current API server.
 *
 * HARD REQUIREMENT: RUDEL_OLD_CLI_PATH must be the absolute path to the
 * extracted 0.1.17 artifact (package/dist/cli.js from the npm tarball).
 * There is deliberately no skip path (.claude/skills/testing-bun): when the
 * env var is missing, the suite fails. This file is not in the default
 * test:integration list; run it explicitly via `bun run test:integration:skew`
 * with Doppler CI env.
 *
 * 0.1.17 does no client-side filtering, so its transcripts leak in transit by
 * design — that is exactly the skew under test, and why there is no boundary
 * relay here. The release invariant is server-side: stored rows must be
 * canary-free, marker-bearing, and stamped with the active filter version.
 */

setDefaultTimeout(60_000);

const OLD_CLI_PATH = process.env.RUDEL_OLD_CLI_PATH ?? "";

const {
	getPhysicalSessionCount,
	getStoredContentHash,
	getStoredFilteredSession,
	getStoredAnalyticsSession,
} = createStoredSessionReaders({
	getClickhouse,
	getSafeTable: getSafeClickHouseTable,
	sql: sqlClient,
});

interface OldClientUploadProbe {
	readonly secrets: readonly FixtureSecret[];
	readonly sessionId: string;
}

interface SkewWorkspace {
	readonly configDir: string;
	readonly home: string;
	readonly projectDir: string;
}

let server: TestServer;
let bearerToken: string;
let userId: string;
let tempDir: string;
let claudeSessionTemplate: string;
let claudeSubagentTemplate: string;
/** Populated by the dirty-upload test and consumed by the analytics test. */
let oldClientUploadProbe: OldClientUploadProbe | null = null;

beforeAll(async () => {
	tempDir = await mkdtemp(join(tmpdir(), "rudel-version-skew-"));
	server = await startTestServer();
	bearerToken = await signUpTestUser(server.baseUrl);
	const currentUser = await createApiClient({
		apiBaseUrl: server.baseUrl,
		token: bearerToken,
	}).me();
	userId = currentUser.id;

	await buildCliArtifact();
	const templates = await readRedactionTemplates();
	claudeSessionTemplate = templates.claudeSession;
	claudeSubagentTemplate = templates.claudeSubagent;
});

afterAll(async () => {
	await server?.stop();
	if (tempDir) {
		await rm(tempDir, { recursive: true, force: true }).catch(() => {});
	}
});

describe("published rudel@0.1.17 against the current API", () => {
	beforeEach(async () => {
		await server.ensureAlive();
	});

	test("hard-requires the 0.1.17 artifact and pins the filter version", async () => {
		expect(process.env.RUDEL_OLD_CLI_PATH).toBeTruthy();

		// Every stored-row assertion in this file uses FILTER_VERSION. Pin the
		// literal in exactly one place so a future filter bump fails loudly here
		// and forces a deliberate re-run of the skew matrix.
		expect(FILTER_VERSION).toBe(4);

		const workspace = await createSkewWorkspace("version-guard");
		const result = await runOldCli(["--version"], workspace);
		expect(result.exitCode).toBe(0);
		expect(result.stdout.trim()).toBe("0.1.17");
	});

	test("old CLI uploads a dirty realistic transcript and the server stores it filtered", async () => {
		const sessionId = `skew_old_dirty_${crypto.randomUUID()}`;
		const secrets = createClaudeFixtureSecrets();
		const workspace = await createSkewWorkspace(sessionId);
		const sessionFile = await writeRealisticDirtySession(
			workspace,
			sessionId,
			secrets,
		);
		const expectedContent = renderFixture(
			claudeSessionTemplate,
			sessionId,
			secrets,
			true,
		);
		const expectedSubagent = renderFixture(
			claudeSubagentTemplate,
			sessionId,
			secrets,
			true,
		);

		const result = await runOldCli(
			["upload", sessionFile, "--endpoint", server.rpcUrl],
			workspace,
		);
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("Upload successful!");
		expect(containsAnyCanary(result.stdout, secrets)).toBe(false);
		expect(containsAnyCanary(result.stderr, secrets)).toBe(false);

		const storedRow = await getStoredFilteredSession(userId, sessionId);
		assert(storedRow);
		const storedSubagent = storedRow.subagents["nested-agent-001"];
		assert(storedSubagent);
		expect(containsAnyCanary(storedRow.content, secrets)).toBe(false);
		expect(containsAnyCanary(storedSubagent, secrets)).toBe(false);
		const storedCombined = `${storedRow.content}\n${storedSubagent}`;
		for (const secret of secrets) {
			expect(storedCombined).toContain(`[REDACTED:${secret.ruleId}]`);
		}
		expect(hashText(storedRow.content)).toBe(hashText(expectedContent));
		expect(hashText(storedSubagent)).toBe(hashText(expectedSubagent));
		expect(storedRow.filter_version).toBe(FILTER_VERSION);

		oldClientUploadProbe = { secrets, sessionId };
	}, 120_000);

	test("old-then-new uploads of the identical dirty session converge on one row", async () => {
		const sessionId = `skew_dedupe_${crypto.randomUUID()}`;
		// Minimum user/assistant timestamp in the realistic claude fixture.
		const sessionDate = "2026-07-24 16:00:00.000";
		const secrets = createClaudeFixtureSecrets();
		const workspace = await createSkewWorkspace(sessionId);
		const sessionFile = await writeRealisticDirtySession(
			workspace,
			sessionId,
			secrets,
		);

		const oldResult = await runOldCli(
			["upload", sessionFile, "--endpoint", server.rpcUrl],
			workspace,
		);
		expect(oldResult.exitCode).toBe(0);
		expect(oldResult.stdout).toContain("Upload successful!");
		expect(await getPhysicalSessionCount(userId, sessionDate, sessionId)).toBe(
			1,
		);
		const hashAfterOldUpload = await getStoredContentHash(userId, sessionId);
		assert(hashAfterOldUpload);
		expect(hashAfterOldUpload).toHaveLength(64);

		// The new artifact filters the same raw file client-side before sending.
		// Post-filter server hashing must recognize both requests as one session.
		const newResult = await runBuiltCli(
			["upload", sessionFile, "--endpoint", server.rpcUrl],
			workspace,
		);
		expect(newResult.exitCode).toBe(0);
		expect(newResult.stdout).toContain("Upload successful!");
		expect(containsAnyCanary(newResult.stdout, secrets)).toBe(false);

		expect(await getPhysicalSessionCount(userId, sessionDate, sessionId)).toBe(
			1,
		);
		expect(await getStoredContentHash(userId, sessionId)).toBe(
			hashAfterOldUpload,
		);
	}, 120_000);

	test("old CLI renders the unknown budget 422 as a clean one-line failure", async () => {
		const sessionId = `skew_budget_manual_${crypto.randomUUID()}`;
		const canarySecret = createOpenAiCanarySecret();
		const workspace = await createSkewWorkspace(sessionId);
		const sessionFile = join(workspace.projectDir, `${sessionId}.jsonl`);
		await writeFile(sessionFile, createOverBudgetContent(canarySecret.value));

		const result = await runOldCli(
			["upload", sessionFile, "--endpoint", server.rpcUrl],
			workspace,
		);

		// 0.1.17 has never heard of REDACTION_BUDGET_EXCEEDED. Its uploader falls
		// through to the generic ORPCError branch (`${status} ${message}`) and the
		// upload command returns (not throws) an Error, which stricli prints as
		// message-only. Empirically pinned: a single clean line, no stack frames,
		// no raw ORPCError dump.
		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain("Upload failed:");
		expect(result.stderr).toContain(
			`Upload failed: 422 ${REDACTION_BUDGET_EXCEEDED_MESSAGE}`,
		);
		expect(result.stderr).not.toMatch(/at .*\(|ORPCError/);
		expect(containsAnyCanary(result.stdout, [canarySecret])).toBe(false);
		expect(containsAnyCanary(result.stderr, [canarySecret])).toBe(false);

		expect(await getStoredFilteredSession(userId, sessionId)).toBeNull();
		expect(await getStoredContentHash(userId, sessionId)).toBeNull();
	}, 90_000);

	test("old CLI SessionEnd hook swallows the budget 422 and queues the session", async () => {
		const sessionId = `skew_budget_hook_${crypto.randomUUID()}`;
		const canarySecret = createOpenAiCanarySecret();
		const workspace = await createSkewWorkspace(sessionId);
		const sessionFile = join(workspace.projectDir, `${sessionId}.jsonl`);
		await writeFile(sessionFile, createOverBudgetContent(canarySecret.value));

		const result = await runOldCli(["hooks", "claude", "session-end"], {
			...workspace,
			env: { RUDEL_API_BASE: server.baseUrl },
			stdin: JSON.stringify({
				session_id: sessionId,
				transcript_path: sessionFile,
				cwd: workspace.projectDir,
			}),
		});

		// Hooks must never break the agent: transport/API failures exit 0.
		expect(result.exitCode).toBe(0);

		// 0.1.17 predates the RUDEL_CONFIG_DIR-aware failed-uploads path: its
		// queue and hook log are derived from homedir() alone. The workspace
		// keeps RUDEL_CONFIG_DIR outside $HOME/.rudel, so these files existing
		// under $HOME/.rudel proves where the old binary actually writes.
		const [queueRaw, hookLog] = await Promise.all([
			readFile(join(workspace.home, ".rudel", "failed-uploads.json"), "utf8"),
			readFile(
				join(workspace.home, ".rudel", "logs", "hook-upload.log"),
				"utf8",
			),
		]);
		const queue = JSON.parse(queueRaw) as {
			failures: Array<{ error?: string; sessionId: string }>;
		};
		const queued = queue.failures.find(
			(failure) => failure.sessionId === sessionId,
		);
		assert(queued);
		expect(queued.error).toBe(`422 ${REDACTION_BUDGET_EXCEEDED_MESSAGE}`);
		// 0.1.17's LogTape renders placeholders quoted: session '<id>': '<error>'.
		expect(hookLog).toContain(
			`Upload failed for session '${sessionId}': '422 ${REDACTION_BUDGET_EXCEEDED_MESSAGE}'`,
		);
		expect(containsAnyCanary(queueRaw, [canarySecret])).toBe(false);
		expect(containsAnyCanary(hookLog, [canarySecret])).toBe(false);
		expect(containsAnyCanary(result.stdout, [canarySecret])).toBe(false);
		expect(containsAnyCanary(result.stderr, [canarySecret])).toBe(false);

		expect(await getStoredFilteredSession(userId, sessionId)).toBeNull();
	}, 90_000);

	test("old CLI hook clean path uploads, stamps the filter version, leaves no queue", async () => {
		const sessionId = `skew_hook_clean_${crypto.randomUUID()}`;
		const workspace = await createSkewWorkspace(sessionId);
		const sessionFile = join(workspace.projectDir, `${sessionId}.jsonl`);
		const cleanContent = createCleanContent();
		await writeFile(sessionFile, cleanContent);

		const result = await runOldCli(["hooks", "claude", "session-end"], {
			...workspace,
			env: { RUDEL_API_BASE: server.baseUrl },
			stdin: JSON.stringify({
				session_id: sessionId,
				transcript_path: sessionFile,
				cwd: workspace.projectDir,
			}),
		});
		expect(result.exitCode).toBe(0);

		const hookLog = await readFile(
			join(workspace.home, ".rudel", "logs", "hook-upload.log"),
			"utf8",
		);
		// 0.1.17's LogTape renders the session id placeholder in single quotes.
		expect(hookLog).toContain(`Upload successful for session '${sessionId}'`);

		// A clean run never records a failure, so the queue file is never created.
		expect(
			await Bun.file(
				join(workspace.home, ".rudel", "failed-uploads.json"),
			).exists(),
		).toBe(false);

		const storedRow = await getStoredFilteredSession(userId, sessionId);
		assert(storedRow);
		// Zero redactions still get the server's filter-version stamp.
		expect(storedRow.filter_version).toBe(FILTER_VERSION);
		expect(storedRow.content).toBe(cleanContent);
	}, 90_000);

	test("old CLI prints an intact summary despite unknown response fields", async () => {
		const sessionId = `skew_summary_${crypto.randomUUID()}`;
		const canarySecret = createOpenAiCanarySecret();
		const workspace = await createSkewWorkspace(sessionId);
		const sessionFile = join(workspace.projectDir, `${sessionId}.jsonl`);
		await writeFile(
			sessionFile,
			createDirtyUnderBudgetContent(canarySecret.value),
		);

		// The server responds with `redacted`/`redactedBytes`, which 0.1.17 has
		// never heard of. Its summary must stay intact — no "undefined"/"NaN"
		// interpolation, ending on the plain success line.
		const result = await runOldCli(
			["upload", sessionFile, "--endpoint", server.rpcUrl],
			workspace,
		);
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("Upload successful!");
		expect(result.stdout.trimEnd().endsWith("Upload successful!")).toBe(true);
		expect(result.stdout).not.toContain("undefined");
		expect(result.stdout).not.toContain("NaN");
		expect(containsAnyCanary(result.stdout, [canarySecret])).toBe(false);

		const storedRow = await getStoredFilteredSession(userId, sessionId);
		assert(storedRow);
		expect(storedRow.content).toContain("[REDACTED:openai-api-key]");
	}, 90_000);

	test("analytics row from the old-client upload is canary-free with the current filter version", async () => {
		// Reuses the server-only-filtered upload from the dirty-transcript test:
		// the analytics MV must propagate the server's stamp for old clients too.
		assert(oldClientUploadProbe);
		const { secrets, sessionId } = oldClientUploadProbe;

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
		expect(analytics.content).toContain("[REDACTED:");
		expect(analytics.filter_version).toBe(FILTER_VERSION);
	}, 90_000);
});

function runOldCli(
	args: readonly string[],
	options: Omit<BuiltCliOptions, "cliPath">,
): Promise<BuiltCliResult> {
	return runBuiltCli(args, { ...options, cliPath: OLD_CLI_PATH });
}

/**
 * Per-test sandbox. RUDEL_CONFIG_DIR (credentials) deliberately lives outside
 * $HOME/.rudel so that anything appearing under $HOME/.rudel is provably
 * derived from homedir() by the binary under test. The project dir name has no
 * dashes so both CLI generations decode the identical project path without
 * probing the real filesystem.
 */
async function createSkewWorkspace(name: string): Promise<SkewWorkspace> {
	const home = join(tempDir, name);
	const configDir = join(home, "rudel-config");
	const projectDir = join(home, "skewproj");
	await Promise.all([
		mkdir(configDir, { recursive: true }),
		mkdir(projectDir, { recursive: true }),
	]);
	await writeCliCredentials(configDir, bearerToken, server.baseUrl);
	return { configDir, home, projectDir };
}

async function writeRealisticDirtySession(
	workspace: SkewWorkspace,
	sessionId: string,
	secrets: readonly FixtureSecret[],
): Promise<string> {
	const sessionFile = join(workspace.projectDir, `${sessionId}.jsonl`);
	const subagentDir = join(workspace.projectDir, sessionId, "subagents");
	await mkdir(subagentDir, { recursive: true });
	await Promise.all([
		writeFile(
			sessionFile,
			renderFixture(claudeSessionTemplate, sessionId, secrets, false),
		),
		writeFile(
			join(subagentDir, "agent-nested-agent-001.jsonl"),
			renderFixture(claudeSubagentTemplate, sessionId, secrets, false),
		),
	]);
	return sessionFile;
}

function createOpenAiCanarySecret(): FixtureSecret {
	const [openAiSecret] = createClaudeFixtureSecrets();
	assert(openAiSecret);
	return openAiSecret;
}

/** A transcript that is almost entirely secret: far above the 20% budget. */
function createOverBudgetContent(canary: string): string {
	return JSON.stringify({
		message: { content: canary, role: "user" },
		timestamp: "2026-07-24T16:30:00.000Z",
		type: "user",
	});
}

/** One redactable secret diluted with benign text: safely under the budget. */
function createDirtyUnderBudgetContent(canary: string): string {
	return JSON.stringify({
		message: { content: `Use ${canary}`, role: "user" },
		notes: "Benign transcript context. ".repeat(20),
		timestamp: "2026-07-24T16:00:00.000Z",
		type: "user",
	});
}

function createCleanContent(): string {
	return [
		JSON.stringify({
			message: { content: "Refactor the config loader", role: "user" },
			timestamp: "2026-07-24T17:00:00.000Z",
			type: "user",
		}),
		JSON.stringify({
			message: {
				content: "Done. The loader now validates its input.",
				role: "assistant",
				usage: { input_tokens: 5, output_tokens: 9 },
			},
			timestamp: "2026-07-24T17:00:05.000Z",
			type: "assistant",
		}),
	].join("\n");
}
