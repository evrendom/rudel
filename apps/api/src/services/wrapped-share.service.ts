import { ORPCError } from "@orpc/server";
import type {
	PublicWrappedShare,
	WrappedShareRecord,
	WrappedShareSnapshot,
	WrappedShareVariant,
} from "@rudel/api-routes";
import {
	AVATAR_URL_PATH_REGEX,
	WRAPPED_SHARE_PAYLOAD_VERSION,
	WRAPPED_SHARE_RESOURCE_LIMITS,
	WRAPPED_SHARE_SOCIAL_IMAGE_DATA_URL_MAX_LENGTH,
	WrappedShareSnapshotSchema,
	WrappedShareSocialImageDataUrlSchema,
} from "@rudel/api-routes";
import { queryClickhouse } from "../clickhouse.js";
import { sqlClient } from "../db.js";
import { checkWrappedShareLookupRateLimit } from "../rate-limit.js";
import { buildSessionEstimatedCostSql } from "./pricing.service.js";
import {
	buildWrappedShareIdBase,
	getNextWrappedShareIdCandidate,
	isWrappedShareIdAlignedWithBase,
} from "./wrapped-share-slug.js";

interface CreateWrappedShareOptions {
	organizationId: string;
	socialImageDataUrl?: string;
	snapshot: WrappedShareSnapshot;
	userId: string;
	variant: WrappedShareVariant;
}

interface PublicWrappedShareWithSocialImage extends PublicWrappedShare {
	socialImageDataUrl: string | null;
}

interface PublicWrappedShareForPageMetadata extends PublicWrappedShare {
	hasSocialImage: boolean;
}

interface WrappedShareDatabaseRow {
	createdAt: Date | string;
	expiresAt: Date | string;
	id: string;
	payloadVersion: number;
	snapshotJson: string;
	userImage: string | null;
	variant: WrappedShareVariant | null;
}

interface WrappedShareDatabaseRowWithSocialImage
	extends WrappedShareDatabaseRow {
	socialImageDataUrl: string | null;
}

interface WrappedShareDatabaseRowForPageMetadata
	extends WrappedShareDatabaseRow {
	hasSocialImage: boolean;
}

interface WrappedSharePricingRow {
	estimatedCostUsd: number | string | null;
	commitSessions: number | string | null;
	unpricedSessionCount: number | string | null;
	unpricedTokenCount: number | string | null;
}

const WRAPPED_SHARE_TTL_DAYS = 30;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
const WRAPPED_SHARE_ID_INSERT_ATTEMPTS = 20;

