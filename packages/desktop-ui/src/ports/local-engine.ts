import type {
	AgentTarget,
	DriftFinding,
	InstallPlanFile,
} from "@rudel/skill-schema";

export type ScanWorkspaceInput = {
	rootPath: string;
};

export type LocalRepoSummary = {
	id: string;
	name: string;
	path: string;
};

export type LocalSkillArtifact = {
	repoId: string;
	targetPath: string;
	agentTarget: AgentTarget;
	managed: boolean;
};

export type ScanWorkspaceOutput = {
	rootPath: string;
	repos: LocalRepoSummary[];
	skills: LocalSkillArtifact[];
};

export type CreateInstallPlanInput = {
	blueprintId: string;
	repoId: string;
	targets: AgentTarget[];
};

export type CreateInstallPlanOutput = {
	planId: string;
	files: InstallPlanFile[];
	warnings: string[];
};

export type ApplyInstallPlanInput = {
	planId: string;
};

export type ApplyInstallPlanOutput = {
	operationId: string;
	applied: boolean;
};

export type DetectDriftInput = {
	repoId: string;
};

export type DetectDriftOutput = {
	repoId: string;
	findings: DriftFinding[];
};

export type LocalEngine = {
	scanWorkspace(input: ScanWorkspaceInput): Promise<ScanWorkspaceOutput>;
	createInstallPlan(
		input: CreateInstallPlanInput,
	): Promise<CreateInstallPlanOutput>;
	applyInstallPlan(
		input: ApplyInstallPlanInput,
	): Promise<ApplyInstallPlanOutput>;
	detectDrift(input: DetectDriftInput): Promise<DetectDriftOutput>;
};
