import { z } from "zod";

export const artifactTargetSchema = z.enum([
	"claude_code",
	"codex",
	"cursor",
	"agents_md",
	"claude_md",
]);

export type ArtifactTarget = z.infer<typeof artifactTargetSchema>;

export const observedArtifactTargetSchema = z.enum([
	"claude_code",
	"codex",
	"cursor",
	"agents_md",
	"claude_md",
	"unknown",
]);

export type ObservedArtifactTarget = z.infer<
	typeof observedArtifactTargetSchema
>;

export const agentTargetSchema = artifactTargetSchema;

export type AgentTarget = z.infer<typeof agentTargetSchema>;

export const skillBlockKindSchema = z.enum([
	"trigger",
	"goal",
	"shared_instruction",
	"workflow",
	"tool_adapter",
	"safety",
	"output_format",
	"reference",
	"agent_instruction",
	"repo_adapter",
]);

export type SkillBlockKind = z.infer<typeof skillBlockKindSchema>;

export const skillBlockSchema = z.object({
	id: z.string().min(1),
	kind: skillBlockKindSchema,
	title: z.string().min(1),
	body: z.string().min(1),
});

export type SkillBlock = z.infer<typeof skillBlockSchema>;

export const variableDefSchema = z.object({
	name: z.string().min(1),
	description: z.string().optional(),
	defaultValue: z.string().optional(),
	required: z.boolean().default(false),
});

export type VariableDef = z.infer<typeof variableDefSchema>;

export const skillModuleRefSchema = z.object({
	moduleId: z.string().min(1),
	required: z.boolean().default(false),
});

export type SkillModuleRef = z.infer<typeof skillModuleRefSchema>;

export const skillModuleKindSchema = z.enum([
	"workflow",
	"tool_adapter",
	"safety",
	"output_format",
	"reference",
	"agent_instruction",
]);

export type SkillModuleKind = z.infer<typeof skillModuleKindSchema>;

export const skillModuleSchema = z.object({
	id: z.string().min(1),
	slug: z.string().min(1),
	name: z.string().min(1),
	kind: skillModuleKindSchema,
	blocks: z.array(skillBlockSchema).default([]),
});

export type SkillModule = z.infer<typeof skillModuleSchema>;

export const skillBlueprintSchema = z.object({
	id: z.string().min(1),
	slug: z.string().min(1),
	name: z.string().min(1),
	description: z.string().min(1),
	trigger: z.string().min(1),
	version: z.string().min(1),
	modules: z.array(skillModuleRefSchema).default([]),
	variables: z.array(variableDefSchema).default([]),
	targets: z.array(agentTargetSchema).default([]),
	blocks: z.array(skillBlockSchema).default([]),
});

export type SkillBlueprint = z.infer<typeof skillBlueprintSchema>;

export const blueprintVersionStateSchema = z.enum(["draft", "published"]);

export type BlueprintVersionState = z.infer<typeof blueprintVersionStateSchema>;

export const repoOverlaySchema = z.object({
	repoId: z.string().min(1),
	blueprintId: z.string().min(1),
	variables: z.record(z.string()).default({}),
	enabledModules: z.array(z.string()).default([]),
	disabledModules: z.array(z.string()).default([]),
	appendedBlocks: z.array(skillBlockSchema).default([]),
});

export type RepoOverlay = z.infer<typeof repoOverlaySchema>;

export const generatedArtifactSchema = z.object({
	artifactTarget: artifactTargetSchema,
	targetPath: z.string().min(1),
	content: z.string(),
	contentHash: z.string().min(1),
	blueprintId: z.string().min(1),
	blueprintVersionId: z.string().min(1),
	overlayHash: z.string().min(1),
	schemaVersion: z.string().min(1),
	compilerVersion: z.string().min(1),
});

export type GeneratedArtifact = z.infer<typeof generatedArtifactSchema>;

export const lockfileStatusSchema = z.enum([
	"current",
	"behind",
	"modified",
	"missing",
	"conflict",
	"forked",
	"unmanaged",
]);

export type LockfileStatus = z.infer<typeof lockfileStatusSchema>;