// Persist a fully rendered public snapshot. We store the already-resolved card
// data instead of rebuilding it later so the public share route stays simple and
// never needs access to the creator's private analytics queries.
export async function createWrappedShare(
	options: CreateWrappedShareOptions,
): Promise<WrappedShareRecord> {
	const { organizationId, userId, variant } = options;
	const submittedSnapshot = WrappedShareSnapshotSchema.parse(options.snapshot);
	const socialImageDataUrl =
		options.socialImageDataUrl === undefined
			? null
			: WrappedShareSocialImageDataUrlSchema.parse(options.socialImageDataUrl);

	if (variant === "decimal") {
		await assertDecimalEntitled(userId);
	}

	const pricing = await getAuthoritativeWrappedSharePricing(
		organizationId,
		userId,
	);
	if (pricing.unpricedSessionCount > 0 || pricing.unpricedTokenCount > 0) {
		throw new ORPCError("BAD_REQUEST", {
			message:
				"Wrapped sharing is unavailable until pricing is available for every session",
		});
	}
	const snapshot = WrappedShareSnapshotSchema.parse(
		overrideWrappedSharePricing(submittedSnapshot, pricing),
	);
	const snapshotJson = JSON.stringify(snapshot);

	const existingShare = await getWrappedShareForUser(userId, variant);
	const shareIdBase = buildWrappedShareIdBase({
		displayName: snapshot.row.displayName,
		variant,
	});
	const createdAt = new Date();
	const expiresAt = createWrappedShareExpiry(createdAt);
	const expiresAtIso = expiresAt.toISOString();

	if (existingShare) {
		if (
			!isWrappedShareIdAlignedWithBase({
				baseId: shareIdBase,
				shareId: existingShare.id,
			})
		) {
			return renameWrappedShareAndUpdateSnapshot({
				expiresAtIso,
				organizationId,
				share: existingShare,
				shareIdBase,
				socialImageDataUrl,
				snapshotJson,
				userId,
				variant,
			});
		}

		return updateWrappedShareSnapshot({
			expiresAtIso,
			organizationId,
			share: existingShare,
			socialImageDataUrl,
			snapshotJson,
			userId,
			variant,
		});
	}

	const createdAtIso = createdAt.toISOString();

	for (
		let attempt = 0;
		attempt < WRAPPED_SHARE_ID_INSERT_ATTEMPTS;
		attempt += 1
	) {
		const shareId = await buildAvailableWrappedShareId(shareIdBase);
		const insertedRows = await sqlClient<Array<{ id: string }>>`
			INSERT INTO wrapped_share (
				id,
				organization_id,
				payload_version,
				snapshot_json,
				social_image_data_url,
				user_id,
				variant,
				created_at,
				expires_at
			)
			VALUES (
				${shareId},
				${organizationId},
				${WRAPPED_SHARE_PAYLOAD_VERSION},
				${snapshotJson},
				${socialImageDataUrl},
				${userId},
				${variant},
				${createdAtIso},
				${expiresAtIso}
			)
			ON CONFLICT DO NOTHING
			RETURNING id
		`;

		const insertedShareId = insertedRows[0]?.id;

		if (insertedShareId) {
			return {
				created_at: createdAtIso,
				expires_at: expiresAtIso,
				id: insertedShareId,
				variant,
			};
		}

		const concurrentlyCreatedShare = await getWrappedShareForUser(
			userId,
			variant,
		);

		if (concurrentlyCreatedShare) {
			return updateWrappedShareSnapshot({
				expiresAtIso,
				organizationId,
				share: concurrentlyCreatedShare,
				socialImageDataUrl,
				snapshotJson,
				userId,
				variant,
			});
		}
	}

	throw new Error("Could not allocate a wrapped share id");
}

async function getAuthoritativeWrappedSharePricing(
	organizationId: string,
	userId: string,
) {
	const estimatedCostSql = buildSessionEstimatedCostSql();
	const rows = await queryClickhouse<WrappedSharePricingRow>({
		query: `
			SELECT
				round(ifNull(sum(priced.estimated_cost), 0), 4) AS estimatedCostUsd,
				sum(ifNull(priced.has_commit, 0)) AS commitSessions,
				countIf(isNull(priced.estimated_cost)) AS unpricedSessionCount,
				sumIf(ifNull(priced.total_tokens, 0), isNull(priced.estimated_cost)) AS unpricedTokenCount
			FROM (
				SELECT *, ${estimatedCostSql} AS estimated_cost
				FROM rudel.session_analytics FINAL
				WHERE organization_id = {organizationId:String}
					AND user_id = {userId:String}
			) AS priced
		`,
		query_params: {
			organizationId,
			userId,
		},
	});
	const row = rows[0];

	return {
		estimatedCostUsd: toNonNegativeNumber(row?.estimatedCostUsd),
		commitSessions: toNonNegativeNumber(row?.commitSessions),
		unpricedSessionCount: toNonNegativeNumber(row?.unpricedSessionCount),
		unpricedTokenCount: toNonNegativeNumber(row?.unpricedTokenCount),
	};
}

