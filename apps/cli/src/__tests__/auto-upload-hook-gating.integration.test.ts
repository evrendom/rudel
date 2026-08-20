import { afterAll, expect, test } from "bun:test";
import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
	createCliFixture,
	HOOK_CASES,
	runCli,
	startIngestStub,
} from "./helpers/ingest-stub.js";

const fixtureHomes: string[] = [];

afterAll(async () => {
	await Promise.all(
		fixtureHomes.map((home) => rm(home, { force: true, recursive: true })),
	);
});

test.each(
	HOOK_CASES,
)("$name skips transport when automatic upload is off for the repository", async (hookCase) => {
	const fixture = await createCliFixture(hookCase.source);
	fixtureHomes.push(fixture.home);
	await writeFile(
		join(fixture.home, ".rudel", "auto-upload.json"),
		JSON.stringify({ repositories: {}, version: 1 }),
	);
	const stub = startIngestStub();
	const invocation = hookCase.buildInvocation(fixture);

	const result = await runCli(invocation.command, fixture, {
		env: { RUDEL_API_BASE: stub.loopbackBase },
		stdin: invocation.stdin,
	});
	stub.server.stop(true);

	expect(result.exitCode).toBe(0);
	expect(result.stderr).toBe("");
	expect(stub.requests).toEqual([]);
});
