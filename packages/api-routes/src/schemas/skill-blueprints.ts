import {
	artifactTargetSchema,
	blueprintVersionStateSchema,
	generatedArtifactSchema,
	lockfileStatusSchema,
	repoKeySchema,
	repoOverlaySchema,
	skillBlueprintSchema,
} from "@rudel/skill-schema";
import { z } from "zod";

export const BlueprintSlugInputSchema = z.object({
	slug: z.string().min(1),
});

export const SkillBlueprintRecordSchema = z.object({
	id: z.string(),
	organizationId: z.string(),
	slug: z.string(),
	name: z.string(),
	currentVersionId: z.string().nullable(),
	createdAt: z.string(),
	updatedAt: z.string(),
});

export const SkillBlueprintVersionRecordSchema = z.object({
	id: z.string(),
	blueprintId: z.string(),
	organizationId: z.string(),
	version: z.string(),
	state: blueprintVersionStateSchema,
	payload: skillBlueprintSchema,
	modules: z.array(z.unknown()),
	createdByUserId: z.string(),
	createdAt: z.string(),
	publishedAt: z.string().nullable(),
});

export const SkillBlueprintWithLatestSchema = z.object({
	blueprint: SkillBlueprintRecordSchema,
	latestVersion: SkillBlueprintVersionRecordSchema.nullable(),
});

export const SaveSkillBlueprintDraftInputSchema = z.object({
	slug: z.string().min(1),
	name: z.string().min(1),
	version: z.string().min(1),
	payload: skillBlueprintSchema,
	modules: z.array(z.unknown()).default([]),
});

export const PublishSkillBlueprintDraftInputSchema = z.object({
	draftVersionId: z.string().min(1),
	version: z.string().min(1),
});

export const RepoOverlayInputSchema = z.object({
	repoKey: repoKeySchema,
	blueprintId: z.string().min(1),
	overlay: repoOverlaySchema,
	overlayHash: z.string().min(1),
});

export const RepoOverlayRecordSchema = RepoOverlayInputSchema.extend({
	id: z.string(),
	organizationId: z.string(),
	updatedByUserId: z.string(),
	updatedAt: z.string(),
});

export const GetRepoOverlayInputSchema = z.object({
	repoKey: repoKeySchema,
	blueprintId: z.string().min(1),
});

export const SkillInstallReportInputSchema = z.object({
	blueprintId: z.string().min(1),
	blueprintVersionId: z.string().min(1),
	repoKey: repoKeySchema,
	artifactTarget: artifactTargetSchema,
	targetPath: z.string().min(1),
	status: lockfileStatusSchema,
	generatedHash: z.string().min(1),
	currentFileHash: z.string().optional(),
	overlayHash: z.string().min(1),
	schemaVersion: z.string().min(1),
	compilerVersion: z.string().min(1),
});

export const SkillInstallReportBulkInputSchema = z.object({
	reports: z.array(SkillInstallReportInputSchema).max(500),
});

export const SkillInstallReportRecordSchema =
	SkillInstallReportInputSchema.extend({
		id: z.string(),
		organizationId: z.string(),
		reportedByUserId: z.string(),
		reportedAt: z.string(),
	});

export const ListSkillInstallsByBlueprintInputSchema = z.object({
	blueprintId: z.string().min(1),
});

export const GeneratedArtifactEnvelopeSchema = generatedArtifactSchema;

export type SkillBlueprintRecord = z.infer<typeof SkillBlueprintRecordSchema>;
export type SkillBlueprintVersionRecord = z.infer<
	typeof SkillBlueprintVersionRecordSchema
>;
export type SkillBlueprintWithLatest = z.infer<
	typeof SkillBlueprintWithLatestSchema
>;
export type RepoOverlayInput = z.infer<typeof RepoOverlayInputSchema>;
export type SkillInstallReportInput = z.infer<
	typeof SkillInstallReportInputSchema
>;
