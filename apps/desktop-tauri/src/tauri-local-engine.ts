import type { LocalEngine } from "@rudel/desktop-ui";

export const tauriLocalEngine: LocalEngine = {
	async scanMachine(input) {
		return {
			roots: input.roots,
			artifacts: [],
		};
	},
	async scanWorkspace(input) {
		return {
			roots: [input.rootPath],
			rootPath: input.rootPath,
			artifacts: [],
		};
	},
	async createInstallPlan(input) {
		void input.repoPath;
		return {
			id: `plan:${input.repoId}:${input.blueprintRef.blueprintId}`,
			repoId: input.repoId,
			blueprintId: input.blueprintRef.blueprintId,
			files: [],
			undoAvailable: true,
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
		void input;
		return [];
	},
	async getDriftDetail(input) {
		return {
			repoId: input.repoId,
			targetPath: input.targetPath,
			status: "missing",
			expectedContent: input.expectedArtifact.content,
		};
	},
};
