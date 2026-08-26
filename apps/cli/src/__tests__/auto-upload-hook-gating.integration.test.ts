import { afterAll, expect, test } from "bun:test";
import { readFile, rm, writeFile } from "node:fs/promises";
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
		const fetchLogPath = join(fixture.home, "fetch-counter.log");
		await writeFile(fetchLogPath, "");
		const fetchCounterPreload = join(
			import.meta.dir,
			"helpers",
			"fetch-counter-preload.ts",
		);

		const result = await runCli(invocation.command, fixture, {
			// A preload runs in the spawned CLI process, records its own startup,
			// and synchronously logs every fetch without requiring a socket listener.
			env: {
				OPALINE_API_BASE: "https://transport.invalid",
				OPALINE_TEST_FETCH_LOG: fetchLogPath,
			},
			preload: fetchCounterPreload,
			stdin: invocation.stdin,
		});

		expect(result.exitCode).toBe(0);
		expect(result.stderr).toBe("");
		expect(await readFile(fetchLogPath, "utf8")).toBe("preloaded\n");
	},
);
