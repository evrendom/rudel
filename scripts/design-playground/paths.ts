import { tmpdir } from "node:os";
import { basename, resolve } from "node:path";
import type { FixtureVariant, PlaygroundProfile } from "./types.js";

export const MONOREPO_ROOT = resolve(import.meta.dir, "..", "..");
export const SOURCE_CLI_PATH = resolve(
	MONOREPO_ROOT,
	"apps",
	"cli",
	"src",
	"bin",
	"cli.ts",
);
export const PACKED_CLI_PATH = resolve(
	MONOREPO_ROOT,
	"apps",
	"cli",
	"dist",
	"cli.js",
);

export interface PlaygroundPaths {
	readonly agentHome: string;
	readonly claudeSessions: string;
	readonly codexConfig: string;
	readonly codexSessions: string;
	readonly configDir: string;
	readonly controlState: string;
	readonly fixtureRoot: string;
	readonly runtimeRoot: string;
	readonly workdir: string;
}

export function getPlaygroundPaths(
	profile: PlaygroundProfile,
	fixture: FixtureVariant,
): PlaygroundPaths {
	const runtimeRoot =
		process.env.RUDEL_PLAYGROUND_RUNTIME_DIR ??
		resolve(tmpdir(), "rudel-cli-design-playground", basename(MONOREPO_ROOT));
	const fixtureRoot = resolve(runtimeRoot, "fixtures", fixture);
	const agentHome = resolve(runtimeRoot, "fake-agent-home", profile);
	return {
		runtimeRoot,
		fixtureRoot,
		agentHome,
		claudeSessions: resolve(fixtureRoot, ".claude", "projects"),
		codexConfig: resolve(agentHome, ".codex", "config.toml"),
		codexSessions: resolve(fixtureRoot, ".codex", "sessions"),
		configDir: resolve(runtimeRoot, "state", profile),
		controlState: resolve(runtimeRoot, "control.json"),
		workdir: resolve(fixtureRoot, "workdir"),
	};
}
