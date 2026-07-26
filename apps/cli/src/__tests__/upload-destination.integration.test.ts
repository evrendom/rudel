import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const MONOREPO_ROOT = resolve(import.meta.dir, "..", "..", "..", "..");
const CLI_PATH = resolve(import.meta.dir, "..", "bin", "cli.ts");
const TEST_TOKEN = "endpoint-security-test-token";

interface HookCase {
	readonly name: string;
	readonly command: readonly string[];
	readonly source: "claude_code" | "codex";
	buildInput(options: {
		sessionId: string;
		transcriptPath: string;
		projectPath: string;
	}): string;
}

interface CliFixture {
	readonly home: string;
	readonly projectPath: string;
	readonly sessionId: string;
	readonly transcriptPath: string;
}

interface CliResult {
	readonly exitCode: number;
	readonly stderr: string;
	readonly stdout: string;
}

const HOOK_CASES: readonly HookCase[] = [
	{
		name: "Claude Code SessionEnd",
		command: ["hooks", "claude", "session-end"],
		source: "claude_code",
		buildInput: ({ sessionId, transcriptPath, projectPath }) =>
			JSON.stringify({
				session_id: sessionId,
				transcript_path: transcriptPath,
				cwd: projectPath,
				hook_event_name: "SessionEnd",
				reason: "other",
			}),
	},
	{
		name: "Codex turn-complete",
		command: ["hooks", "codex", "turn-complete"],
		source: "codex",
		buildInput: ({ sessionId, transcriptPath, projectPath }) =>
			JSON.stringify({
				type: "agent-turn-complete",
				thread_id: sessionId,
				turn_id: "test-turn",
				cwd: projectPath,
				transcript_path: transcriptPath,
			}),
	},
];

function startIngestStub() {
	const requests: Array<{
		readonly apiKey: string | null;
		readonly pathname: string;
	}> = [];
	const server = Bun.serve({
		hostname: "0.0.0.0",
		port: 0,
		fetch(request) {
			const url = new URL(request.url);
			requests.push({
				apiKey: request.headers.get("x-api-key"),
				pathname: url.pathname,
			});
			return Response.json({
				json: {
					success: true,
					sessionId: "stub-session",
				},
			});
		},
	});

	return {
		requests,
		server,
		nonLoopbackBase: `http://0.0.0.0:${server.port}`,
		loopbackBase: `http://127.0.0.1:${server.port}`,
	};
}

async function createCliFixture(
	source: HookCase["source"],
): Promise<CliFixture> {
	const home = await mkdtemp(join(tmpdir(), "rudel-endpoint-security-"));
	const configDir = join(home, ".rudel");
	const projectPath = join(home, "project");
	const sessionId = `${source}-endpoint-security-session`;
	const transcriptPath = join(projectPath, `${sessionId}.jsonl`);
	await Promise.all([
		mkdir(configDir, { recursive: true }),
		mkdir(projectPath, { recursive: true }),
	]);
	await Promise.all([
		writeFile(
			join(configDir, "credentials.json"),
			JSON.stringify({
				token: TEST_TOKEN,
				apiBaseUrl: "https://stored.example",
				authType: "api-key",
			}),
		),
		writeFile(
			transcriptPath,
			[
				JSON.stringify({
					type: source === "codex" ? "session_meta" : "summary",
					sessionId,
					payload: { id: sessionId, cwd: projectPath },
				}),
				JSON.stringify({
					type: "message",
					role: "human",
					content: "endpoint security integration test",
				}),
			].join("\n"),
		),
	]);

	return { home, projectPath, sessionId, transcriptPath };
}

async function runCli(
	args: readonly string[],
	fixture: CliFixture,
	options: {
		readonly stdin?: string;
		readonly env?: Readonly<Record<string, string>>;
	} = {},
): Promise<CliResult> {
	const proc = Bun.spawn(["bun", CLI_PATH, ...args], {
		cwd: MONOREPO_ROOT,
		env: {
			...process.env,
			HOME: fixture.home,
			RUDEL_CONFIG_DIR: join(fixture.home, ".rudel"),
			POSTHOG_ENABLED: "false",
			...options.env,
		},
		stdin: "pipe",
		stdout: "pipe",
		stderr: "pipe",
	});
	proc.stdin.write(options.stdin ?? "");
	proc.stdin.end();

	const [exitCode, stdout, stderr] = await Promise.all([
		proc.exited,
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
	]);
	return { exitCode, stdout, stderr };
}

