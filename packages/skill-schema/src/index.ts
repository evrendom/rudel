import { z } from "zod";

export const agentTargetSchema = z.enum([
	"claude_code",
	"codex",
	"cursor",
	"agents_md",
]);

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
	agentTarget: agentTargetSchema,
	targetPath: z.string().min(1),
	content: z.string(),
	contentHash: z.string().min(1),
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
	agentTarget: agentTargetSchema,
	targetPath: z.string().min(1),
	status: lockfileStatusSchema,
});

export type SkillInstallation = z.infer<typeof skillInstallationSchema>;

export const skillLockfileEntrySchema = z.object({
	blueprintId: z.string().min(1),
	blueprintVersion: z.string().min(1),
	repoOverlayHash: z.string().min(1),
	generatedHash: z.string().min(1),
	currentFileHash: z.string().optional(),
	agentTarget: agentTargetSchema,
	targetPath: z.string().min(1),
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
	agentTarget: agentTargetSchema.optional(),
	targetPath: z.string().min(1),
	status: lockfileStatusSchema,
	message: z.string().min(1),
});

export type DriftFinding = z.infer<typeof driftFindingSchema>;

export const installPlanFileSchema = z.object({
	targetPath: z.string().min(1),
	action: z.enum(["create", "modify", "skip"]),
	generatedContent: z.string(),
	diff: z.string().optional(),
	warnings: z.array(z.string()).default([]),
});

export type InstallPlanFile = z.infer<typeof installPlanFileSchema>;

export const installPlanSchema = z.object({
	id: z.string().min(1),
	repoId: z.string().min(1),
	blueprintId: z.string().min(1),
	files: z.array(installPlanFileSchema),
	undoAvailable: z.boolean(),
	warnings: z.array(z.string()).default([]),
});

export type InstallPlan = z.infer<typeof installPlanSchema>;
