import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const PACKAGE_ROOT = join(import.meta.dir, "..");
const PATH_VALUE = process.env.PATH ?? "";
const CLAUDE_ADAPTER_URL = pathToFileURL(
	join(PACKAGE_ROOT, "src", "adapters", "claude-code", "index.ts"),
).href;
const CODEX_ADAPTER_URL = pathToFileURL(
	join(PACKAGE_ROOT, "src", "adapters", "codex", "index.ts"),
).href;

let tempDir: string;

beforeAll(async () => {
	tempDir = await mkdtemp(join(tmpdir(), "rudel-adapter-paths-"));
});

afterAll(async () => {
	await rm(tempDir, { recursive: true, force: true });
});

describe("agent adapter path overrides", () => {
	test("keeps the current default paths when overrides are unset", async () => {
		const projectDir = join(tempDir, "default-project");
		await mkdir(join(projectDir, ".claude"), { recursive: true });
		const canonicalProjectDir = await realpath(projectDir);

		const paths = await inspectPaths(projectDir, {});

		expect(paths).toEqual({
			claudeSessions: join(homedir(), ".claude", "projects"),
			claudeSettings: join(canonicalProjectDir, ".claude", "settings.json"),
			codexConfig: join(homedir(), ".codex", "config.toml"),
			codexSessions: join(homedir(), ".codex", "sessions"),
		});
	});

	test("resolves all four explicit overrides at module load", async () => {
		const projectDir = join(tempDir, "overridden-project");
		const claudeSessions = join(tempDir, "claude-sessions");
		const claudeSettings = join(tempDir, "claude-settings");
		const codexSessions = join(tempDir, "codex-sessions");
		const codexConfig = join(tempDir, "codex", "config.toml");
		await mkdir(projectDir, { recursive: true });

		const paths = await inspectPaths(projectDir, {
			RUDEL_CLAUDE_SESSIONS_DIR: claudeSessions,
			RUDEL_CLAUDE_SETTINGS_DIR: claudeSettings,
			RUDEL_CODEX_CONFIG_PATH: codexConfig,
			RUDEL_CODEX_SESSIONS_DIR: codexSessions,
		});

		expect(paths).toEqual({
			claudeSessions,
			claudeSettings: join(claudeSettings, "settings.json"),
			codexConfig,
			codexSessions,
		});
	});
});

interface AdapterPaths {
	readonly claudeSessions: string;
	readonly claudeSettings: string;
	readonly codexConfig: string;
	readonly codexSessions: string;
}

async function inspectPaths(
	cwd: string,
	overrides: Readonly<Record<string, string>>,
): Promise<AdapterPaths> {
	const script = [
		`import { claudeCodeAdapter } from "${CLAUDE_ADAPTER_URL}";`,
		`import { codexAdapter } from "${CODEX_ADAPTER_URL}";`,
		"console.log(JSON.stringify({",
		"claudeSessions: claudeCodeAdapter.getSessionsBaseDir(),",
		"claudeSettings: claudeCodeAdapter.getHookConfigPath(),",
		"codexConfig: codexAdapter.getHookConfigPath(),",
		"codexSessions: codexAdapter.getSessionsBaseDir(),",
		"}));",
	].join("");
	const processResult = Bun.spawn(["bun", "--eval", script], {
		cwd,
		env: { PATH: PATH_VALUE, ...overrides },
		stdout: "pipe",
		stderr: "pipe",
	});
	const [exitCode, stdout, stderr] = await Promise.all([
		processResult.exited,
		new Response(processResult.stdout).text(),
		new Response(processResult.stderr).text(),
	]);
	if (exitCode !== 0) {
		throw new Error(`Adapter path probe failed: ${stderr}`);
	}

	const parsed: unknown = JSON.parse(stdout);
	if (!isAdapterPaths(parsed)) {
		throw new Error("Adapter path probe returned an invalid response");
	}
	return parsed;
}

function isAdapterPaths(value: unknown): value is AdapterPaths {
	if (typeof value !== "object" || value === null) return false;
	return (
		"claudeSessions" in value &&
		typeof value.claudeSessions === "string" &&
		"claudeSettings" in value &&
		typeof value.claudeSettings === "string" &&
		"codexConfig" in value &&
		typeof value.codexConfig === "string" &&
		"codexSessions" in value &&
		typeof value.codexSessions === "string"
	);
}
