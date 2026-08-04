import {
	afterAll,
	beforeAll,
	describe,
	expect,
	setDefaultTimeout,
	test,
} from "bun:test";
import { randomUUID } from "node:crypto";
import {
	ingestRudelClaudeSessions,
	type RudelClaudeSessionsRow,
} from "@rudel/ch-schema/generated";
import {
	USAGE_EVENT_EXTRACTION_VERSION,
	USAGE_EVENT_IDENTITY_VERSION,
	USAGE_EVENT_MODEL_RATE_CARD_VERSION,
} from "@rudel/usage-events";
import { createClickHouseExecutor } from "../clickhouse.js";
import { sqlClient } from "../db.js";
import { claimSessionIngestOwnership } from "../services/session-ownership.service.js";
import {
	backfillUsageEvents,
	previewUsageEventsBackfill,
} from "../services/usage-event-backfill.service.js";
import { compareUsageEventTotals } from "../services/usage-event-comparison.service.js";

setDefaultTimeout(30_000);

const runId = randomUUID();
const organizationId = `usage_backfill_org_${runId}`;
const userId = `usage_backfill_user_${runId}`;
const sessionId = `usage_backfill_session_${runId}`;
const noUsageSessionId = `usage_backfill_no_usage_${runId}`;
const sessionDate = "2026-08-04 08:00:00.000";
const cutoff = new Date("2026-08-04T09:00:00.000Z");
const executor = createClickHouseExecutor({
	database: "default",
	password: process.env.CLICKHOUSE_PASSWORD || "",
	url: process.env.CLICKHOUSE_URL || "http://localhost:8123",
	username:
		process.env.CLICKHOUSE_USERNAME || process.env.CLICKHOUSE_USER || "default",
});

beforeAll(async () => {
	await sqlClient`
		INSERT INTO "user" (id, name, email)
		VALUES (${userId}, 'Usage Backfill User', ${`${runId}@example.com`})
	`;
	await sqlClient`
		INSERT INTO organization (id, name, slug)
		VALUES (${organizationId}, 'Usage Backfill Organization', ${`usage-backfill-${runId}`})
	`;
	await sqlClient`
		INSERT INTO member (id, organization_id, user_id, role)
		VALUES (${randomUUID()}, ${organizationId}, ${userId}, 'owner')
	`;
	const ownership = await claimSessionIngestOwnership(
		organizationId,
		sessionId,
		userId,
	);
	if (!ownership.owned) {
		throw new Error("Expected the integration user to own the test session");
	}
	const noUsageOwnership = await claimSessionIngestOwnership(
		organizationId,
		noUsageSessionId,
		userId,
	);
	if (!noUsageOwnership.owned) {
		throw new Error(
			"Expected the integration user to own the no-usage session",
		);
	}
	await ingestRudelClaudeSessions(
		executor,
		[rawSessionRow(), rawSessionRowWithoutUsage()],
		{
			validate: true,
		},
	);
});

afterAll(async () => {
	await executor.execute({
		query: `DELETE FROM rudel.usage_events WHERE organization_id = {organizationId:String} SETTINGS lightweight_deletes_sync = 3`,
		query_params: { organizationId },
	});
	await executor.execute({
		query: `DELETE FROM rudel.claude_sessions WHERE organization_id = {organizationId:String} SETTINGS lightweight_deletes_sync = 3`,
		query_params: { organizationId },
	});
	await sqlClient`
		DELETE FROM organization
		WHERE id = ${organizationId}
	`;
	await sqlClient`
		DELETE FROM "user"
		WHERE id = ${userId}
	`;
	await executor.close();
});

