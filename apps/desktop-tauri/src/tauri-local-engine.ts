import type { LocalEngine } from "@rudel/desktop-ui";

export const tauriLocalEngine: LocalEngine = {
	async scanWorkspace(input) {
		return {
			rootPath: input.rootPath,
			repos: [],
			skills: [],
		};
	},
	async createInstallPlan(input) {
		return {
			planId: `plan:${input.repoId}:${input.blueprintId}`,
			files: [],
			warnings: [],
		};
	},
	async applyInstallPlan(input) {
		return {
			operationId: `operation:${input.planId}`,
			applied: true,
		};
	},
	async detectDrift(input) {
		return {
			repoId: input.repoId,
			findings: [],
		};
	},
};
