import type {
	PublicWrappedShare,
	WrappedShareRecord,
	WrappedShareSnapshot,
} from "@rudel/api-routes";
import { WrappedShareSnapshotSchema } from "@rudel/api-routes";
import { sqlClient } from "../db.js";

interface CreateWrappedShareOptions {
	organizationId: string;
	snapshot: WrappedShareSnapshot;
	userId: string;
}

export async function createWrappedShare(
	options: CreateWrappedShareOptions,
): Promise<WrappedShareRecord> {
	const { organizationId, snapshot, userId } = options;
	const shareId = crypto.randomUUID();
	const createdAt = new Date();

	await sqlClient`
		INSERT INTO wrapped_share (id, organization_id, snapshot_json, user_id, created_at)
		VALUES (
			${shareId},
			${organizationId},
			${JSON.stringify(snapshot)},
			${userId},
			${createdAt}
		)
	`;

	return {
		created_at: createdAt.toISOString(),
		id: shareId,
	};
}

export async function getPublicWrappedShare(
	shareId: string,
): Promise<PublicWrappedShare | null> {
	const [row] = await sqlClient<
		Array<{
			createdAt: Date;
			id: string;
			snapshotJson: string;
		}>
	>`
		SELECT
			id,
			created_at AS "createdAt",
			snapshot_json AS "snapshotJson"
		FROM wrapped_share
		WHERE id = ${shareId}
		LIMIT 1
	`;

	if (!row) {
		return null;
	}

	return {
		created_at: row.createdAt.toISOString(),
		id: row.id,
		snapshot: parseWrappedShareSnapshot(row.snapshotJson),
	};
}

function parseWrappedShareSnapshot(snapshotJson: string): WrappedShareSnapshot {
	const parsedSnapshot = JSON.parse(snapshotJson) as unknown;
	return WrappedShareSnapshotSchema.parse(parsedSnapshot);
}
