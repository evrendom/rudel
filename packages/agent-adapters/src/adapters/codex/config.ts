import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { parse as parseTOML, stringify as stringifyTOML } from "smol-toml";

export const CONFIG_PATH = join(homedir(), ".codex", "config.toml");
const HOOK_COMMAND = ["rudel", "hooks", "codex", "turn-complete"] as const;
const LEGACY_HOOK_COMMAND = "rudel hooks codex turn-complete";

interface CodexConfig {
	notify?: string[];
	[key: string]: unknown;
}

function readConfig(configPath: string): CodexConfig {
	if (!existsSync(configPath)) return {};
	const content = readFileSync(configPath, "utf-8");
	return parseTOML(content) as CodexConfig;
}

function writeConfig(configPath: string, config: CodexConfig): void {
	mkdirSync(dirname(configPath), { recursive: true });
	writeFileSync(configPath, stringifyTOML(config));
}

function isRudelHookCommand(command: readonly string[]): boolean {
	return (
		command.length === HOOK_COMMAND.length &&
		command.every((value, index) => value === HOOK_COMMAND[index])
	);
}

export function installHook(configPath: string = CONFIG_PATH): void {
	const config = readConfig(configPath);
	const notify = config.notify;
	if (notify !== undefined && !Array.isArray(notify)) {
		throw new Error(
			`Codex notify is already configured in ${configPath}. Rudel left it unchanged.`,
		);
	}
	const current = notify ?? [];
	if (isRudelHookCommand(current)) return;

	// A broken earlier release appended the whole command as one string.
	const withoutLegacy =
		current.at(-1) === LEGACY_HOOK_COMMAND ? current.slice(0, -1) : current;

	if (withoutLegacy.length === 0) {
		config.notify = [...HOOK_COMMAND];
		writeConfig(configPath, config);
		return;
	}

	if (withoutLegacy.length < current.length) {
		config.notify = withoutLegacy;
		writeConfig(configPath, config);
		throw new Error(
			`Removed Rudel's invalid legacy notify entry from ${configPath}, restoring the previous command. Codex supports only one notify command, so Rudel was not installed.`,
		);
	}

	throw new Error(
		`Codex notify is already configured in ${configPath}. Codex supports only one notify command, so Rudel left the existing command unchanged.`,
	);
}

export function removeHook(configPath: string = CONFIG_PATH): void {
	const config = readConfig(configPath);
	if (!Array.isArray(config.notify)) return;

	if (
		isRudelHookCommand(config.notify) ||
		(config.notify.length === 1 && config.notify[0] === LEGACY_HOOK_COMMAND)
	) {
		delete config.notify;
		writeConfig(configPath, config);
		return;
	}

	if (config.notify.at(-1) === LEGACY_HOOK_COMMAND) {
		config.notify = config.notify.slice(0, -1);
		writeConfig(configPath, config);
	}
}

export function isHookInstalled(configPath: string = CONFIG_PATH): boolean {
	const config = readConfig(configPath);
	if (!Array.isArray(config.notify)) return false;
	return isRudelHookCommand(config.notify);
}
