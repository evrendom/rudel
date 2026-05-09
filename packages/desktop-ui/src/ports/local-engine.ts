import type {
	DriftDetail,
	DriftFinding,
	ExpectedInstallation,
	GeneratedArtifact,
	InstallPlan,
	MachineScanResult,
	RepoKey,
	SkillArtifact,
} from "@rudel/skill-schema";

export type ScanMachineInput = {
	roots: string[];
	includeGlobalAgentFolders: boolean;
};

export type ScanWorkspaceInput = {
	rootPath: string;
};

export type WorkspaceScanResult = MachineScanResult & {
	rootPath: string;
};

export type CreateInstallPlanInput = {
	repoId: string;
	repoPath: string;
	artifacts: GeneratedArtifact[];
	blueprintRef: {
		blueprintId: string;
		blueprintVersionId: string;
		slug: string;
	};
	overlayHash: string;
};

export type ApplyInstallPlanInput = {
	planId: string;
};

export type ApplyInstallPlanResult = {
	operationId: string;
	applied: boolean;
};

export type GetDriftDetailInput = {
	artifactId?: string;
	repoId?: string;
	targetPath: string;
	expectedArtifact: GeneratedArtifact;
};

export type DetectDriftInput = {
	expectedInstallations: ExpectedInstallation[];
};

export type AllSkillsInventoryItem = {
	detectedSlug: string;
	artifacts: SkillArtifact[];
	managedCount: number;
	unmanagedCount: number;
	repoKeys: RepoKey[];
};

export type LocalEngine = {
	scanMachine(input: ScanMachineInput): Promise<MachineScanResult>;
	scanWorkspace(input: ScanWorkspaceInput): Promise<WorkspaceScanResult>;
	detectDrift(input: DetectDriftInput): Promise<DriftFinding[]>;
	createInstallPlan(input: CreateInstallPlanInput): Promise<InstallPlan>;
	applyInstallPlan(
		input: ApplyInstallPlanInput,
	): Promise<ApplyInstallPlanResult>;
	getDriftDetail(input: GetDriftDetailInput): Promise<DriftDetail>;
};