export const skillInstallationSchema = z.object({
	id: z.string().min(1),
	repoId: z.string().min(1),
	blueprintId: z.string().min(1),
	artifactTarget: artifactTargetSchema,
	targetPath: z.string().min(1),
	status: lockfileStatusSchema,
});

export type SkillInstallation = z.infer<typeof skillInstallationSchema>;

export const skillLockfileEntrySchema = z.object({
	blueprintId: z.string().min(1),
	blueprintVersion: z.string().min(1),
	repoOverlayHash: z.string().min(1),
	generatedHash: z.string().min(1),
	currentFileHash: z.string().nullable().optional(),
	artifactTarget: artifactTargetSchema,
	targetPath: z.string().min(1),
	schemaVersion: z.string().min(1),
	compilerVersion: z.string().min(1),
	status: lockfileStatusSchema,
});

export type SkillLockfileEntry = z.infer<typeof skillLockfileEntrySchema>;

export const skillLockfileSchema = z.object({
	version: z.literal(1),
	entries: z.array(skillLockfileEntrySchema),
});

export type SkillLockfile = z.infer<typeof skillLockfileSchema>;

export const driftFindingSchema = z.object({
	id: z.string().min(1),
	repoId: z.string().min(1),
	blueprintId: z.string().optional(),
	artifactTarget: artifactTargetSchema.optional(),
	targetPath: z.string().min(1),
	status: lockfileStatusSchema,
	message: z.string().min(1),
});

export type DriftFinding = z.infer<typeof driftFindingSchema>;

export const writePlanFileSchema = z.object({
	targetPath: z.string().min(1),
	action: z.enum(["create", "modify", "skip"]),
	generatedContent: z.string(),
	diff: z.string().optional(),
	warnings: z.array(z.string()).default([]),
});

export type WritePlanFile = z.infer<typeof writePlanFileSchema>;

export const writePlanSchema = z.object({
	id: z.string().min(1),
	repoId: z.string().min(1),
	blueprintId: z.string().min(1),
	files: z.array(writePlanFileSchema),
	undoAvailable: z.boolean(),
	warnings: z.array(z.string()).default([]),
});

export type WritePlan = z.infer<typeof writePlanSchema>;

export const repoKeySchema = z.discriminatedUnion("kind", [
	z.object({
		kind: z.literal("github"),
		value: z.string().min(1),
	}),
	z.object({
		kind: z.literal("local"),
		value: z.string().min(1),
	}),
]);

export type RepoKey = z.infer<typeof repoKeySchema>;

export const sourceScopeSchema = z.enum([
	"repo",
	"global_user",
	"nested_repo",
	"symlink",
	"unknown",
]);

export type SourceScope = z.infer<typeof sourceScopeSchema>;

export const symlinkKindSchema = z.enum([
	"file",
	"skill_folder",
	"agent_root",
	"ancestor_folder",
]);

export type SymlinkKind = z.infer<typeof symlinkKindSchema>;

export const skillArtifactSchema = z.object({
	id: z.string().min(1),
	sourceScope: sourceScopeSchema,
	artifactTarget: observedArtifactTargetSchema,
	absolutePathHash: z.string().min(1),
	path: z.string().min(1),
	repoRootPath: z.string().optional(),
	repoRelativePath: z.string().optional(),
	repoKey: repoKeySchema.optional(),
	name: z.string().optional(),
	description: z.string().optional(),
	symlinkKind: symlinkKindSchema.optional(),
	content: z.string(),
	contentHash: z.string().min(1),
	normalizedContentHash: z.string().min(1),
	lockfileEntry: skillLockfileEntrySchema.optional(),
});

export type SkillArtifact = z.infer<typeof skillArtifactSchema>;
export const observedArtifactSchema = skillArtifactSchema;
export type ObservedArtifact = SkillArtifact;

export const scannedRootStatusSchema = z.enum([
	"scanned",
	"missing",
	"unreadable",
	"invalid",
]);

export type ScannedRootStatus = z.infer<typeof scannedRootStatusSchema>;

