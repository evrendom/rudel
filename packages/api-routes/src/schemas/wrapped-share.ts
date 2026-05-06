import { z } from "zod";

// Version the public share payload explicitly so the server can reject older
// persisted snapshots if the share card shape changes after launch.
export const WRAPPED_SHARE_PAYLOAD_VERSION = 1 as const;

// This schema is the public contract for wrapped sharing. It is intentionally
// narrower than the private wrapped page data so public replay only exposes the
// fields we are comfortable showing outside the authenticated product.
export const WrappedShareThemeSchema = z.enum(["dark", "light", "muted"]);
// Variant gates which card a share renders. Decimal write is server-gated by
// wrapped_decimal_claim entitlement; the public route trusts the persisted
// variant and renders from the snapshot alone.
export const WrappedShareVariantSchema = z.enum(["normal", "decimal"]);
export const WrappedShareLayoutModeSchema = z.enum(["front", "front_back"]);
export const WrappedShareIdSchema = z
	.string()
	.trim()
	.min(1)
	.max(128)
	.regex(/^[A-Za-z0-9_-]+$/u);

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

export const WrappedShareBackMetricSchema = z.object({
	label: z.string(),
	slot: z.enum(["body", "footer"]).optional(),
	value: z.string().min(1),
});

export const WrappedShareRevealMetricsSchema = z.object({
	avgSessionMin: z.number().nonnegative().nullable(),
	commitRate: z.number().min(0).max(100).nullable(),
	daysSinceFirst: z.number().nonnegative(),
	distinctProjectCount: z.number().nonnegative(),
	longestSessionMin: z.number().nonnegative().nullable(),
});

export const WrappedShareAppearanceSchema = z.object({
	layoutMode: WrappedShareLayoutModeSchema,
	showArchetypeLabel: z.boolean(),
});
const WrappedShareSocialImageDataUrlSchema = z
	.string()
	.max(7_000_000)
	.regex(/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/u);

export const WrappedShareRowSchema = z.object({
	// These are the card-safe fields needed to faithfully replay the selected card
	// on a public route. We do not include email, internal ids, or raw analytics
	// records here because the public page only needs the rendered snapshot values.
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
	// The snapshot is a fully materialized replay payload. The public page should
	// not need to recompute metrics or hit private analytics queries.
	appearance: WrappedShareAppearanceSchema.optional(),
	archetypeLabel: z.string().min(1),
	backMetrics: z.array(WrappedShareBackMetricSchema).optional(),
	headerLeftMetric: WrappedShareHeaderMetricSchema.optional(),
	headerRightMetric: WrappedShareHeaderMetricSchema.optional(),
	revealMetrics: WrappedShareRevealMetricsSchema.optional(),
	row: WrappedShareRowSchema,
	shellClassName: z.string().min(1),
	socialImageDataUrl: WrappedShareSocialImageDataUrlSchema.optional(),
	statItems: z.array(WrappedShareStatItemSchema),
	theme: WrappedShareThemeSchema,
});

export const PublicWrappedShareSnapshotSchema = WrappedShareSnapshotSchema.omit(
	{
		socialImageDataUrl: true,
	},
);

export const CreateWrappedShareInputSchema = z.object({
	snapshot: WrappedShareSnapshotSchema,
	variant: WrappedShareVariantSchema.default("normal"),
});

export const GetPublicWrappedShareInputSchema = z.object({
	// This accepts both current display-name share ids and older UUID rows.
	shareId: WrappedShareIdSchema,
});

export const WrappedShareRecordSchema = z.object({
	created_at: z.string(),
	expires_at: z.string(),
	id: WrappedShareIdSchema,
	variant: WrappedShareVariantSchema,
});

export const PublicWrappedShareSchema = WrappedShareRecordSchema.extend({
	snapshot: PublicWrappedShareSnapshotSchema,
});

export type WrappedShareTheme = z.infer<typeof WrappedShareThemeSchema>;
export type WrappedShareVariant = z.infer<typeof WrappedShareVariantSchema>;
export type WrappedShareLayoutMode = z.infer<
	typeof WrappedShareLayoutModeSchema
>;
export type WrappedShareHeaderMetric = z.infer<
	typeof WrappedShareHeaderMetricSchema
>;
export type WrappedShareStatItem = z.infer<typeof WrappedShareStatItemSchema>;
export type WrappedShareBackMetric = z.infer<
	typeof WrappedShareBackMetricSchema
>;
export type WrappedShareRevealMetrics = z.infer<
	typeof WrappedShareRevealMetricsSchema
>;
export type WrappedShareAppearance = z.infer<
	typeof WrappedShareAppearanceSchema
>;
export type WrappedShareRow = z.infer<typeof WrappedShareRowSchema>;
export type WrappedShareSnapshot = z.infer<typeof WrappedShareSnapshotSchema>;
export type PublicWrappedShareSnapshot = z.infer<
	typeof PublicWrappedShareSnapshotSchema
>;
export type CreateWrappedShareInput = z.infer<
	typeof CreateWrappedShareInputSchema
>;
export type GetPublicWrappedShareInput = z.infer<
	typeof GetPublicWrappedShareInputSchema
>;
export type WrappedShareRecord = z.infer<typeof WrappedShareRecordSchema>;
export type PublicWrappedShare = z.infer<typeof PublicWrappedShareSchema>;
