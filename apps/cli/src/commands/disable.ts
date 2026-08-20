import * as p from "@clack/prompts";
import { getAllAdapters } from "@rudel/agent-adapters";
import { buildCommand } from "@stricli/core";
import { clearAutoUploadRepositories } from "../lib/auto-upload-config.js";

async function runDisable(): Promise<void> {
	clearAutoUploadRepositories();
	const adapters = getAllAdapters();
	let anyDisabled = false;

	for (const adapter of adapters) {
		if (adapter.isHookInstalled()) {
			adapter.removeHook();
			p.log.success(
				`${adapter.name}: Auto-upload hook removed from ${adapter.getHookConfigPath()}`,
			);
			anyDisabled = true;
		}
	}

	if (!anyDisabled) {
		p.log.info("No auto-upload hooks are enabled.");
	}
}

export const disableCommand = buildCommand({
	loader: async () => ({ default: runDisable }),
	parameters: {},
	docs: {
		brief: "Disable automatic session upload",
	},
});
