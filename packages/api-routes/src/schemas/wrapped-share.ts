import { z } from "zod";

export const WrappedShareThemeSchema = z.enum(["dark", "light", "muted"]);

export const WrappedShareHeaderMetricSchema = z.object({
	label: z.string().optional(),
	title: z.string().optional(),
	value: z.string().min(1),
});

export const WrappedShareStatItemIconSchema = z.enum(["claude", "codex"]);

export const WrappedShareStatItemSchema = z.object({
	icon: WrappedShareStatItemIconSchema.optional(),
	key: z.string().min(1),
	label: z.string().optional(),
	title: z.string().optional(),
	value: z.string().min(1),
});

export const WrappedShareRowSchema = z.object({
	activeDays: z.number().nonnegative(),
	cost: z.number().nonnegative(),
	displayName: z.string().min(1),
	favoriteModel: z.string().nullable(),
	hasActivity: z.boolean(),
	imageUrl: z.string().nullable(),
	inputTokens: z.number().nonnegative(),
	lastActiveDate: z.string().nullable(),
	outputTokens: z.number().nonnegative(),
	role: z.string().min(1),
	totalSessions: z.number().nonnegative(),
	totalTokens: z.number().nonnegative(),
});

export const WrappedShareSnapshotSchema = z.object({
	archetypeLabel: z.string().min(1),
	headerLeftMetric: WrappedShareHeaderMetricSchema.optional(),
	headerRightMetric: WrappedShareHeaderMetricSchema.optional(),
	row: WrappedShareRowSchema,
	shellClassName: z.string().min(1),
	statItems: z.array(WrappedShareStatItemSchema),
	theme: WrappedShareThemeSchema,
});

export const CreateWrappedShareInputSchema = z.object({
	snapshot: WrappedShareSnapshotSchema,
});

export const GetPublicWrappedShareInputSchema = z.object({
	shareId: z.string().uuid(),
});

export const WrappedShareRecordSchema = z.object({
	created_at: z.string(),
	id: z.string().uuid(),
});

export const PublicWrappedShareSchema = WrappedShareRecordSchema.extend({
	snapshot: WrappedShareSnapshotSchema,
});

export type WrappedShareTheme = z.infer<typeof WrappedShareThemeSchema>;
export type WrappedShareHeaderMetric = z.infer<
	typeof WrappedShareHeaderMetricSchema
>;
export type WrappedShareStatItem = z.infer<typeof WrappedShareStatItemSchema>;
export type WrappedShareRow = z.infer<typeof WrappedShareRowSchema>;
export type WrappedShareSnapshot = z.infer<typeof WrappedShareSnapshotSchema>;
export type CreateWrappedShareInput = z.infer<
	typeof CreateWrappedShareInputSchema
>;
export type GetPublicWrappedShareInput = z.infer<
	typeof GetPublicWrappedShareInputSchema
>;
export type WrappedShareRecord = z.infer<typeof WrappedShareRecordSchema>;
export type PublicWrappedShare = z.infer<typeof PublicWrappedShareSchema>;