test("upload --endpoint refuses plaintext non-loopback without an opt-in", async () => {
	const stub = startIngestStub();
	const fixture = await createCliFixture("claude_code");
	try {
		const result = await runCli(
			[
				"upload",
				fixture.transcriptPath,
				"--endpoint",
				`${stub.nonLoopbackBase}/rpc`,
			],
			fixture,
			{ env: { RUDEL_ALLOW_INSECURE_ENDPOINT: "" } },
		);

		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain("Upload endpoint refused");
		expect(result.stderr).toContain("--allow-insecure-endpoint");
		expect(result.stderr).not.toContain(TEST_TOKEN);
		expect(stub.requests).toHaveLength(0);
	} finally {
		await stub.server.stop(true);
		await rm(fixture.home, { recursive: true, force: true });
	}
}, 30_000);

test("upload --allow-insecure-endpoint permits an opted-in plaintext destination", async () => {
	const stub = startIngestStub();
	const fixture = await createCliFixture("claude_code");
	try {
		const result = await runCli(
			[
				"upload",
				fixture.transcriptPath,
				"--endpoint",
				`${stub.nonLoopbackBase}/rpc`,
				"--allow-insecure-endpoint",
			],
			fixture,
			{ env: { RUDEL_ALLOW_INSECURE_ENDPOINT: "" } },
		);

		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("Upload successful!");
		expect(stub.requests).toEqual([
			{
				apiKey: TEST_TOKEN,
				pathname: "/rpc/ingestSession",
			},
		]);
	} finally {
		await stub.server.stop(true);
		await rm(fixture.home, { recursive: true, force: true });
	}
}, 30_000);

test("upload --endpoint permits loopback plaintext without an opt-in", async () => {
	const stub = startIngestStub();
	const fixture = await createCliFixture("claude_code");
	try {
		const result = await runCli(
			[
				"upload",
				fixture.transcriptPath,
				"--endpoint",
				`${stub.loopbackBase}/rpc`,
			],
			fixture,
			{ env: { RUDEL_ALLOW_INSECURE_ENDPOINT: "" } },
		);

		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("Upload successful!");
		expect(stub.requests).toHaveLength(1);
	} finally {
		await stub.server.stop(true);
		await rm(fixture.home, { recursive: true, force: true });
	}
}, 30_000);

test.each(
	HOOK_CASES,
)("$name refuses an unsafe RUDEL_API_BASE observably and queues the session", async (hookCase) => {
	const stub = startIngestStub();
	const fixture = await createCliFixture(hookCase.source);
	try {
		const result = await runCli(hookCase.command, fixture, {
			stdin: hookCase.buildInput(fixture),
			env: {
				RUDEL_API_BASE: stub.nonLoopbackBase,
				RUDEL_ALLOW_INSECURE_ENDPOINT: "",
			},
		});

		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain("Rudel hook upload refused");
		expect(result.stderr).toContain('plaintext http: to "0.0.0.0"');
		expect(result.stderr).not.toContain(TEST_TOKEN);
		expect(stub.requests).toHaveLength(0);

		const log = await readFile(
			join(fixture.home, ".rudel", "logs", "hook-upload.log"),
			"utf8",
		);
		expect(log).toContain('plaintext http: to "0.0.0.0"');
		expect(log).not.toContain(TEST_TOKEN);

		const failedUploads = await readFile(
			join(fixture.home, ".rudel", "failed-uploads.json"),
			"utf8",
		);
		expect(failedUploads).toContain(fixture.sessionId);
		expect(failedUploads).toContain(hookCase.source);
	} finally {
		await stub.server.stop(true);
		await rm(fixture.home, { recursive: true, force: true });
	}
}, 30_000);

test.each(
	HOOK_CASES,
)("$name honors RUDEL_ALLOW_INSECURE_ENDPOINT=1", async (hookCase) => {
	const stub = startIngestStub();
	const fixture = await createCliFixture(hookCase.source);
	try {
		const result = await runCli(hookCase.command, fixture, {
			stdin: hookCase.buildInput(fixture),
			env: {
				RUDEL_API_BASE: stub.nonLoopbackBase,
				RUDEL_ALLOW_INSECURE_ENDPOINT: "1",
			},
		});

		expect(result.exitCode).toBe(0);
		expect(result.stderr).toBe("");
		expect(stub.requests).toEqual([
			{
				apiKey: TEST_TOKEN,
				pathname: "/rpc/ingestSession",
			},
		]);
	} finally {
		await stub.server.stop(true);
		await rm(fixture.home, { recursive: true, force: true });
	}
}, 30_000);
