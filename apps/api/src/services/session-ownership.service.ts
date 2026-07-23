import { getLogger } from "@logtape/logtape";
import { sqlClient } from "../db.js";

const logger = getLogger(["rudel", "api", "session-ownership"]);

type SessionOwnershipClaim =
	| { owned: true }
	| { owned: false; ownerId: string };

export async function claimSessionIngestOwnership(
	organizationId: string,
	sessionId: string,
	userId: string,
): Promise<SessionOwnershipClaim> {
	const reservedOwner = await reserveSessionOwner(
		organizationId,
		sessionId,
		userId,
	);
	return getOwnershipClaim(reservedOwner, organizationId, sessionId, userId);
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
	// The no-op update returns the winning row when a concurrent insert wins.
	const [row] = await sqlClient<Array<{ user_id: string }>>`
		INSERT INTO session_ownership AS ownership (
			organization_id,
			session_id,
			user_id
		)
		VALUES (
			${organizationId},
			${sessionId},
			${candidateOwner}
		)
		ON CONFLICT (organization_id, session_id) DO UPDATE
		SET user_id = ownership.user_id
		RETURNING user_id
	`;
	if (!row) {
		throw new Error("Session ownership reservation did not return an owner");
	}
	return row.user_id;
}

function getOwnershipClaim(
	ownerId: string,
	organizationId: string,
	sessionId: string,
	userId: string,
): SessionOwnershipClaim {
	if (ownerId === userId) return { owned: true };

	logger.warn(
		"Session ingest rejected for a non-owner (organization_id={organizationId} session_id={sessionId} user_id={userId})",
		{ organizationId, sessionId, userId },
	);
	return { owned: false, ownerId };
}
