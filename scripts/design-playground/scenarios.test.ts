import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { getPlaygroundPaths } from "./paths.js";
import { buildChildEnvironment } from "./run-scenario.js";
import { parseScenarioInvocation, validateScenario } from "./safety.js";
import { mirrorCredentialsForPlayground, prepareSandbox } from "./sandbox.js";
import { SCENARIOS } from "./scenarios.js";
import type { Scenario } from "./types.js";

const LOOPBACK_BASE = "http://127.0.0.1:41234";
let runtimeRoot: string;
let previousRuntimeRoot: string | undefined;

beforeAll(async () => {
	runtimeRoot = await mkdtemp(join(tmpdir(), "rudel-design-playground-"));
	previousRuntimeRoot = process.env.RUDEL_PLAYGROUND_RUNTIME_DIR;
	process.env.RUDEL_PLAYGROUND_RUNTIME_DIR = runtimeRoot;
});

afterAll(async () => {
	if (previousRuntimeRoot === undefined) {
		delete process.env.RUDEL_PLAYGROUND_RUNTIME_DIR;
	} else {
		process.env.RUDEL_PLAYGROUND_RUNTIME_DIR = previousRuntimeRoot;
	}
	await rm(runtimeRoot, { recursive: true, force: true });
});

describe("design playground scenarios", () => {
	test("every registered scenario is unique and passes the safety model", () => {
		const names = new Set<string>();
		for (const scenario of SCENARIOS) {
			validateScenario(scenario, LOOPBACK_BASE);
			names.add(scenario.name);
		}

		expect(names.size).toBe(SCENARIOS.length);
	});

	test("rejects unknown names and extra argument forwarding", () => {
		expect(() => parseScenarioInvocation(["missing"])).toThrow(
			"Unknown scenario",
		);
		expect(() => parseScenarioInvocation(["picker-happy", "--help"])).toThrow(
			"Extra arguments are never forwarded",
		);
	});

	test("rejects forbidden local-real commands and non-loopback endpoints", () => {
		const forbidden = createScenario({
			name: "forbidden-login",
			profile: "local-real",
			argv: ["login"],
		});
		const unsafeEndpoint = createScenario({
			name: "unsafe-endpoint",
			profile: "fixture",
			argv: ["upload", "--endpoint", "https://app.rudel.ai/rpc"],
		});

		expect(() => validateScenario(forbidden, LOOPBACK_BASE)).toThrow(
			"forbidden",
		);
		expect(() => validateScenario(unsafeEndpoint, LOOPBACK_BASE)).toThrow(
			"must stay on loopback",
		);
	});

	test("rejects scenario environment values that could bypass the sandbox", () => {
		const unsafeEnvironment = {
			...createScenario({
				name: "unsafe-environment",
				profile: "fixture",
				argv: ["upload"],
			}),
			env: {
				RUDEL_CODEX_CONFIG_PATH: join(homedir(), ".codex", "config.toml"),
			},
		};

		expect(() => validateScenario(unsafeEnvironment, LOOPBACK_BASE)).toThrow(
			"may not set unapproved environment value",
		);
	});

	test("builds a minimal child environment with guarded read and write paths", () => {
		const fixtureScenario = SCENARIOS.find(
			(scenario) => scenario.name === "picker-happy",
		);
		const localScenario = SCENARIOS.find(
			(scenario) => scenario.name === "picker-real",
		);
		if (!fixtureScenario || !localScenario) {
			throw new Error("Expected scenarios are missing");
		}
		const fixturePaths = getPlaygroundPaths("fixture", "standard");
		const localPaths = getPlaygroundPaths("local-real", "standard");

		const fixtureEnv = buildChildEnvironment(
			fixtureScenario,
			fixturePaths,
			LOOPBACK_BASE,
		);
		const localEnv = buildChildEnvironment(
			localScenario,
			localPaths,
			LOOPBACK_BASE,
		);

		expect(fixtureEnv.RUDEL_API_BASE).toBe(LOOPBACK_BASE);
		expect(fixtureEnv.POSTHOG_ENABLED).toBe("false");
		expect(fixtureEnv.RUDEL_CLAUDE_SESSIONS_DIR).toBe(
			fixturePaths.claudeSessions,
		);
		expect(localEnv.RUDEL_CLAUDE_SESSIONS_DIR).toBeUndefined();
		expect(localEnv.RUDEL_CODEX_SESSIONS_DIR).toBeUndefined();
		expect(
			Object.keys(localEnv).some((key) => key.startsWith("POSTHOG_")),
		).toBe(true);
		expect(
			Object.keys(localEnv).filter((key) => key.startsWith("POSTHOG_")),
		).toEqual(["POSTHOG_ENABLED"]);
	});

	test("fixture credentials contain only explicit marker and display fields", async () => {
		const paths = getPlaygroundPaths("fixture", "standard");
		await prepareSandbox("fixture", "standard", "clean", LOOPBACK_BASE, paths);
		const raw = await readFile(
			join(paths.configDir, "credentials.json"),
			"utf8",
		);
		const parsed: unknown = JSON.parse(raw);
		if (!isRecord(parsed)) {
			throw new Error("Fixture credentials were not an object");
		}

		expect(Object.keys(parsed).sort()).toEqual([
			"apiBaseUrl",
			"authType",
			"organizations",
			"token",
			"user",
		]);
		expect(parsed.apiBaseUrl).toBe(LOOPBACK_BASE);
		expect(parsed.token).toBe("rudel-playground-marker-token");
	});

	test("mirrors only picked display fields and never serializes the real token", async () => {
		const realCredentialsPath = join(runtimeRoot, "real-credentials.json");
		const configDir = join(runtimeRoot, "mirrored-state");
		const realToken = "real-token-must-never-cross-the-playground-boundary";
		await mkdir(configDir, { recursive: true });
		await writeFile(
			realCredentialsPath,
			JSON.stringify({
				token: realToken,
				apiBaseUrl: "https://production.invalid",
				authType: "api-key",
				apiKeyId: "real-key-id",
				unexpectedPrivateField: "must-not-be-copied",
				user: {
					id: "real-user",
					email: "real@example.test",
					name: "Real Display Name",
				},
				organizations: [{ id: "real-org", name: "Real Org", slug: "real-org" }],
			}),
		);

		const result = await mirrorCredentialsForPlayground(
			realCredentialsPath,
			configDir,
			LOOPBACK_BASE,
		);
		const mirrored = await readFile(
			join(configDir, "credentials.json"),
			"utf8",
		);

		expect(result.source).toBe("mirrored-real");
		expect(result.identity.user.name).toBe("Real Display Name");
		expect(mirrored).not.toContain(realToken);
		expect(mirrored).not.toContain("must-not-be-copied");
		expect(mirrored).not.toContain("real-key-id");
		expect(mirrored).not.toContain("production.invalid");
		expect(mirrored).toContain(LOOPBACK_BASE);
		expect(mirrored).toContain("rudel-playground-marker-token");
	});
});

interface ScenarioOverrides {
	readonly argv: readonly string[];
	readonly name: string;
	readonly profile: Scenario["profile"];
}

function createScenario(overrides: ScenarioOverrides): Scenario {
	return {
		name: overrides.name,
		label: "Unsafe test scenario",
		description: "Deliberately invalid",
		group: "Errors",
		profile: overrides.profile,
		argv: overrides.argv,
		stubBehavior: "ok",
		env: {},
		fixture: "standard",
		agentState: "clean",
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}
