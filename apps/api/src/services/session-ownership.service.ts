import { getLogger } from "@logtape/logtape";
import { ORPCError } from "@orpc/server";
import { sqlClient } from "../db.js";

const logger = getLogger(["rudel", "api", "session-ownership"]);
const OWNERSHIP_CONFLICT_MESSAGE =
	"This session belongs to another organization member and cannot be replaced.";

export async function assertSessionIngestOwnership(
	organizationId: string,
	sessionId: string,
	userId: string,
): Promise<void> {
	const registeredOwner = await getSessionOwner(organizationId, sessionId);
	if (registeredOwner) {
		assertCallerOwnsSession(registeredOwner, organizationId, sessionId, userId);
		return;
	}

	const reservedOwner = await reserveSessionOwner(
		organizationId,
		sessionId,
		userId,
	);
	assertCallerOwnsSession(reservedOwner, organizationId, sessionId, userId);
}

export async function getSessionOwner(
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
