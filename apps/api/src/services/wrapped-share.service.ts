import type {
	PublicWrappedShare,
	WrappedShareRecord,
	WrappedShareSnapshot,
} from "@rudel/api-routes";
import {
	WRAPPED_SHARE_PAYLOAD_VERSION,
	WrappedShareSnapshotSchema,
} from "@rudel/api-routes";
import { sqlClient } from "../db";

interface CreateWrappedShareOptions {
	organizationId: string;
	snapshot: WrappedShareSnapshot;
	userId: string;
}

const WRAPPED_SHARE_TTL_DAYS = 30;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

// Persist a fully rendered public snapshot. We store the already-resolved card
// data instead of rebuilding it later so the public share route stays simple and
// never needs access to the creator's private analytics queries.
export async function createWrappedShare(
	options: CreateWrappedShareOptions,
): Promise<WrappedShareRecord> {
	const { organizationId, snapshot, userId } = options;
	const shareId = crypto.randomUUID();
	const createdAt = new Date();
	const expiresAt = createWrappedShareExpiry(createdAt);
	const createdAtIso = createdAt.toISOString();
	const expiresAtIso = expiresAt.toISOString();

	await sqlClient`
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
	`;

	return {
		created_at: createdAtIso,
		expires_at: expiresAtIso,
		id: shareId,
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
		}>
	>`
		SELECT
			id,
			created_at AS "createdAt",
			expires_at AS "expiresAt",
			payload_version AS "payloadVersion",
			snapshot_json AS "snapshotJson"
		FROM wrapped_share
		WHERE id = ${shareId}
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
		snapshot: parseWrappedShareSnapshot(row.snapshotJson),
	};
}

// Validate the stored JSON on the way out so corrupt or stale payloads fail
// loudly at the service boundary instead of leaking invalid UI state downstream.
function parseWrappedShareSnapshot(snapshotJson: string): WrappedShareSnapshot {
	const parsedSnapshot = JSON.parse(snapshotJson) as unknown;
	return WrappedShareSnapshotSchema.parse(parsedSnapshot);
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
