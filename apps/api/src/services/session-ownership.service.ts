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
			lastUsageContentSha256: string | null;
			lastUsageChecksum: string | null;
			lastUsageExtractionVersion: number | null;
			lastUsageEventIdentityVersion: number | null;
			lastUsageModelRateCardVersion: string | null;
	  }
	| { owned: false; ownerId: string };

interface ReservedSessionOwner {
	lastAssistantLineCount: number | null;
	lastContentBytes: number | null;
	lastContentSha256: string | null;
	lastContentShape: IngestContentShape | null;
	lastFilterVersion: number | null;
	lastSessionDate: Date | null;
	lastUsageContentSha256: string | null;
	lastUsageChecksum: string | null;
	lastUsageExtractionVersion: number | null;
	lastUsageEventIdentityVersion: number | null;
	lastUsageModelRateCardVersion: string | null;
	userId: string;
}

interface UsageExtractionReceiptRecord {
	checksum: string;
	diagnostics: string;
	eventCount: number;
	extractionVersion: number;
	eventIdentityVersion: number;
	generation: string;
	modelRateCardVersion: string;
}

export interface UsageBackfillOwnershipState {
	lastContentSha256: string | null;
	lastIngestedAt: Date | null;
	lastUsageContentSha256: string | null;
	lastUsageChecksum: string | null;
	lastUsageExtractionVersion: number | null;
	lastUsageEventIdentityVersion: number | null;
	lastUsageModelRateCardVersion: string | null;
	userId: string;
}

export interface UsageBackfillOwnershipStateRow
	extends UsageBackfillOwnershipState {
	organizationId: string;
	sessionId: string;
}

interface UsageBackfillOwnershipDatabaseRow {
	last_content_sha256: string | null;
	last_ingested_at: Date | null;
	last_usage_checksum: string | null;
	last_usage_content_sha256: string | null;
	last_usage_extraction_version: number | null;
	last_usage_event_identity_version: number | null;
	last_usage_model_rate_card_version: string | null;
	organization_id: string;
	session_id: string;
	user_id: string;
}

export class UsageExtractionSupersededError extends Error {
	constructor() {
		super(
			"Usage extraction was superseded before its receipt was confirmed; retry the upload",
		);
		this.name = "UsageExtractionSupersededError";
	}
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
	usageReceipt?: UsageExtractionReceiptRecord,
): Promise<void> {
	// Raw bookkeeping follows ingested_at ordering. The usage receipt uses the
	// separately reserved generation as a compare-and-set, so an older writer
	// cannot certify a newer session snapshot.
	const ingestedAtIso = ingestedAt.toISOString();
	return sqlClient.begin(async (transaction) => {
		await transaction.unsafe(
			`
			UPDATE session_ownership
			SET
				last_content_sha256 = $1,
				last_content_bytes = $2,
				last_assistant_line_count = $3,
				last_content_shape_json = $4,
				last_filter_version = $5,
				last_session_date = $6,
				last_ingested_at = $7
			WHERE organization_id = $8
				AND session_id = $9
				AND (
					last_ingested_at IS NULL
					OR last_ingested_at <= $7
				)
			`,
			[
				contentSha256,
				contentShape.contentBytes,
				contentShape.assistantLineCount,
				JSON.stringify(contentShape),
				filterVersion,
				sessionDate.toISOString(),
				ingestedAtIso,
				organizationId,
				sessionId,
			],
		);
		if (!usageReceipt) return;

		const completed = await transaction.unsafe<Array<{ generation: string }>>(
			`
			UPDATE session_ownership
			SET
				last_usage_content_sha256 = $1,
				last_usage_extraction_version = $2,
				last_usage_event_identity_version = $3,
				last_usage_model_rate_card_version = $4,
				last_usage_event_count = $5,
				last_usage_checksum = $6,
				last_usage_diagnostics_json = $7,
				last_usage_completed_generation = $8,
				last_usage_completed_at = NOW()
			WHERE organization_id = $9
				AND session_id = $10
				AND usage_extraction_generation = $8
			RETURNING usage_extraction_generation::text AS generation
			`,
			[
				contentSha256,
				usageReceipt.extractionVersion,
				usageReceipt.eventIdentityVersion,
				usageReceipt.modelRateCardVersion,
				usageReceipt.eventCount,
				usageReceipt.checksum,
				usageReceipt.diagnostics,
				usageReceipt.generation,
				organizationId,
				sessionId,
			],
		);
		if (completed.length !== 1) {
			throw new UsageExtractionSupersededError();
		}
	});
}

export async function reserveUsageExtractionGeneration(
	organizationId: string,
	sessionId: string,
	userId: string,
): Promise<string> {
	const [row] = await sqlClient<Array<{ generation: string }>>`
		UPDATE session_ownership
		SET usage_extraction_generation = GREATEST(
			usage_extraction_generation + 1,
			FLOOR(EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint
		)
		WHERE organization_id = ${organizationId}
			AND session_id = ${sessionId}
			AND user_id = ${userId}
		RETURNING usage_extraction_generation::text AS generation
	`;
	if (!row) {
		throw new Error("Usage extraction generation reservation failed");
	}
	return row.generation;
}

