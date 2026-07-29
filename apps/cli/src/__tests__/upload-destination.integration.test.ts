import { expect, test } from "bun:test";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import {
	createCliFixture,
	HOOK_CASES,
	INGEST_STUB_TEST_TOKEN,
	runCli,
	startIngestStub,
} from "./helpers/ingest-stub.js";

const TEST_TOKEN = INGEST_STUB_TEST_TOKEN;

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
