import { afterAll, expect, test } from "bun:test";
import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createCliFixture, HOOK_CASES, runCli } from "./helpers/ingest-stub.js";

const fixtureHomes: string[] = [];

afterAll(async () => {
	await Promise.all(
		fixtureHomes.map((home) => rm(home, { force: true, recursive: true })),
	);
});

test.each(HOOK_CASES)(
	"$name skips transport when automatic upload is off for the repository",
	async (hookCase) => {
		const fixture = await createCliFixture(hookCase.source);
		fixtureHomes.push(fixture.home);
		await writeFile(
			join(fixture.home, ".rudel", "auto-upload.json"),
			JSON.stringify({ repositories: {}, version: 1 }),
		);
		const invocation = hookCase.buildInvocation(fixture);

		const result = await runCli(invocation.command, fixture, {
			env: { OPALINE_API_BASE: "http://127.0.0.1:1" },
			stdin: invocation.stdin,
		});

		expect(result.exitCode).toBe(0);
		expect(result.stderr).toBe("");
	},
);