/**
 * Reserve a backfill generation only while the raw snapshot is still current.
 * A live upload that records newer content wins without requiring ingest to be
 * quiesced; a live extraction reserved after this call receives a higher
 * generation and supersedes the backfill rows.
 */
export async function reserveUsageBackfillGeneration(
	organizationId: string,
	sessionId: string,
	userId: string,
	expectedContentSha256: string,
	cutoff: Date,
): Promise<string | null> {
	const [row] = await sqlClient<Array<{ generation: string }>>`
		UPDATE session_ownership
		SET usage_extraction_generation = GREATEST(
			usage_extraction_generation + 1,
			FLOOR(EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint
		)
		WHERE organization_id = ${organizationId}
			AND session_id = ${sessionId}
			AND user_id = ${userId}
			AND (
				last_content_sha256 IS NULL
				OR last_content_sha256 = ${expectedContentSha256}
			)
			AND (
				last_ingested_at IS NULL
				OR last_ingested_at <= ${cutoff.toISOString()}
			)
		RETURNING usage_extraction_generation::text AS generation
	`;
	return row?.generation ?? null;
}

export async function listUsageBackfillOwnershipStates(options: {
	maxRows: number;
	organizationId?: string;
}): Promise<readonly UsageBackfillOwnershipStateRow[]> {
	const organizationPredicate = options.organizationId
		? "WHERE organization_id = $1"
		: "";
	const limitParameter = options.organizationId ? "$2" : "$1";
	const parameters = options.organizationId
		? [options.organizationId, options.maxRows]
		: [options.maxRows];
	const rows = await sqlClient.unsafe<UsageBackfillOwnershipDatabaseRow[]>(
		`
			SELECT
				organization_id,
				session_id,
				user_id,
				last_content_sha256,
				last_ingested_at,
				last_usage_content_sha256,
				last_usage_checksum,
				last_usage_extraction_version,
				last_usage_event_identity_version,
				last_usage_model_rate_card_version
			FROM session_ownership
			${organizationPredicate}
			ORDER BY organization_id, session_id
			LIMIT ${limitParameter}
		`,
		parameters,
	);
	return rows.map(mapUsageBackfillOwnershipState);
}

function mapUsageBackfillOwnershipState(
	row: UsageBackfillOwnershipDatabaseRow,
): UsageBackfillOwnershipStateRow {
	return {
		lastContentSha256: row.last_content_sha256,
		lastIngestedAt: row.last_ingested_at,
		lastUsageChecksum: row.last_usage_checksum,
		lastUsageContentSha256: row.last_usage_content_sha256,
		lastUsageExtractionVersion: row.last_usage_extraction_version,
		lastUsageEventIdentityVersion: row.last_usage_event_identity_version,
		lastUsageModelRateCardVersion: row.last_usage_model_rate_card_version,
		organizationId: row.organization_id,
		sessionId: row.session_id,
		userId: row.user_id,
	};
}

export async function recordUsageBackfillReceipt(
	organizationId: string,
	sessionId: string,
	contentSha256: string,
	receipt: UsageExtractionReceiptRecord,
): Promise<void> {
	const completed = await sqlClient<Array<{ generation: string }>>`
		UPDATE session_ownership
		SET
			last_usage_content_sha256 = ${contentSha256},
			last_usage_extraction_version = ${receipt.extractionVersion},
			last_usage_event_identity_version = ${receipt.eventIdentityVersion},
			last_usage_model_rate_card_version = ${receipt.modelRateCardVersion},
			last_usage_event_count = ${receipt.eventCount},
			last_usage_checksum = ${receipt.checksum},
			last_usage_diagnostics_json = ${receipt.diagnostics},
			last_usage_completed_generation = ${receipt.generation},
			last_usage_completed_at = NOW()
		WHERE organization_id = ${organizationId}
			AND session_id = ${sessionId}
			AND usage_extraction_generation = ${receipt.generation}
		RETURNING usage_extraction_generation::text AS generation
	`;
	if (completed.length !== 1) {
		throw new UsageExtractionSupersededError();
	}
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
			last_usage_content_sha256: string | null;
			last_usage_checksum: string | null;
			last_usage_extraction_version: number | null;
			last_usage_event_identity_version: number | null;
			last_usage_model_rate_card_version: string | null;
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
			last_session_date,
			last_usage_content_sha256,
			last_usage_checksum,
			last_usage_extraction_version,
			last_usage_event_identity_version,
			last_usage_model_rate_card_version
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
		lastUsageContentSha256: row.last_usage_content_sha256,
		lastUsageChecksum: row.last_usage_checksum,
		lastUsageExtractionVersion: row.last_usage_extraction_version,
		lastUsageEventIdentityVersion: row.last_usage_event_identity_version,
		lastUsageModelRateCardVersion: row.last_usage_model_rate_card_version,
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
			lastUsageContentSha256: reservedOwner.lastUsageContentSha256,
			lastUsageChecksum: reservedOwner.lastUsageChecksum,
			lastUsageExtractionVersion: reservedOwner.lastUsageExtractionVersion,
			lastUsageEventIdentityVersion:
				reservedOwner.lastUsageEventIdentityVersion,
			lastUsageModelRateCardVersion:
				reservedOwner.lastUsageModelRateCardVersion,
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
