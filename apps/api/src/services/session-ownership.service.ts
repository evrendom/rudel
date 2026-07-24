import { getLogger } from "@logtape/logtape";
import { sqlClient } from "../db.js";

const logger = getLogger(["rudel", "api", "session-ownership"]);

type SessionOwnershipClaim =
	| { owned: true; lastContentSha256: string | null }
	| { owned: false; ownerId: string };

interface ReservedSessionOwner {
	lastContentSha256: string | null;
	userId: string;
}

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

export async function recordSessionIngestContent(
	organizationId: string,
	sessionId: string,
	contentSha256: string,
	ingestedAt: Date,
): Promise<void> {
	// This guard orders bookkeeping for successful writes with distinct
	// ingested_at values. Different ClickHouse session_date sorting keys,
	// equal-millisecond versions, and failed bookkeeping remain best-effort.
	const ingestedAtIso = ingestedAt.toISOString();
	await sqlClient`
		UPDATE session_ownership
		SET
			last_content_sha256 = ${contentSha256},
			last_ingested_at = ${ingestedAtIso}
		WHERE organization_id = ${organizationId}
			AND session_id = ${sessionId}
			AND (
				last_ingested_at IS NULL
				OR last_ingested_at <= ${ingestedAtIso}
			)
	`;
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
): Promise<ReservedSessionOwner> {
	// The no-op update returns the winning row when a concurrent insert wins.
	const [row] = await sqlClient<
		Array<{ last_content_sha256: string | null; user_id: string }>
	>`
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
		RETURNING user_id, last_content_sha256
	`;
	if (!row) {
		throw new Error("Session ownership reservation did not return an owner");
	}
	return {
		lastContentSha256: row.last_content_sha256,
		userId: row.user_id,
	};
}

function getOwnershipClaim(
	reservedOwner: ReservedSessionOwner,
	organizationId: string,
	sessionId: string,
	userId: string,
): SessionOwnershipClaim {
	if (reservedOwner.userId === userId) {
		return {
			owned: true,
			lastContentSha256: reservedOwner.lastContentSha256,
		};
	}

	logger.warn(
		"Session ingest rejected for a non-owner (organization_id={organizationId} session_id={sessionId} user_id={userId})",
		{ organizationId, sessionId, userId },
	);
	return { owned: false, ownerId: reservedOwner.userId };
}
