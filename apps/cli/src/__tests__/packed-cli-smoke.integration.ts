import { expect, test } from "bun:test";
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { FILTER_VERSION } from "@rudel/secret-filter";
import {
	containsAnyCanary,
	createClaudeFixtureSecrets,
	createCodexFixtureSecrets,
	EXPECTED_CLAUDE_REDACTION_SUMMARY,
	type FixtureSecret,
	getNodeMajorVersion,
	readRedactionTemplates,
	renderFixture,
	runBuiltCli,
} from "./helpers/cli-e2e.js";
import {
	type CliFixture,
	createCliFixture,
	HOOK_CASES,
	INGEST_STUB_TEST_TOKEN,
	startIngestStub,
} from "./helpers/ingest-stub.js";

/**
 * Axis D — packed-artifact smoke. Drives the npm-pack-installed CLI artifact
 * (dist/cli.js from the tarball) on the ambient Node runtime against loopback
 * ingest stubs. Zero infrastructure.
 *
 * This file is deliberately NOT in any test:integration script. Invoke it
 * explicitly with the artifact path exported:
 *
 *   RUDEL_PACKED_CLI=/abs/path/to/package/dist/cli.js \
 *     bun test ./src/__tests__/packed-cli-smoke.integration.ts
 *
 * RUDEL_PACKED_CLI is mandatory: every test hard-fails when it is missing so
 * a misconfigured run can never silently pass (or silently fall back to the
 * workspace dist build).
 */

const AWS_CANARY = "AKIACANARY234567ABCD";
const templates = await readRedactionTemplates();

function requirePackedCliPath(): string {
	const packedCliPath = process.env.RUDEL_PACKED_CLI;
	expect(packedCliPath).toBeTruthy();
	return packedCliPath as string;
}

function fixtureConfigDir(fixture: CliFixture): string {
	return join(fixture.home, ".rudel");
}

function assertFilteredWireBody(
	wireBody: string,
	secrets: readonly FixtureSecret[],
): void {
	expect(wireBody.length).toBeGreaterThan(0);
	expect(containsAnyCanary(wireBody, secrets)).toBe(false);
	for (const secret of secrets) {
		expect(wireBody).toContain(`[REDACTED:${secret.ruleId}]`);
	}
	expect(wireBody).toContain(`"filter_version":${FILTER_VERSION}`);
	const parsed = JSON.parse(wireBody) as {
		json?: { filter_version?: unknown };
	};
	expect(parsed.json?.filter_version).toBe(FILTER_VERSION);
}

test("RUDEL_PACKED_CLI points at an existing absolute artifact on Node >= 20", async () => {
	const packedCliPath = requirePackedCliPath();
	expect(isAbsolute(packedCliPath)).toBe(true);
	await access(packedCliPath);
	expect(await getNodeMajorVersion()).toBeGreaterThanOrEqual(20);
});

test("--version matches the workspace package.json version", async () => {
	const packedCliPath = requirePackedCliPath();
	const packageJson = JSON.parse(
		await readFile(join(import.meta.dir, "..", "..", "package.json"), "utf8"),
	) as { version?: unknown };
	expect(typeof packageJson.version).toBe("string");

	const fixture = await createCliFixture("claude_code");
	try {
		const result = await runBuiltCli(["--version"], {
			home: fixture.home,
			configDir: fixtureConfigDir(fixture),
			cliPath: packedCliPath,
		});

		expect(result.exitCode).toBe(0);
		expect(result.stdout.trim()).toBe(packageJson.version as string);
	} finally {
		await rm(fixture.home, { recursive: true, force: true });
	}
}, 60_000);

