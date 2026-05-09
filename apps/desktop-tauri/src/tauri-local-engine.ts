import type { LocalEngine, WorkspaceScanResult } from "@rudel/desktop-ui";
import type {
	DriftDetail,
	DriftFinding,
	InstallPlan,
	MachineScanResult,
} from "@rudel/skill-schema";
import { invoke } from "@tauri-apps/api/core";

export const tauriLocalEngine: LocalEngine = {
	async scanMachine(input) {
		return invoke<MachineScanResult>("scan_machine", { input });
	},
	async scanWorkspace(input) {
		const result = await invoke<MachineScanResult>("scan_workspace", { input });
		return {
			...result,
			rootPath: input.rootPath,
		} satisfies WorkspaceScanResult;
	},
	async createInstallPlan(input) {
		return invoke<InstallPlan>("create_install_plan", { input });
	},
	async applyInstallPlan(input) {
		return invoke("apply_install_plan", { input });
	},
	async detectDrift(input) {
		return invoke<DriftFinding[]>("detect_drift", { input });
	},
	async getDriftDetail(input) {
		return invoke<DriftDetail>("get_drift_detail", { input });
	},
};
