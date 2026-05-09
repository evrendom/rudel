import type {
	GeneratedArtifact,
	GitDiffResult,
	HashFilesResult,
	LockfileReadResult,
	MachineScanResult,
	RepoIdentityResult,
	RepoKey,
	SkillArtifact,
	SkillLockfileEntry,
	WritePlan,
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

export type ReadLockfilesInput = {
	repoPaths: string[];
};

export type HashFilesInput = {
	files: string[];
};

export type NormalizeGitRemotesInput = {
	repoPaths: string[];
};

export type CreateWritePlanInput = {
	repoId: string;
	repoPath: string;
	artifacts: GeneratedArtifact[];
	lockfileUpdates: SkillLockfileEntry[];
};

export type ApplyWritePlanInput = {
	repoPath: string;
	plan: WritePlan;
	lockfileUpdates: SkillLockfileEntry[];
};

export type ApplyWritePlanResult = {
	operationId: string;
	applied: boolean;
};

export type GitDiffInput = {
	repoPath: string;
	paths: string[];
};

export type AllSkillsInventoryItem = {
	skillSlug: string;
	artifacts: SkillArtifact[];
	managedCount: number;
	unmanagedCount: number;
	repoKeys: RepoKey[];
};

export type LocalEngine = {
	scanMachine(input: ScanMachineInput): Promise<MachineScanResult>;
	scanWorkspace(input: ScanWorkspaceInput): Promise<WorkspaceScanResult>;
	readLockfiles(input: ReadLockfilesInput): Promise<LockfileReadResult>;
	hashFiles(input: HashFilesInput): Promise<HashFilesResult>;
	normalizeGitRemotes(
		input: NormalizeGitRemotesInput,
	): Promise<RepoIdentityResult>;
	createWritePlan(input: CreateWritePlanInput): Promise<WritePlan>;
	applyWritePlan(input: ApplyWritePlanInput): Promise<ApplyWritePlanResult>;
	getGitDiff(input: GitDiffInput): Promise<GitDiffResult>;
};