describe("usage event backfill", () => {
	test("previews without writing, executes once, and skips the completed receipt on replay", async () => {
		const preview = await previewUsageEventsBackfill(executor, {
			cutoff,
			maxSessions: 10,
			organizationId,
		});
		expect(preview).toMatchObject({
			candidateCount: 1,
			completeCount: 1,
			failedCount: 0,
			rawSessionCount: 2,
			skippedNoUsageCount: 1,
			status: "preview",
			wouldWriteCount: 1,
		});
		expect(await countPhysicalUsageRows()).toBe(0);

		const completed = await backfillUsageEvents(executor, {
			cutoff,
			maxSessions: 10,
			organizationId,
		});
		expect(completed).toMatchObject({
			candidateCount: 1,
			completedCount: 1,
			failedCount: 0,
			status: "completed",
		});
		const rowsAfterFirstRun = await readActiveUsageRows();
		expect(rowsAfterFirstRun).toEqual([
			{
				event_count: 1,
				receipt_count: 1,
				receipt_event_count: 1,
				receipt_is_complete: 1,
			},
		]);
		const physicalRowsAfterFirstRun = await countPhysicalUsageRows();
		expect(physicalRowsAfterFirstRun).toBe(2);

		const replay = await backfillUsageEvents(executor, {
			cutoff,
			maxSessions: 10,
			organizationId,
		});
		expect(replay).toMatchObject({
			alreadyCompleteCount: 1,
			candidateCount: 1,
			completedCount: 0,
			failedCount: 0,
			status: "completed",
		});
		expect(await countPhysicalUsageRows()).toBe(physicalRowsAfterFirstRun);

		const comparison = await compareUsageEventTotals(executor, {
			maxSessions: 10,
			organizationId,
			topSessions: 5,
		});
		expect(comparison.sources).toEqual([
			{
				completeReceiptSessionCount: 1,
				legacyOnlySessionCount: 0,
				legacySessionCount: 1,
				matchedSessionCount: 1,
				newCacheReadInputTokens: "5",
				newCacheWriteInputTokens: "3",
				newOutputTokens: "2",
				newReasoningOutputTokens: "0",
				newUncachedInputTokens: "10",
				oldCacheReadInputTokens: "5",
				oldCacheWriteInputTokens: "3",
				oldOutputTokens: "2",
				oldUncachedInputTokens: "10",
				orphanEventSessionCount: 0,
				receiptOnlySessionCount: 0,
				receiptSessionCount: 1,
				source: "claude_code",
			},
		]);
		expect(comparison.topDivergences).toEqual([
			{
				absoluteTokenDelta: "0",
				newTotalTokens: "20",
				oldTotalTokens: "20",
				organizationId,
				sessionId,
				source: "claude_code",
			},
		]);

		const [ownership] = await sqlClient<
			Array<{
				last_usage_checksum: string | null;
				last_usage_extraction_version: number | null;
				last_usage_event_identity_version: number | null;
				last_usage_model_rate_card_version: string | null;
			}>
		>`
			SELECT
				last_usage_checksum,
				last_usage_extraction_version,
				last_usage_event_identity_version,
				last_usage_model_rate_card_version
			FROM session_ownership
			WHERE organization_id = ${organizationId}
				AND session_id = ${sessionId}
		`;
		expect(ownership?.last_usage_checksum).toHaveLength(64);
		expect(ownership?.last_usage_extraction_version).toBe(
			USAGE_EVENT_EXTRACTION_VERSION,
		);
		expect(ownership?.last_usage_event_identity_version).toBe(
			USAGE_EVENT_IDENTITY_VERSION,
		);
		expect(ownership?.last_usage_model_rate_card_version).toBe(
			USAGE_EVENT_MODEL_RATE_CARD_VERSION,
		);
	});
});

function rawSessionRow(): RudelClaudeSessionsRow {
	return {
		content: JSON.stringify({
			message: {
				id: "message-1",
				model: "claude-sonnet-4-5",
				role: "assistant",
				usage: {
					cache_creation_input_tokens: 3,
					cache_read_input_tokens: 5,
					input_tokens: 10,
					output_tokens: 2,
				},
			},
			requestId: "request-1",
			timestamp: "2026-08-04T08:00:00.000Z",
			type: "assistant",
		}),
		filter_version: 5,
		git_branch: null,
		git_remote: "",
		git_sha: null,
		ingested_at: "2026-08-04 08:30:00.000",
		last_interaction_date: sessionDate,
		organization_id: organizationId,
		package_name: "",
		package_type: "",
		project_path: "/tmp/usage-backfill",
		session_date: sessionDate,
		session_id: sessionId,
		subagents: {},
		tag: null,
		user_id: userId,
	};
}

function rawSessionRowWithoutUsage(): RudelClaudeSessionsRow {
	return {
		...rawSessionRow(),
		content: JSON.stringify({
			message: { role: "user" },
			timestamp: "2026-08-04T08:00:00.000Z",
			type: "user",
		}),
		session_id: noUsageSessionId,
	};
}

async function countPhysicalUsageRows(): Promise<number> {
	const [row] = await executor.query<{ row_count: number }>({
		query: `
			SELECT count() AS row_count
			FROM rudel.usage_events
			WHERE organization_id = {organizationId:String}
				AND user_id = {userId:String}
				AND source = 'claude_code'
				AND session_id = {sessionId:String}
		`,
		query_params: { organizationId, sessionId, userId },
	});
	return row?.row_count ?? 0;
}

async function readActiveUsageRows() {
	return executor.query<{
		event_count: number;
		receipt_count: number;
		receipt_event_count: number;
		receipt_is_complete: number;
	}>({
		query: `
			SELECT
				countIf(record_kind = 'event') AS event_count,
				countIf(record_kind = 'receipt') AS receipt_count,
				anyIf(receipt_event_count, record_kind = 'receipt') AS receipt_event_count,
				anyIf(receipt_is_complete, record_kind = 'receipt') AS receipt_is_complete
			FROM (
				SELECT *
				FROM rudel.usage_events
				WHERE organization_id = {organizationId:String}
					AND user_id = {userId:String}
					AND source = 'claude_code'
					AND session_id = {sessionId:String}
				ORDER BY event_version DESC
				LIMIT 1 BY organization_id, user_id, source, session_id, event_id
			)
			WHERE is_deleted = 0
		`,
		query_params: { organizationId, sessionId, userId },
	});
}
