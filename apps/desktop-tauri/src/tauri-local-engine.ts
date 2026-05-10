import type {
	RudelDesktopAppProps,
	SkillInventoryStreamEvent,
} from "@rudel/desktop-ui";
import type {
	MachineScanResult,
	ScanRootSuggestionsResult,
} from "@rudel/skill-schema";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

const skillInventoryEventName = "rudel-skill-inventory";

export const tauriLocalEngine: RudelDesktopAppProps["localEngine"] = {
	async suggestScanRoots() {
		return invoke<ScanRootSuggestionsResult>("suggest_scan_roots");
	},
	async scanMachine(input) {
		return invoke<MachineScanResult>("scan_machine", { input });
	},
	async streamSkillInventory(input, onEvent) {
		const scanId = createScanId();
		const unlisten = await listen<SkillInventoryStreamEvent>(
			skillInventoryEventName,
			(event) => {
				if (event.payload.scanId === scanId) {
					onEvent(event.payload);
				}
			},
		);

		void invoke<void>("stream_skill_inventory", { input, scanId }).catch(
			(error: unknown) => {
				onEvent({
					type: "error",
					scanId,
					message: error instanceof Error ? error.message : String(error),
				});
			},
		);

		return unlisten;
	},
};

function createScanId(): string {
	return globalThis.crypto?.randomUUID?.() ?? `scan-${Date.now().toString(36)}`;
}
