import { existsSync } from "node:fs";
import type { Source } from "@rudel/api-routes";
import type { AgentAdapter } from "./types.js";

const adapters = new Map<Source, AgentAdapter>();

export function registerAdapter(adapter: AgentAdapter): void {
	adapters.set(adapter.source, adapter);
}

export function getAdapter(source: Source): AgentAdapter {
	const adapter = adapters.get(source);
	if (!adapter) {
		throw new Error(`No adapter registered for source: ${source}`);
	}
	return adapter;
}

export function getAllAdapters(): AgentAdapter[] {
	return Array.from(adapters.values());
}

export function getAvailableAdapters(): AgentAdapter[] {
	return getAllAdapters().filter((a) => existsSync(a.getSessionsBaseDir()));
}
