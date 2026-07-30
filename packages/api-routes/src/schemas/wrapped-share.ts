import { z } from "zod";

// Version the public share payload explicitly so the server can reject older
// persisted snapshots if the share card shape changes after launch.
export const WRAPPED_SHARE_PAYLOAD_VERSION = 1 as const;

// One shared budget protects storage, anonymous API reads, and browser rendering.
// Replay JSON and the optional social image are stored and loaded independently.
export const WRAPPED_SHARE_RESOURCE_LIMITS = {
	backMetricCount: 20,
	classNameLength: 512,
	imageUrlLength: 2048,
	snapshotBytes: 64 * 1024,
	socialImageBytes: 1024 * 1024,
	statItemCount: 8,
	textLength: 256,
} as const;

const WRAPPED_SHARE_SOCIAL_IMAGE_DATA_URL_PREFIX = "data:image/png;base64,";
export const WRAPPED_SHARE_SOCIAL_IMAGE_DATA_URL_MAX_LENGTH =
	WRAPPED_SHARE_SOCIAL_IMAGE_DATA_URL_PREFIX.length +
	Math.ceil(WRAPPED_SHARE_RESOURCE_LIMITS.socialImageBytes / 3) * 4;
const WrappedShareTextSchema = z
	.string()
	.max(WRAPPED_SHARE_RESOURCE_LIMITS.textLength);
const WrappedShareRequiredTextSchema = WrappedShareTextSchema.min(1);

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

export const WrappedShareHeaderMetricSchema = z
	.object({
		label: WrappedShareTextSchema.optional(),
		title: WrappedShareTextSchema.optional(),
		value: WrappedShareRequiredTextSchema,
	})
	.strict();

export const WrappedShareStatItemIconSchema = z.enum(["claude", "codex"]);

export const WrappedShareStatItemSchema = z
	.object({
		icon: WrappedShareStatItemIconSchema.optional(),
		key: WrappedShareRequiredTextSchema.regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/u),
		label: WrappedShareTextSchema.optional(),
		title: WrappedShareTextSchema.optional(),
		value: WrappedShareRequiredTextSchema,
	})
	.strict();

export const WrappedShareBackMetricSchema = z
	.object({
		label: WrappedShareTextSchema,
		slot: z.enum(["body", "footer"]).optional(),
		value: WrappedShareRequiredTextSchema,
	})
	.strict();

export const WrappedShareRevealMetricsSchema = z
	.object({
		avgSessionMin: z.number().nonnegative().nullable(),
		commitRate: z.number().min(0).max(100).nullable(),
		daysSinceFirst: z.number().nonnegative(),
		distinctProjectCount: z.number().nonnegative(),
		longestSessionMin: z.number().nonnegative().nullable(),
	})
	.strict();

export const WrappedShareAppearanceSchema = z
	.object({
		layoutMode: WrappedShareLayoutModeSchema,
		showArchetypeLabel: z.boolean(),
	})
	.strict();
export const WrappedShareSocialImageDataUrlSchema = z
	.string()
	.max(WRAPPED_SHARE_SOCIAL_IMAGE_DATA_URL_MAX_LENGTH)
	.regex(/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/u)
	.refine(isWrappedShareSocialImageWithinByteLimit, {
		message: `Wrapped share social image must be at most ${WRAPPED_SHARE_RESOURCE_LIMITS.socialImageBytes} bytes`,
	});

export const WrappedShareRowSchema = z
	.object({
		// These are the card-safe fields needed to faithfully replay the selected card
		// on a public route. We do not include email, internal ids, or raw analytics
		// records here because the public page only needs the rendered snapshot values.
		activeDays: z.number().nonnegative(),
		cost: z.number().nonnegative(),
		displayName: WrappedShareRequiredTextSchema,
		favoriteModel: WrappedShareTextSchema.nullable(),
		hasActivity: z.boolean(),
		imageUrl: z
			.string()
			.max(WRAPPED_SHARE_RESOURCE_LIMITS.imageUrlLength)
			.nullable(),
		inputTokens: z.number().nonnegative(),
		lastActiveDate: WrappedShareTextSchema.nullable(),
		outputTokens: z.number().nonnegative(),
		role: WrappedShareRequiredTextSchema,
		totalSessions: z.number().nonnegative(),
		totalTokens: z.number().nonnegative(),
	})
	.strict();

const WrappedShareSnapshotObjectSchema = z
	.object({
		// The snapshot is a fully materialized replay payload. The public page should
		// not need to recompute metrics or hit private analytics queries.
		appearance: WrappedShareAppearanceSchema.optional(),
		archetypeLabel: WrappedShareRequiredTextSchema,
		backMetrics: z
			.array(WrappedShareBackMetricSchema)
			.max(WRAPPED_SHARE_RESOURCE_LIMITS.backMetricCount)
			.optional(),
		headerLeftMetric: WrappedShareHeaderMetricSchema.optional(),
		headerRightMetric: WrappedShareHeaderMetricSchema.optional(),
		revealMetrics: WrappedShareRevealMetricsSchema.optional(),
		row: WrappedShareRowSchema,
		shellClassName: z
			.string()
			.min(1)
			.max(WRAPPED_SHARE_RESOURCE_LIMITS.classNameLength),
		statItems: z
			.array(WrappedShareStatItemSchema)
			.max(WRAPPED_SHARE_RESOURCE_LIMITS.statItemCount),
		theme: WrappedShareThemeSchema,
	})
	.strict();

export const WrappedShareSnapshotSchema =
	WrappedShareSnapshotObjectSchema.refine(
		isWrappedShareSnapshotWithinByteLimit,
		{
			message: `Wrapped share snapshot must be at most ${WRAPPED_SHARE_RESOURCE_LIMITS.snapshotBytes} bytes`,
		},
	);

export const PublicWrappedShareSnapshotSchema = WrappedShareSnapshotSchema;

export const CreateWrappedShareInputSchema = z
	.object({
		socialImageDataUrl: WrappedShareSocialImageDataUrlSchema.optional(),
		snapshot: WrappedShareSnapshotSchema,
		variant: WrappedShareVariantSchema.default("normal"),
	})
	.strict();

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
export type WrappedShareSocialImageDataUrl = z.infer<
	typeof WrappedShareSocialImageDataUrlSchema
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

export function getWrappedShareSnapshotByteLength(snapshot: object) {
	const snapshotJson = JSON.stringify(snapshot);

	if (snapshotJson === undefined) {
		return 0;
	}

	return new TextEncoder().encode(snapshotJson).byteLength;
}

function isWrappedShareSnapshotWithinByteLimit(snapshot: object) {
	return (
		getWrappedShareSnapshotByteLength(snapshot) <=
		WRAPPED_SHARE_RESOURCE_LIMITS.snapshotBytes
	);
}

function isWrappedShareSocialImageWithinByteLimit(dataUrl: string) {
	const base64 = dataUrl.slice(
		WRAPPED_SHARE_SOCIAL_IMAGE_DATA_URL_PREFIX.length,
	);
	const paddingLength = base64.endsWith("==")
		? 2
		: base64.endsWith("=")
			? 1
			: 0;
	const decodedBytes = (base64.length * 3) / 4 - paddingLength;

	return (
		Number.isInteger(decodedBytes) &&
		decodedBytes <= WRAPPED_SHARE_RESOURCE_LIMITS.socialImageBytes
	);
}
