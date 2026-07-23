import { getLogger } from "@logtape/logtape";
import { ORPCError } from "@orpc/server";
import { getAllAdapters } from "@rudel/agent-adapters";
import { getClickhouse, getSafeClickHouseTable } from "../clickhouse.js";
import { sqlClient } from "../db.js";

const logger = getLogger(["rudel", "api", "session-ownership"]);
const OWNERSHIP_CONFLICT_MESSAGE =
	"This session belongs to another organization member and cannot be replaced.";

export async function assertSessionIngestOwnership(
	organizationId: string,
	sessionId: string,
	userId: string,
): Promise<void> {
	const registeredOwner = await getRegisteredOwner(organizationId, sessionId);
	if (registeredOwner) {
		assertCallerOwnsSession(registeredOwner, organizationId, sessionId, userId);
		return;
	}

	const existingOwners = await getExistingClickHouseOwners(
		organizationId,
		sessionId,
	);
	if (existingOwners.length > 1) {
		logger.warn(
			"Session ingest rejected because existing ownership is ambiguous (organization_id={organizationId} session_id={sessionId} user_id={userId} owner_count={ownerCount})",
			{
				organizationId,
				ownerCount: existingOwners.length,
				sessionId,
				userId,
			},
		);
		throwOwnershipConflict();
	}

	const candidateOwner = existingOwners[0] ?? userId;
	const reservedOwner = await reserveSessionOwner(
		organizationId,
		sessionId,
		candidateOwner,
	);
	assertCallerOwnsSession(reservedOwner, organizationId, sessionId, userId);
}

async function getRegisteredOwner(
	organizationId: string,
	sessionId: string,
): Promise<string | null> {
	const [row] = await sqlClient<Array<{ user_id: string }>>`
		SELECT user_id
		FROM session_ownership
		WHERE organization_id = ${organizationId}
			AND session_id = ${sessionId}
		LIMIT 1
	`;
	return row?.user_id ?? null;
}

async function getExistingClickHouseOwners(
	organizationId: string,
	sessionId: string,
): Promise<string[]> {
	const clickhouse = getClickhouse();
	const ownerRows = await Promise.all(
		getAllAdapters().map((adapter) =>
			clickhouse.query<{ user_id: string }>({
				query: `
					SELECT DISTINCT user_id
					FROM ${getSafeClickHouseTable(adapter.rawTableName)} FINAL
					WHERE organization_id = {organizationId:String}
						AND session_id = {sessionId:String}
					LIMIT 2
				`,
				query_params: { organizationId, sessionId },
			}),
		),
	);

	return [
		...new Set(
			ownerRows
				.flat()
				.map((row) => row.user_id)
				.filter((ownerId) => ownerId.length > 0),
		),
	];
}

async function reserveSessionOwner(
	organizationId: string,
	sessionId: string,
	candidateOwner: string,
): Promise<string> {
	return sqlClient.begin(async (transaction) => {
		await transaction.unsafe(
			`
			INSERT INTO session_ownership (
				organization_id,
				session_id,
				user_id
			)
			VALUES ($1, $2, $3)
			ON CONFLICT (organization_id, session_id) DO NOTHING
			`,
			[organizationId, sessionId, candidateOwner],
		);

		const [row] = await transaction.unsafe<Array<{ user_id: string }>>(
			`
			SELECT user_id
			FROM session_ownership
			WHERE organization_id = $1
				AND session_id = $2
			FOR SHARE
			`,
			[organizationId, sessionId],
		);
		if (!row) {
			throw new Error("Session ownership reservation did not return an owner");
		}
		return row.user_id;
	});
}

function assertCallerOwnsSession(
	ownerId: string,
	organizationId: string,
	sessionId: string,
	userId: string,
): void {
	if (ownerId === userId) return;

	logger.warn(
		"Session ingest rejected for a non-owner (organization_id={organizationId} session_id={sessionId} user_id={userId})",
		{ organizationId, sessionId, userId },
	);
	throwOwnershipConflict();
}

function throwOwnershipConflict(): never {
	throw new ORPCError("CONFLICT", {
		message: OWNERSHIP_CONFLICT_MESSAGE,
	});
}