function overrideWrappedSharePricing(
	snapshot: WrappedShareSnapshot,
	pricing: {
		estimatedCostUsd: number;
		commitSessions: number;
		unpricedSessionCount: number;
		unpricedTokenCount: number;
	},
): WrappedShareSnapshot {
	const formattedSpend = new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: "USD",
		notation: "compact",
		maximumFractionDigits: 0,
	}).format(pricing.estimatedCostUsd);
	const spendInteger = Math.round(pricing.estimatedCostUsd).toLocaleString(
		"en-US",
	);
	const spendPerCommit =
		pricing.commitSessions > 0
			? Number(
					(pricing.estimatedCostUsd / pricing.commitSessions).toFixed(2),
				).toLocaleString("en-US")
			: "0";

	// Existing public snapshots remain frozen for their normal 30-day lifetime.
	// Only create/update crosses this authoritative pricing boundary.
	return {
		...snapshot,
		backMetrics: snapshot.backMetrics?.map((metric) => {
			if (metric.label === "Spent") {
				return { ...metric, value: spendInteger };
			}
			if (metric.label === "Dollar per commit") {
				return { ...metric, value: spendPerCommit };
			}
			return metric;
		}),
		headerLeftMetric: overrideSnapshotSpendMetric(
			snapshot.headerLeftMetric,
			formattedSpend,
		),
		headerRightMetric: overrideSnapshotSpendMetric(
			snapshot.headerRightMetric,
			formattedSpend,
		),
		row: {
			...snapshot.row,
			cost: pricing.estimatedCostUsd,
		},
		statItems: snapshot.statItems.map((item) =>
			overrideSnapshotSpendMetric(item, formattedSpend),
		),
	};
}

function overrideSnapshotSpendMetric<
	T extends { label?: string; title?: string; value: string },
>(metric: T, formattedSpend: string): T;
function overrideSnapshotSpendMetric<
	T extends { label?: string; title?: string; value: string },
>(metric: T | undefined, formattedSpend: string): T | undefined;
function overrideSnapshotSpendMetric<
	T extends { label?: string; title?: string; value: string },
>(metric: T | undefined, formattedSpend: string): T | undefined {
	if (!metric) {
		return undefined;
	}
	const descriptor = `${metric.label ?? ""} ${metric.title ?? ""}`;
	if (!/(?:cost|spend)/iu.test(descriptor)) {
		return metric;
	}

	return {
		...metric,
		title:
			metric.title === undefined
				? undefined
				: `${formattedSpend} estimated spend`,
		value: formattedSpend,
	};
}

function toNonNegativeNumber(value: number | string | null | undefined) {
	const numeric = Number(value ?? 0);
	return Number.isFinite(numeric) ? Math.max(0, numeric) : 0;
}

// Decimal share creation is server-gated: the only authoritative source of
// entitlement is a claimed row in wrapped_decimal_claim. Frontend checks are UX
// only — a non-entitled caller cannot mint a Decimal share by editing the body.
async function assertDecimalEntitled(userId: string): Promise<void> {
	const rows = await sqlClient<Array<{ exists: number }>>`
		SELECT 1 AS "exists"
		FROM wrapped_decimal_claim
		WHERE claimed_by_user_id = ${userId}
		LIMIT 1
	`;

	if (rows.length === 0) {
		throw new ORPCError("FORBIDDEN", {
			message: "Decimal wrapped is not available for this account",
		});
	}
}

async function updateWrappedShareSnapshot(input: {
	expiresAtIso: string;
	organizationId: string;
	share: { createdAt: Date; id: string };
	socialImageDataUrl: string | null;
	snapshotJson: string;
	userId: string;
	variant: WrappedShareVariant;
}) {
	const {
		expiresAtIso,
		organizationId,
		share,
		socialImageDataUrl,
		snapshotJson,
		userId,
		variant,
	} = input;
	const updatedRows = await sqlClient<Array<{ id: string }>>`
		UPDATE wrapped_share
		SET
			organization_id = ${organizationId},
			payload_version = ${WRAPPED_SHARE_PAYLOAD_VERSION},
			snapshot_json = ${snapshotJson},
			social_image_data_url = ${socialImageDataUrl},
			expires_at = ${expiresAtIso}
		WHERE id = ${share.id}
			AND user_id = ${userId}
			AND variant = ${variant}
		RETURNING id
	`;
	const updatedShareId = updatedRows[0]?.id;

	if (!updatedShareId) {
		throw new Error("Could not update wrapped share");
	}

	return {
		created_at: share.createdAt.toISOString(),
		expires_at: expiresAtIso,
		id: updatedShareId,
		variant,
	};
}

