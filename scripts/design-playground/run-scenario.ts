import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getAllAdapters } from "../../packages/agent-adapters/src/index.js";
import {
	getPlaygroundPaths,
	MONOREPO_ROOT,
	PACKED_CLI_PATH,
	type PlaygroundPaths,
	SOURCE_CLI_PATH,
} from "./paths.js";
import {
	parseScenarioInvocation,
	resolveScenarioArg,
	validateScenario,
} from "./safety.js";
import { prepareSandbox } from "./sandbox.js";
import {
	configurePlaygroundStub,
	type PlaygroundStub,
	startPlaygroundStub,
} from "./stub-server.js";
import type { CliMode, Scenario } from "./types.js";

interface ScenarioRunResult {
	readonly exitCode: number;
	readonly mode: CliMode;
	readonly scenario: Scenario;
}

interface StubConnection {
	readonly base: string;
	readonly owned: PlaygroundStub | null;
	readonly secret: string;
}

export async function runScenario(
	scenario: Scenario,
): Promise<ScenarioRunResult> {
	let ownedStub: PlaygroundStub | null = null;
	const externalStubBase = process.env.RUDEL_PLAYGROUND_STUB_BASE;
	const externalStubSecret = process.env.RUDEL_PLAYGROUND_STUB_SECRET;
	if (
		(externalStubBase && !externalStubSecret) ||
		(!externalStubBase && externalStubSecret)
	) {
		throw new Error("External stub base and secret must be supplied together");
	}

	const stub: StubConnection = externalStubBase
		? {
				base: externalStubBase,
				secret: externalStubSecret ?? "",
				owned: null,
			}
		: await startOwnedStub();
	ownedStub = stub.owned;

	try {
		validateScenario(scenario, stub.base);
		const paths = getPlaygroundPaths(scenario.profile, scenario.fixture);
		const prepared = await prepareSandbox(
			scenario.profile,
			scenario.fixture,
			scenario.agentState,
			stub.base,
			paths,
		);
		await configurePlaygroundStub(
			stub.base,
			stub.secret,
			scenario.stubBehavior,
			prepared.identity,
		);

		const mode = await resolveCliMode(paths);
		if (mode === "packed") await buildPackedCli();
		const argv = scenario.argv.map((argument) =>
			resolveScenarioArg(argument, stub.base),
		);
		const cwd = await resolveScenarioCwd(scenario, paths);
		const command =
			mode === "packed"
				? ["node", PACKED_CLI_PATH, ...argv]
				: ["bun", "run", SOURCE_CLI_PATH, ...argv];

		process.stdout.write(
			`\nRudel CLI playground · ${scenario.label} · ${scenario.profile} · ${mode}\n`,
		);
		process.stdout.write(`All API traffic is pinned to ${stub.base}\n\n`);
		if (prepared.identitySource === "fixture-fallback") {
			process.stdout.write(
				"No cached Rudel display identity was found; using fixture identity with real local sessions.\n\n",
			);
		}

		const child = Bun.spawn(command, {
			cwd,
			env: buildChildEnvironment(scenario, paths, stub.base),
			stdin: "inherit",
			stdout: "inherit",
			stderr: "inherit",
		});
		const exitCode = await child.exited;
		return { exitCode, mode, scenario };
	} finally {
		await ownedStub?.stop();
	}
}

export function buildChildEnvironment(
	scenario: Scenario,
	paths: PlaygroundPaths,
	stubBase: string,
): Record<string, string> {
	const environment: Record<string, string> = {
		PATH: process.env.PATH ?? "",
		TERM: process.env.TERM ?? "xterm-256color",
		LANG: process.env.LANG ?? "en_US.UTF-8",
		...scenario.env,
		RUDEL_API_BASE: stubBase,
		RUDEL_CONFIG_DIR: paths.configDir,
		RUDEL_CLAUDE_SETTINGS_DIR: join(paths.agentHome, ".claude"),
		RUDEL_CODEX_CONFIG_PATH: paths.codexConfig,
		POSTHOG_ENABLED: "false",
	};
	copyOptionalEnvironment(environment, "COLORTERM");
	copyOptionalEnvironment(environment, "LC_ALL");
	copyOptionalEnvironment(environment, "LC_CTYPE");
	copyOptionalEnvironment(environment, "TMPDIR");
	if (scenario.profile === "fixture") {
		environment.RUDEL_CLAUDE_SESSIONS_DIR = paths.claudeSessions;
		environment.RUDEL_CODEX_SESSIONS_DIR = paths.codexSessions;
	}
	return environment;
}

async function resolveScenarioCwd(
	scenario: Scenario,
	paths: PlaygroundPaths,
): Promise<string> {
	if (scenario.profile !== "local-real" || scenario.argv[0] !== "enable") {
		return paths.workdir;
	}
	const candidates: string[] = [];
	for (const adapter of getAllAdapters()) {
		for (const project of await adapter.scanAllSessions()) {
			if (existsSync(project.projectPath)) candidates.push(project.projectPath);
		}
	}
	candidates.sort((left, right) => {
		const leftRelevant = left.toLowerCase().includes("rudel") ? 0 : 1;
		const rightRelevant = right.toLowerCase().includes("rudel") ? 0 : 1;
		return leftRelevant - rightRelevant || left.localeCompare(right);
	});
	return candidates[0] ?? paths.workdir;
}

async function resolveCliMode(paths: PlaygroundPaths): Promise<CliMode> {
	if (process.env.RUDEL_PLAYGROUND_CLI_MODE === "packed") return "packed";
	if (process.env.RUDEL_PLAYGROUND_CLI_MODE === "source") return "source";
	try {
		const parsed: unknown = JSON.parse(
			await readFile(paths.controlState, "utf8"),
		);
		if (isRecord(parsed) && parsed.cliMode === "packed") return "packed";
	} catch {
		// A direct terminal run has no control state and defaults to source.
	}
	return "source";
}

async function buildPackedCli(): Promise<void> {
	const build = Bun.spawn(["bun", "run", "--cwd", "apps/cli", "build"], {
		cwd: MONOREPO_ROOT,
		env: { PATH: process.env.PATH ?? "" },
		stdout: "inherit",
		stderr: "inherit",
	});
	const exitCode = await build.exited;
	if (exitCode !== 0) {
		throw new Error(`Packed CLI build failed with exit code ${exitCode}`);
	}
}

async function startOwnedStub(): Promise<{
	readonly base: string;
	readonly owned: PlaygroundStub;
	readonly secret: string;
}> {
	const owned = startPlaygroundStub();
	return { base: owned.loopbackBase, secret: owned.secret, owned };
}

function copyOptionalEnvironment(
	target: Record<string, string>,
	key: string,
): void {
	const value = process.env[key];
	if (value !== undefined) target[key] = value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

if (import.meta.main) {
	try {
		const scenario = parseScenarioInvocation(process.argv.slice(2));
		const result = await runScenario(scenario);
		process.exitCode = result.exitCode;
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Unknown playground error";
		process.stderr.write(`CLI playground: ${message}\n`);
		process.exitCode = 1;
	}
}
