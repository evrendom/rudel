import { existsSync } from "node:fs";
import type { Source } from "@rudel/api-routes";
import type { AgentAdapter } from "./types.js";

const adapters = new Map<Source, AgentAdapter>();
const scanOnlyAdapters: AgentAdapter[] = [];

export function registerAdapter(adapter: AgentAdapter): void {
	adapters.set(adapter.source, adapter);
}

/**
 * Register an adapter that participates in session scanning but does not
 * own a unique source key. Use this when an adapter shares its source
 * with another adapter (e.g. Pi sessions use source "claude_code" but
 * need their own discovery and upload logic).
 */
export function registerScanOnlyAdapter(adapter: AgentAdapter): void {
	scanOnlyAdapters.push(adapter);
}

export function getAdapter(source: Source): AgentAdapter {
	const adapter = adapters.get(source);
	if (!adapter) {
		throw new Error(`No adapter registered for source: ${source}`);
	}
	return adapter;
}

export function getAllAdapters(): AgentAdapter[] {
	return [...adapters.values(), ...scanOnlyAdapters];
}

export function getAvailableAdapters(): AgentAdapter[] {
	return getAllAdapters().filter((a) => existsSync(a.getSessionsBaseDir()));
}
