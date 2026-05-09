import type { RudelDesktopAppProps } from "@rudel/desktop-ui";
import type {
	MachineScanResult,
	ScanRootSuggestionsResult,
} from "@rudel/skill-schema";
import { invoke } from "@tauri-apps/api/core";

export const tauriLocalEngine: RudelDesktopAppProps["localEngine"] = {
	async suggestScanRoots() {
		return invoke<ScanRootSuggestionsResult>("suggest_scan_roots");
	},
	async scanMachine(input) {
		return invoke<MachineScanResult>("scan_machine", { input });
	},
};
