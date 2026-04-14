import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parse as parseTOML, stringify as stringifyTOML } from "smol-toml";

export const CONFIG_PATH = join(homedir(), ".codex", "config.toml");
const HOOK_COMMAND = "rudel hooks codex turn-complete";

interface CodexConfig {
	notify?: string[];
	[key: string]: unknown;
}

function readConfig(): CodexConfig {
	if (!existsSync(CONFIG_PATH)) {
		return {};
	}
	const content = readFileSync(CONFIG_PATH, "utf-8");
	return parseTOML(content) as CodexConfig;
}

function writeConfig(config: CodexConfig): void {
	writeFileSync(CONFIG_PATH, stringifyTOML(config));
}

export function installHook(): void {
	const config = readConfig();
	if (!Array.isArray(config.notify)) {
		config.notify = [];
	}
	if (!config.notify.includes(HOOK_COMMAND)) {
		config.notify.push(HOOK_COMMAND);
	}
	writeConfig(config);
}

export function removeHook(): void {
	const config = readConfig();
	if (!Array.isArray(config.notify)) {
		return;
	}
	config.notify = config.notify.filter((cmd) => cmd !== HOOK_COMMAND);
	if (config.notify.length === 0) {
		delete config.notify;
	}
	writeConfig(config);
}

export function isHookInstalled(): boolean {
	const config = readConfig();
	if (!Array.isArray(config.notify)) {
		return false;
	}
	return config.notify.includes(HOOK_COMMAND);
}
