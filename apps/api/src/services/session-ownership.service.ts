import { getLogger } from "@logtape/logtape";
import { sqlClient } from "../db.js";
import type { IngestContentShape } from "../lib/ingest-content-shape.js";

const logger = getLogger(["rudel", "api", "session-ownership"]);

type SessionOwnershipClaim =
	| {
			owned: true;
			lastAssistantLineCount: number | null;
			lastContentBytes: number | null;
			lastContentSha256: string | null;
			lastContentShape: IngestContentShape | null;
			lastFilterVersion: number | null;
			lastSessionDate: Date | null;
	  }
	| { owned: false; ownerId: string };

interface ReservedSessionOwner {
	lastAssistantLineCount: number | null;
	lastContentBytes: number | null;
	lastContentSha256: string | null;
	lastContentShape: IngestContentShape | null;
	lastFilterVersion: number | null;
	lastSessionDate: Date | null;
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
	contentShape: IngestContentShape,
	filterVersion: number,
	sessionDate: Date,
	ingestedAt: Date,
): Promise<void> {
	// This guard orders bookkeeping for successful writes with distinct
	// ingested_at values. The API allocator prevents same-process millisecond
	// ties; different ClickHouse sorting keys, cross-instance ties, and failed
	// bookkeeping remain best-effort.
	const ingestedAtIso = ingestedAt.toISOString();
	await sqlClient`
		UPDATE session_ownership
		SET
			last_content_sha256 = ${contentSha256},
			last_content_bytes = ${contentShape.contentBytes},
			last_assistant_line_count = ${contentShape.assistantLineCount},
			last_content_shape_json = ${JSON.stringify(contentShape)},
			last_filter_version = ${filterVersion},
			last_session_date = ${sessionDate.toISOString()},
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
		Array<{
			last_assistant_line_count: number | null;
			last_content_bytes: number | null;
			last_content_sha256: string | null;
			last_content_shape_json: string | null;
			last_filter_version: number | null;
			last_session_date: Date | null;
			user_id: string;
		}>
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
		RETURNING
			user_id,
			last_content_sha256,
			last_content_bytes,
			last_assistant_line_count,
			last_content_shape_json,
			last_filter_version,
			last_session_date
	`;
	if (!row) {
		throw new Error("Session ownership reservation did not return an owner");
	}
	return {
		lastAssistantLineCount: row.last_assistant_line_count,
		lastContentBytes: row.last_content_bytes,
		lastContentSha256: row.last_content_sha256,
		lastContentShape: parseContentShape(row.last_content_shape_json),
		lastFilterVersion: row.last_filter_version,
		lastSessionDate: row.last_session_date,
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
			lastAssistantLineCount: reservedOwner.lastAssistantLineCount,
			lastContentBytes: reservedOwner.lastContentBytes,
			lastContentSha256: reservedOwner.lastContentSha256,
			lastContentShape: reservedOwner.lastContentShape,
			lastFilterVersion: reservedOwner.lastFilterVersion,
			lastSessionDate: reservedOwner.lastSessionDate,
		};
	}

	logger.warn(
		"Session ingest rejected for a non-owner (organization_id={organizationId} session_id={sessionId} user_id={userId})",
		{ organizationId, sessionId, userId },
	);
	return { owned: false, ownerId: reservedOwner.userId };
}

function parseContentShape(value: string | null): IngestContentShape | null {
	if (value === null) return null;
	try {
		const parsed: unknown = JSON.parse(value);
		if (!isRecord(parsed) || parsed.version !== 1) return null;
		if (!isContentComponent(parsed.main) || !isRecord(parsed.subagents)) {
			return null;
		}
		for (const component of Object.values(parsed.subagents)) {
			if (!isContentComponent(component)) return null;
		}
		if (!isContentComponent(parsed)) return null;
		return parsed as unknown as IngestContentShape;
	} catch {
		return null;
	}
}

function isContentComponent(value: unknown): boolean {
	return (
		isRecord(value) &&
		Number.isSafeInteger(value.assistantLineCount) &&
		Number(value.assistantLineCount) >= 0 &&
		Number.isSafeInteger(value.contentBytes) &&
		Number(value.contentBytes) >= 0
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