async function renameWrappedShareAndUpdateSnapshot(input: {
	expiresAtIso: string;
	organizationId: string;
	share: { createdAt: Date; id: string };
	shareIdBase: string;
	socialImageDataUrl: string | null;
	snapshotJson: string;
	userId: string;
	variant: WrappedShareVariant;
}) {
	const {
		expiresAtIso,
		organizationId,
		share,
		shareIdBase,
		socialImageDataUrl,
		snapshotJson,
		userId,
		variant,
	} = input;

	for (
		let attempt = 0;
		attempt < WRAPPED_SHARE_ID_INSERT_ATTEMPTS;
		attempt += 1
	) {
		const shareId = await buildAvailableWrappedShareId(shareIdBase, share.id);
		const updatedRows = await sqlClient<Array<{ id: string }>>`
			UPDATE wrapped_share
			SET
				id = ${shareId},
				organization_id = ${organizationId},
				payload_version = ${WRAPPED_SHARE_PAYLOAD_VERSION},
				snapshot_json = ${snapshotJson},
				social_image_data_url = ${socialImageDataUrl},
				expires_at = ${expiresAtIso}
			WHERE id = ${share.id}
				AND user_id = ${userId}
				AND variant = ${variant}
				AND NOT EXISTS (
					SELECT 1
					FROM wrapped_share
					WHERE id = ${shareId}
				)
			RETURNING id
		`;
		const updatedShareId = updatedRows[0]?.id;

		if (updatedShareId) {
			return {
				created_at: share.createdAt.toISOString(),
				expires_at: expiresAtIso,
				id: updatedShareId,
				variant,
			};
		}
	}

	throw new Error("Could not rename wrapped share");
}

async function getWrappedShareForUser(
	userId: string,
	variant: WrappedShareVariant,
) {
	const [row] = await sqlClient<
		Array<{
			createdAt: Date | string;
			id: string;
		}>
	>`
		SELECT
			id,
			created_at AS "createdAt"
		FROM wrapped_share
		WHERE user_id = ${userId}
			AND variant = ${variant}
		ORDER BY created_at ASC
		LIMIT 1
	`;

	if (!row) {
		return null;
	}

	return {
		createdAt: toDate(row.createdAt),
		id: row.id,
	};
}

// Public share lookup deliberately returns only the persisted snapshot payload.
// That makes the read path small, cache-friendly, and safe for anonymous access.
export async function getPublicWrappedShare(
	shareId: string,
	source: string,
): Promise<PublicWrappedShare | null> {
	checkWrappedShareLookupRateLimit(shareId, source);
	const row = await getPublicWrappedShareRow(shareId);
	return buildPublicWrappedShare(row);
}

export async function getPublicWrappedShareWithSocialImage(
	shareId: string,
	source: string,
): Promise<PublicWrappedShareWithSocialImage | null> {
	checkWrappedShareLookupRateLimit(shareId, source);
	const row = await getPublicWrappedShareRowWithSocialImage(shareId);
	const share = buildPublicWrappedShare(row);

	if (!share || !row) {
		return null;
	}

	return {
		...share,
		socialImageDataUrl: parseWrappedShareSocialImage(row.socialImageDataUrl),
	};
}

export async function getPublicWrappedShareForPageMetadata(
	shareId: string,
	source: string,
): Promise<PublicWrappedShareForPageMetadata | null> {
	checkWrappedShareLookupRateLimit(shareId, source);
	const row = await getPublicWrappedShareRowForPageMetadata(shareId);
	const share = buildPublicWrappedShare(row);

	if (!share || !row) {
		return null;
	}

	return {
		...share,
		hasSocialImage: row.hasSocialImage,
	};
}

async function getPublicWrappedShareRow(
	shareId: string,
): Promise<WrappedShareDatabaseRow | null> {
	const [row] = await sqlClient<Array<WrappedShareDatabaseRow>>`
		SELECT
			wrapped_share.id,
			wrapped_share.created_at AS "createdAt",
			wrapped_share.expires_at AS "expiresAt",
			wrapped_share.payload_version AS "payloadVersion",
			wrapped_share.snapshot_json AS "snapshotJson",
			wrapped_share.variant AS "variant",
			"user".image AS "userImage"
		FROM wrapped_share
		LEFT JOIN "user" ON "user".id = wrapped_share.user_id
		WHERE wrapped_share.id = ${shareId}
			AND octet_length(wrapped_share.snapshot_json) <= ${WRAPPED_SHARE_RESOURCE_LIMITS.snapshotBytes}
		LIMIT 1
	`;

	return row ?? null;
}

