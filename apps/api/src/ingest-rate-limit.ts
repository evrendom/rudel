import { ORPCError } from "@orpc/server";
import { pgClient } from "./db.js";
import {
	getIngestSecurityConfig,
	type IngestSecurityConfig,
} from "./ingest-security.js";

const INGEST_RATE_LIMIT_IDENTIFIER_PREFIX = "ingest-rate:";

export async function enforceIngestRateLimit(
	userId: string,
	config: IngestSecurityConfig = getIngestSecurityConfig(),
	now = new Date(),
): Promise<void> {
	const identifier = `${INGEST_RATE_LIMIT_IDENTIFIER_PREFIX}${userId}`;
	const nowIso = now.toISOString();
	const expiresAtIso = new Date(
		now.getTime() + config.rateLimit.windowMs,
	).toISOString();
	const entryId = crypto.randomUUID();

	await pgClient`
		DELETE FROM verification
		WHERE identifier = ${identifier}
			AND expires_at <= ${nowIso}
	`;

	await pgClient`
		INSERT INTO verification (id, identifier, value, expires_at)
		VALUES (${entryId}, ${identifier}, ${nowIso}, ${expiresAtIso})
	`;

	const rows = await pgClient<{ request_count: number }[]>`
		SELECT COUNT(*)::int AS request_count
		FROM verification
		WHERE identifier = ${identifier}
			AND expires_at > ${nowIso}
	`;

	const requestCount = rows[0]?.request_count ?? 0;
	if (requestCount <= config.rateLimit.maxRequests) {
		return;
	}

	await pgClient`
		DELETE FROM verification
		WHERE id = ${entryId}
	`;

	throw new ORPCError("TOO_MANY_REQUESTS", {
		message: `Ingest rate limit exceeded. Try again after ${Math.ceil(config.rateLimit.windowMs / 1000)} seconds.`,
	});
}
