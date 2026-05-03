import type {
	PublicWrappedShare,
	WrappedShareRecord,
	WrappedShareSnapshot,
} from "@rudel/api-routes";
import {
	AVATAR_URL_PATH_REGEX,
	WRAPPED_SHARE_PAYLOAD_VERSION,
	WrappedShareSnapshotSchema,
} from "@rudel/api-routes";
import { sqlClient } from "../db.js";
import {
	buildWrappedShareIdBase,
	getNextWrappedShareIdCandidate,
	isWrappedShareIdAlignedWithBase,
} from "./wrapped-share-slug.js";

interface CreateWrappedShareOptions {
	organizationId: string;
	snapshot: WrappedShareSnapshot;
	userId: string;
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
	const { organizationId, snapshot, userId } = options;
	const existingShare = await getWrappedShareForUser(userId);
	const shareIdBase = buildWrappedShareIdBase({
		displayName: snapshot.row.displayName,
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
				snapshot,
				userId,
			});
		}

		return updateWrappedShareSnapshot({
			expiresAtIso,
			organizationId,
			share: existingShare,
			snapshot,
			userId,
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
				user_id,
				created_at,
				expires_at
			)
			VALUES (
				${shareId},
				${organizationId},
				${WRAPPED_SHARE_PAYLOAD_VERSION},
				${JSON.stringify(snapshot)},
				${userId},
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
			};
		}

		const concurrentlyCreatedShare = await getWrappedShareForUser(userId);

		if (concurrentlyCreatedShare) {
			return updateWrappedShareSnapshot({
				expiresAtIso,
				organizationId,
				share: concurrentlyCreatedShare,
				snapshot,
				userId,
			});
		}
	}

	throw new Error("Could not allocate a wrapped share id");
}

async function updateWrappedShareSnapshot(input: {
	expiresAtIso: string;
	organizationId: string;
	share: { createdAt: Date; id: string };
	snapshot: WrappedShareSnapshot;
	userId: string;
}) {
	const { expiresAtIso, organizationId, share, snapshot, userId } = input;
	const updatedRows = await sqlClient<Array<{ id: string }>>`
		UPDATE wrapped_share
		SET
			organization_id = ${organizationId},
			payload_version = ${WRAPPED_SHARE_PAYLOAD_VERSION},
			snapshot_json = ${JSON.stringify(snapshot)},
			expires_at = ${expiresAtIso}
		WHERE id = ${share.id}
			AND user_id = ${userId}
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
	};
}

async function renameWrappedShareAndUpdateSnapshot(input: {
	expiresAtIso: string;
	organizationId: string;
	share: { createdAt: Date; id: string };
	shareIdBase: string;
	snapshot: WrappedShareSnapshot;
	userId: string;
}) {
	const { expiresAtIso, organizationId, share, shareIdBase, snapshot, userId } =
		input;

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
				snapshot_json = ${JSON.stringify(snapshot)},
				expires_at = ${expiresAtIso}
			WHERE id = ${share.id}
				AND user_id = ${userId}
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
			};
		}
	}

	throw new Error("Could not rename wrapped share");
}

async function getWrappedShareForUser(userId: string) {
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
): Promise<PublicWrappedShare | null> {
	const [row] = await sqlClient<
		Array<{
			createdAt: Date | string;
			expiresAt: Date | string;
			id: string;
			payloadVersion: number;
			snapshotJson: string;
			userImage: string | null;
		}>
	>`
		SELECT
			wrapped_share.id,
			wrapped_share.created_at AS "createdAt",
			wrapped_share.expires_at AS "expiresAt",
			wrapped_share.payload_version AS "payloadVersion",
			wrapped_share.snapshot_json AS "snapshotJson",
			"user".image AS "userImage"
		FROM wrapped_share
		LEFT JOIN "user" ON "user".id = wrapped_share.user_id
		WHERE wrapped_share.id = ${shareId}
		LIMIT 1
	`;

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

	return {
		created_at: createdAt.toISOString(),
		expires_at: expiresAt.toISOString(),
		id: row.id,
		snapshot: hydrateWrappedShareSnapshotProfile({
			profileImageUrl: row.userImage,
			snapshot: parseWrappedShareSnapshot(row.snapshotJson),
		}),
	};
}

// Validate the stored JSON on the way out so corrupt or stale payloads fail
// loudly at the service boundary instead of leaking invalid UI state downstream.
function parseWrappedShareSnapshot(snapshotJson: string): WrappedShareSnapshot {
	const parsedSnapshot = JSON.parse(snapshotJson) as unknown;
	return WrappedShareSnapshotSchema.parse(parsedSnapshot);
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