test("clean upload succeeds and stamps the current filter_version on the wire", async () => {
	const packedCliPath = requirePackedCliPath();
	const stub = startIngestStub();
	const fixture = await createCliFixture("claude_code");
	try {
		const result = await runBuiltCli(
			[
				"upload",
				fixture.transcriptPath,
				"--endpoint",
				`${stub.loopbackBase}/rpc`,
			],
			{
				home: fixture.home,
				configDir: fixtureConfigDir(fixture),
				cliPath: packedCliPath,
				env: { RUDEL_ALLOW_INSECURE_ENDPOINT: "" },
			},
		);

		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("Upload successful!");
		expect(result.stdout).not.toContain("matching known secret patterns");
		expect(stub.requests).toEqual([
			{ apiKey: INGEST_STUB_TEST_TOKEN, pathname: "/rpc/ingestSession" },
		]);
		const wireBody = stub.bodies[0] ?? "";
		expect(wireBody).toContain(`"filter_version":${FILTER_VERSION}`);
		const parsed = JSON.parse(wireBody) as {
			json?: { filter_version?: unknown };
		};
		expect(parsed.json?.filter_version).toBe(FILTER_VERSION);
	} finally {
		await stub.server.stop(true);
		await rm(fixture.home, { recursive: true, force: true });
	}
}, 60_000);

test("dirty upload is filtered client-side on this Node runtime", async () => {
	// The test class that would have caught the Node 20 (?i:) filter crash:
	// the packed artifact must compile every rule and redact on the ambient
	// Node, with markers (and zero canaries) visible in the stub's wire body.
	const packedCliPath = requirePackedCliPath();
	const stub = startIngestStub();
	const secrets = createClaudeFixtureSecrets();
	const fixture = await createCliFixture("claude_code");
	try {
		const subagentDir = join(
			fixture.projectPath,
			fixture.sessionId,
			"subagents",
		);
		await mkdir(subagentDir, { recursive: true });
		await writeFile(
			fixture.transcriptPath,
			renderFixture(templates.claudeSession, fixture.sessionId, secrets, false),
		);
		await writeFile(
			join(subagentDir, "agent-nested-agent-001.jsonl"),
			renderFixture(
				templates.claudeSubagent,
				fixture.sessionId,
				secrets,
				false,
			),
		);

		const result = await runBuiltCli(
			[
				"upload",
				fixture.transcriptPath,
				"--endpoint",
				`${stub.loopbackBase}/rpc`,
			],
			{
				home: fixture.home,
				configDir: fixtureConfigDir(fixture),
				cliPath: packedCliPath,
				env: { RUDEL_ALLOW_INSECURE_ENDPOINT: "" },
			},
		);

		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("Upload successful!");
		expect(result.stdout).toContain(EXPECTED_CLAUDE_REDACTION_SUMMARY);
		expect(containsAnyCanary(result.stdout, secrets)).toBe(false);
		expect(containsAnyCanary(result.stderr, secrets)).toBe(false);
		expect(stub.requests).toHaveLength(1);
		assertFilteredWireBody(stub.bodies[0] ?? "", secrets);
	} finally {
		await stub.server.stop(true);
		await rm(fixture.home, { recursive: true, force: true });
	}
}, 60_000);

test("over-budget transcript aborts with zero requests seen", async () => {
	const packedCliPath = requirePackedCliPath();
	const stub = startIngestStub();
	const fixture = await createCliFixture("claude_code");
	try {
		// Keep the fixture valid for timestamp extraction while making the secret
		// large enough to exceed the 20% budget before any transport attempt.
		await writeFile(
			fixture.transcriptPath,
			JSON.stringify({
				type: "user",
				timestamp: "2026-07-31T10:00:00.000Z",
				message: `${AWS_CANARY} ${AWS_CANARY}`,
			}),
		);

		const result = await runBuiltCli(
			[
				"upload",
				fixture.transcriptPath,
				"--endpoint",
				`${stub.loopbackBase}/rpc`,
			],
			{
				home: fixture.home,
				configDir: fixtureConfigDir(fixture),
				cliPath: packedCliPath,
				env: { RUDEL_ALLOW_INSECURE_ENDPOINT: "" },
			},
		);

		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain("Upload failed:");
		expect(result.stderr).toContain("Redaction safety check stopped upload");
		expect(result.stderr).toContain("above the 20% transcript budget");
		expect(result.stderr).not.toContain(AWS_CANARY);
		expect(result.stdout).not.toContain(AWS_CANARY);
		expect(stub.requests).toHaveLength(0);
	} finally {
		await stub.server.stop(true);
		await rm(fixture.home, { recursive: true, force: true });
	}
}, 60_000);

