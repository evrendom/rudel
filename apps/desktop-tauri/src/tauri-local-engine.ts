import type {
	ApplyWritePlanResult,
	LocalEngine,
	WorkspaceScanResult,
} from "@rudel/desktop-ui";
import type {
	GitDiffResult,
	HashFilesResult,
	LockfileReadResult,
	MachineScanResult,
	RepoIdentityResult,
	WritePlan,
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
	async readLockfiles(input) {
		return invoke<LockfileReadResult>("read_lockfiles", { input });
	},
	async hashFiles(input) {
		return invoke<HashFilesResult>("hash_files", { input });
	},
	async normalizeGitRemotes(input) {
		return invoke<RepoIdentityResult>("normalize_git_remotes", { input });
	},
	async createWritePlan(input) {
		return invoke<WritePlan>("create_write_plan", { input });
	},
	async applyWritePlan(input) {
		return invoke<ApplyWritePlanResult>("apply_write_plan", { input });
	},
	async getGitDiff(input) {
		return invoke<GitDiffResult>("get_git_diff", { input });
	},
};