async function getPublicWrappedShareRowWithSocialImage(
	shareId: string,
): Promise<WrappedShareDatabaseRowWithSocialImage | null> {
	const [row] = await sqlClient<Array<WrappedShareDatabaseRowWithSocialImage>>`
		SELECT
			wrapped_share.id,
			wrapped_share.created_at AS "createdAt",
			wrapped_share.expires_at AS "expiresAt",
			wrapped_share.payload_version AS "payloadVersion",
			wrapped_share.snapshot_json AS "snapshotJson",
			CASE
				WHEN octet_length(wrapped_share.social_image_data_url) <= ${WRAPPED_SHARE_SOCIAL_IMAGE_DATA_URL_MAX_LENGTH}
					THEN wrapped_share.social_image_data_url
				ELSE NULL
			END AS "socialImageDataUrl",
			wrapped_share.variant AS "variant",
			"user".image AS "userImage"
		FROM wrapped_share
		LEFT JOIN "user" ON "user".id = wrapped_share.user_id
		WHERE wrapped_share.id = ${shareId}
			AND octet_length(wrapped_share.snapshot_json) <= ${WRAPPED_SHARE_RESOURCE_LIMITS.snapshotBytes}
		LIMIT 1
	`;

	return row ?? null;
}

async function getPublicWrappedShareRowForPageMetadata(
	shareId: string,
): Promise<WrappedShareDatabaseRowForPageMetadata | null> {
	const [row] = await sqlClient<Array<WrappedShareDatabaseRowForPageMetadata>>`
		SELECT
			wrapped_share.id,
			wrapped_share.created_at AS "createdAt",
			wrapped_share.expires_at AS "expiresAt",
			wrapped_share.payload_version AS "payloadVersion",
			wrapped_share.snapshot_json AS "snapshotJson",
			wrapped_share.social_image_data_url IS NOT NULL AS "hasSocialImage",
			wrapped_share.variant AS "variant",
			"user".image AS "userImage"
		FROM wrapped_share
		LEFT JOIN "user" ON "user".id = wrapped_share.user_id
		WHERE wrapped_share.id = ${shareId}
			AND octet_length(wrapped_share.snapshot_json) <= ${WRAPPED_SHARE_RESOURCE_LIMITS.snapshotBytes}
		LIMIT 1
	`;

	return row ?? null;
}

function buildPublicWrappedShare(
	row: WrappedShareDatabaseRow | null,
): PublicWrappedShare | null {
	if (!row) {
		return null;
	}

	const createdAt = toDate(row.createdAt);
	const expiresAt = toDate(row.expiresAt);

	if (isWrappedShareExpired(expiresAt)) {
		return null;
	}

	if (!isWrappedSharePayloadSupported(row.payloadVersion)) {
		return null;
	}

	const snapshot = parseWrappedShareSnapshot(row.snapshotJson);

	if (!snapshot) {
		return null;
	}

	return {
		created_at: createdAt.toISOString(),
		expires_at: expiresAt.toISOString(),
		id: row.id,
		snapshot: hydrateWrappedShareSnapshotProfile({
			profileImageUrl: row.userImage,
			snapshot,
		}),
		variant: row.variant ?? "normal",
	};
}

// Stored rows can predate the current budget. Invalid or oversized snapshots
// fail closed as a missing public share instead of reaching anonymous renderers.
function parseWrappedShareSnapshot(
	snapshotJson: string,
): WrappedShareSnapshot | null {
	if (
		new TextEncoder().encode(snapshotJson).byteLength >
		WRAPPED_SHARE_RESOURCE_LIMITS.snapshotBytes
	) {
		return null;
	}

	let parsedSnapshot: unknown;
	try {
		parsedSnapshot = JSON.parse(snapshotJson);
	} catch {
		return null;
	}

	const result = WrappedShareSnapshotSchema.safeParse(parsedSnapshot);
	return result.success ? result.data : null;
}

function parseWrappedShareSocialImage(
	socialImageDataUrl: string | null,
): string | null {
	if (!socialImageDataUrl) {
		return null;
	}

	const result =
		WrappedShareSocialImageDataUrlSchema.safeParse(socialImageDataUrl);
	return result.success ? result.data : null;
}