test("timestamp-less single upload reports a friendly error", async () => {
	const packedCliPath = requirePackedCliPath();
	const stub = startIngestStub();
	const fixture = await createCliFixture("claude_code");
	try {
		await writeFile(
			fixture.transcriptPath,
			JSON.stringify({ type: "user", message: "No timestamp" }),
		);

		const result = await runBuiltCli(
			[
				"upload",
				fixture.transcriptPath,
				"--endpoint",
				`${stub.loopbackBase}/rpc`,
			],
			{
				home: fixture.home,
				configDir: fixtureConfigDir(fixture),
				cliPath: packedCliPath,
				env: { RUDEL_ALLOW_INSECURE_ENDPOINT: "" },
			},
		);

		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain(
			"This transcript has no timestamped user/assistant messages, so it cannot be uploaded.",
		);
		expect(result.stderr).not.toContain("MissingTranscriptTimestampError");
		expect(result.stderr).not.toContain("at ClaudeCodeAdapter");
		expect(stub.requests).toHaveLength(0);
	} finally {
		await stub.server.stop(true);
		await rm(fixture.home, { recursive: true, force: true });
	}
}, 60_000);

test.each(
	HOOK_CASES,
)("$name uploads a filtered transcript through the packed artifact", async (hookCase) => {
	const packedCliPath = requirePackedCliPath();
	const stub = startIngestStub();
	const secrets =
		hookCase.source === "codex"
			? createCodexFixtureSecrets()
			: createClaudeFixtureSecrets();
	const fixture = await createCliFixture(hookCase.source);
	try {
		if (hookCase.source === "codex") {
			await writeFile(
				fixture.transcriptPath,
				renderFixture(
					templates.codexSession,
					fixture.sessionId,
					secrets,
					false,
				),
			);
		} else {
			const subagentDir = join(
				fixture.projectPath,
				fixture.sessionId,
				"subagents",
			);
			await mkdir(subagentDir, { recursive: true });
			await writeFile(
				fixture.transcriptPath,
				renderFixture(
					templates.claudeSession,
					fixture.sessionId,
					secrets,
					false,
				),
			);
			await writeFile(
				join(subagentDir, "agent-nested-agent-001.jsonl"),
				renderFixture(
					templates.claudeSubagent,
					fixture.sessionId,
					secrets,
					false,
				),
			);
		}

		const result = await runBuiltCli([...hookCase.command], {
			home: fixture.home,
			configDir: fixtureConfigDir(fixture),
			cliPath: packedCliPath,
			stdin: hookCase.buildInput(fixture),
			env: {
				RUDEL_API_BASE: stub.loopbackBase,
				RUDEL_ALLOW_INSECURE_ENDPOINT: "",
			},
		});

		expect(result.exitCode).toBe(0);
		expect(containsAnyCanary(result.stdout, secrets)).toBe(false);
		expect(containsAnyCanary(result.stderr, secrets)).toBe(false);
		expect(stub.requests).toEqual([
			{ apiKey: INGEST_STUB_TEST_TOKEN, pathname: "/rpc/ingestSession" },
		]);
		assertFilteredWireBody(stub.bodies[0] ?? "", secrets);
	} finally {
		await stub.server.stop(true);
		await rm(fixture.home, { recursive: true, force: true });
	}
}, 60_000);

test("plaintext non-loopback endpoint is refused before any request", async () => {
	const packedCliPath = requirePackedCliPath();
	const stub = startIngestStub();
	const fixture = await createCliFixture("claude_code");
	try {
		const result = await runBuiltCli(
			[
				"upload",
				fixture.transcriptPath,
				"--endpoint",
				`${stub.nonLoopbackBase}/rpc`,
			],
			{
				home: fixture.home,
				configDir: fixtureConfigDir(fixture),
				cliPath: packedCliPath,
				env: { RUDEL_ALLOW_INSECURE_ENDPOINT: "" },
			},
		);

		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain("Upload endpoint refused");
		expect(result.stderr).toContain("--allow-insecure-endpoint");
		expect(result.stderr).not.toContain(INGEST_STUB_TEST_TOKEN);
		expect(stub.requests).toHaveLength(0);
	} finally {
		await stub.server.stop(true);
		await rm(fixture.home, { recursive: true, force: true });
	}
}, 60_000);