export const scannedRootSchema = z.object({
	input: z.string(),
	normalizedPath: z.string().optional(),
	status: scannedRootStatusSchema,
});

export type ScannedRoot = z.infer<typeof scannedRootSchema>;

export const codeRepoSchema = z.object({
	repoRootPath: z.string().min(1),
	repoKey: repoKeySchema,
	sourceRoot: z.string().min(1),
	gitCommonDir: z.string().optional(),
	branchName: z.string().optional(),
	localBranchCount: z.number().int().nonnegative(),
	headSha: z.string().optional(),
	isDirty: z.boolean(),
	skillFileCount: z.number().int().nonnegative(),
	dirtySkillFileCount: z.number().int().nonnegative(),
	isWorktree: z.boolean(),
	isNested: z.boolean(),
	hasRudelLockfile: z.boolean(),
});

export type CodeRepo = z.infer<typeof codeRepoSchema>;

export const scanFileMatchedBySchema = z.enum([
	"agent_skills",
	"cursor_rules",
	"repo_context",
	"global_agent_roots",
	"include_glob",
]);

export type ScanFileMatchedBy = z.infer<typeof scanFileMatchedBySchema>;

export const scanFileSkippedReasonSchema = z.enum([
	"excluded",
	"binary",
	"too_large",
	"invalid_glob",
]);

export type ScanFileSkippedReason = z.infer<typeof scanFileSkippedReasonSchema>;

export const scanFileCandidateSchema = z.object({
	path: z.string().min(1),
	repoRootPath: z.string().optional(),
	sourceScope: sourceScopeSchema,
	matchedBy: scanFileMatchedBySchema,
	selected: z.boolean(),
	sizeBytes: z.number().int().nonnegative(),
	skippedReason: scanFileSkippedReasonSchema.optional(),
});

export type ScanFileCandidate = z.infer<typeof scanFileCandidateSchema>;

export const scanWarningSchema = z.object({
	root: z.string(),
	message: z.string().min(1),
});

export type ScanWarning = z.infer<typeof scanWarningSchema>;

export const scanRootSuggestionSchema = z.object({
	label: z.string().min(1),
	path: z.string().min(1),
	normalizedPath: z.string().min(1),
});

export type ScanRootSuggestion = z.infer<typeof scanRootSuggestionSchema>;

export const scanRootSuggestionsResultSchema = z.object({
	suggestions: z.array(scanRootSuggestionSchema),
});

export type ScanRootSuggestionsResult = z.infer<
	typeof scanRootSuggestionsResultSchema
>;

export const machineScanResultSchema = z.object({
	roots: z.array(scannedRootSchema),
	repos: z.array(codeRepoSchema),
	candidates: z.array(scanFileCandidateSchema),
	artifacts: z.array(skillArtifactSchema),
	warnings: z.array(scanWarningSchema),
	skippedDirectoryCount: z.number().int().nonnegative(),
	scannedAt: z.string(),
});

export type MachineScanResult = z.infer<typeof machineScanResultSchema>;

export const lockfileReadResultSchema = z.object({
	repos: z.array(
		z.object({
			repoPath: z.string().min(1),
			lockfile: skillLockfileSchema.optional(),
		}),
	),
});

export type LockfileReadResult = z.infer<typeof lockfileReadResultSchema>;

export const hashFilesResultSchema = z.object({
	files: z.array(
		z.object({
			path: z.string().min(1),
			normalizedContentHash: z.string().optional(),
			error: z.string().optional(),
		}),
	),
});

export type HashFilesResult = z.infer<typeof hashFilesResultSchema>;

export const repoIdentityResultSchema = z.object({
	repos: z.array(
		z.object({
			repoPath: z.string().min(1),
			repoKey: repoKeySchema.optional(),
		}),
	),
});

export type RepoIdentityResult = z.infer<typeof repoIdentityResultSchema>;

export const gitDiffResultSchema = z.object({
	repoPath: z.string().min(1),
	diff: z.string(),
	error: z.string().optional(),
});

export type GitDiffResult = z.infer<typeof gitDiffResultSchema>;