function hydrateWrappedShareSnapshotProfile(input: {
	profileImageUrl: string | null;
	snapshot: WrappedShareSnapshot;
}) {
	const { profileImageUrl, snapshot } = input;
	const snapshotImageUrl = snapshot.row.imageUrl;
	const safeProfileImageUrl = getSafePublicProfileImageUrl(profileImageUrl);

	const snapshotPointsAtUploadedAvatar =
		typeof snapshotImageUrl === "string" &&
		AVATAR_URL_PATH_REGEX.test(snapshotImageUrl);

	// Snapshot pinned an /api/avatar/<id> URL but the user has since replaced
	// or cleared their avatar — follow the live profile so the share tracks the
	// "card image is user profile" identity. Bytes for an old publicId are gone
	// and would 404 on every public render otherwise.
	if (snapshotPointsAtUploadedAvatar && snapshotImageUrl !== profileImageUrl) {
		return {
			...snapshot,
			row: { ...snapshot.row, imageUrl: safeProfileImageUrl },
		};
	}

	if (snapshotImageUrl) {
		return snapshot;
	}

	if (!safeProfileImageUrl) {
		return snapshot;
	}

	return {
		...snapshot,
		row: {
			...snapshot.row,
			imageUrl: safeProfileImageUrl,
		},
	};
}

function getSafePublicProfileImageUrl(imageUrl: string | null) {
	const trimmedImageUrl = imageUrl?.trim();

	if (!trimmedImageUrl) {
		return null;
	}

	if (trimmedImageUrl.length > WRAPPED_SHARE_RESOURCE_LIMITS.imageUrlLength) {
		return null;
	}

	if (AVATAR_URL_PATH_REGEX.test(trimmedImageUrl)) {
		return trimmedImageUrl;
	}

	try {
		const parsedImageUrl = new URL(trimmedImageUrl);

		if (parsedImageUrl.protocol !== "https:") {
			return null;
		}

		return parsedImageUrl.toString();
	} catch {
		return null;
	}
}

async function buildAvailableWrappedShareId(
	baseId: string,
	excludedId?: string,
) {
	const existingIds = await getExistingWrappedShareIdsForBase(
		baseId,
		excludedId,
	);

	return getNextWrappedShareIdCandidate({
		baseId,
		existingIds,
	});
}

async function getExistingWrappedShareIdsForBase(
	baseId: string,
	excludedId?: string,
) {
	const prefixSuffix = `-${baseId}`;
	const prefixSuffixWithNumber = `-${baseId}-`;
	const rows = excludedId
		? await sqlClient<Array<{ id: string }>>`
			SELECT id
			FROM wrapped_share
			WHERE (id = ${baseId}
				OR right(id, ${prefixSuffix.length}) = ${prefixSuffix}
				OR position(${prefixSuffixWithNumber} IN id) > 0)
				AND id != ${excludedId}
		`
		: await sqlClient<Array<{ id: string }>>`
			SELECT id
			FROM wrapped_share
			WHERE id = ${baseId}
				OR right(id, ${prefixSuffix.length}) = ${prefixSuffix}
				OR position(${prefixSuffixWithNumber} IN id) > 0
		`;

	return rows.map((row) => row.id);
}

// Shares are intentionally short-lived so stale public links do not become a
// permanent shadow copy of a user's card.
function createWrappedShareExpiry(createdAt: Date) {
	return new Date(
		createdAt.getTime() + WRAPPED_SHARE_TTL_DAYS * MILLISECONDS_PER_DAY,
	);
}

// Expired shares fail closed into the public "link expired" state instead of
// rendering content from an old campaign or stale product contract.
function isWrappedShareExpired(expiresAt: Date) {
	return expiresAt.getTime() <= Date.now();
}

// Payload versioning gives us one explicit kill switch for older snapshot
// formats. If the persisted share shape changes later, old rows can safely stop
// rendering until migrated or regenerated.
function isWrappedSharePayloadSupported(payloadVersion: number) {
	return payloadVersion === WRAPPED_SHARE_PAYLOAD_VERSION;
}

function toDate(value: Date | string) {
	return value instanceof Date ? value : new Date(value);
}
