import { describe, expect, test } from "bun:test";
import {
	USAGE_EVENT_EXTRACTION_VERSION,
	USAGE_EVENT_IDENTITY_VERSION,
	USAGE_EVENT_MODEL_RATE_CARD_VERSION,
	type UsageEvent,
	type UsageExtractionResult,
} from "@rudel/usage-events";
import type { ClickHouseExecutor, ClickHouseStatement } from "../clickhouse.js";
import {
	buildActiveUsageEventsCte,
	buildUsageEventRows,
	hasMatchingUsageExtractionReceipt,
	shouldReplaceUsageEventsForVersion,
	verifyUsageExtractionReceiptConsistency,
	writeUsageExtraction,
} from "./usage-event-ingest.service.js";

const SHA256 = "a".repeat(64);

describe("usage event ingest recovery contract", () => {
	test("V12 canonical active selector resolves versions and excludes receipts", () => {
		const cte = buildActiveUsageEventsCte({ generationFence: true });

		expect(cte).toContain("LIMIT 1 BY organization_id");
		expect(cte).toContain("record_kind = 'event' AND is_deleted = 0");
		expect(cte).toContain("event_version < {generation:UInt64}");
	});

	test("X-01 a raw-only retry cannot use the fast path without a matching receipt", () => {
		expect(
			hasMatchingUsageExtractionReceipt(
				{
					lastUsageContentSha256: null,
					lastUsageExtractionVersion: null,
					lastUsageEventIdentityVersion: null,
					lastUsageModelRateCardVersion: null,
				},
				SHA256,
			),
		).toBe(false);
		expect(
			hasMatchingUsageExtractionReceipt(
				{
					lastUsageContentSha256: SHA256,
					lastUsageExtractionVersion: USAGE_EVENT_EXTRACTION_VERSION - 1,
					lastUsageEventIdentityVersion: USAGE_EVENT_IDENTITY_VERSION,
					lastUsageModelRateCardVersion: USAGE_EVENT_MODEL_RATE_CARD_VERSION,
				},
				SHA256,
			),
		).toBe(false);
		expect(
			hasMatchingUsageExtractionReceipt(
				{
					lastUsageContentSha256: SHA256,
					lastUsageExtractionVersion: USAGE_EVENT_EXTRACTION_VERSION,
					lastUsageEventIdentityVersion: USAGE_EVENT_IDENTITY_VERSION,
					lastUsageModelRateCardVersion: USAGE_EVENT_MODEL_RATE_CARD_VERSION,
				},
				SHA256,
			),
		).toBe(true);
		expect(
			hasMatchingUsageExtractionReceipt(
				{
					lastUsageContentSha256: SHA256,
					lastUsageExtractionVersion: USAGE_EVENT_EXTRACTION_VERSION,
					lastUsageEventIdentityVersion: USAGE_EVENT_IDENTITY_VERSION,
					lastUsageModelRateCardVersion: "stale-catalog",
				},
				SHA256,
			),
		).toBe(false);
	});

	test("V9 a version bump retires identities absent from the new snapshot", () => {
		const staleState = {
			lastUsageContentSha256: SHA256,
			lastUsageExtractionVersion: USAGE_EVENT_EXTRACTION_VERSION - 1,
			lastUsageEventIdentityVersion: USAGE_EVENT_IDENTITY_VERSION,
			lastUsageModelRateCardVersion: USAGE_EVENT_MODEL_RATE_CARD_VERSION,
		};
		expect(shouldReplaceUsageEventsForVersion(staleState)).toBe(true);

		const input = {
			...writeInput("7", extraction([])),
			replaceAbsentEvents: shouldReplaceUsageEventsForVersion(staleState),
		};
		const rows = buildUsageEventRows(input, [
			{
				event_id: event().eventId,
				is_deleted: 0,
				record_kind: "event",
				source: "claude_code",
			},
		]);

		expect(rows).toHaveLength(2);
		expect(rows[0]).toMatchObject({
			event_id: event().eventId,
			is_deleted: 1,
		});
		expect(rows[1]).toMatchObject({
			record_kind: "receipt",
			receipt_is_complete: 1,
		});
	});

	test("X-02 retrying a completed event write preserves identity", () => {
		const firstRows = buildUsageEventRows(
			writeInput("1", extraction([event()])),
			[],
		);
		const retryRows = buildUsageEventRows(
			writeInput("2", extraction([event()])),
			[],
		);
		const firstEvent = firstRows.find((row) => row.record_kind === "event");
		const retryEvent = retryRows.find((row) => row.record_kind === "event");

		expect(firstEvent?.event_id).toBe(event().eventId);
		expect(retryEvent?.event_id).toBe(firstEvent?.event_id);
		expect(retryEvent?.event_version).toBe("2");
		expect(retryEvent?.model_rate_card_version).toBe(
			USAGE_EVENT_MODEL_RATE_CARD_VERSION,
		);
	});

	test("X-03 a normal longer reupload keeps old IDs and never tombstones absent facts", () => {
		const oldEvent = event();
		const newEvent = event({ eventId: "b".repeat(64), outputTokens: 9 });
		const rows = buildUsageEventRows(
			writeInput("3", extraction([oldEvent, newEvent])),
			[
				{
					event_id: "c".repeat(64),
					is_deleted: 0,
					record_kind: "event",
					source: "claude_code",
				},
			],
		);

		expect(rows.filter((row) => row.record_kind === "event")).toHaveLength(2);
		expect(rows.some((row) => row.is_deleted === 1)).toBe(false);
	});

	test("X-04 an explicit zero-event replacement tombstones every prior event", () => {
		const rows = buildUsageEventRows(
			{
				...writeInput("4", extraction([])),
				replaceAbsentEvents: true,
			},
			[
				{
					event_id: event().eventId,
					is_deleted: 0,
					record_kind: "event",
					source: "claude_code",
				},
			],
		);

		expect(rows).toHaveLength(2);
		expect(rows[0]?.event_id).toBe(event().eventId);
		expect(rows[0]?.is_deleted).toBe(1);
		expect(rows[0]?.usage_date).toBe("2026-08-03");
		expect(rows[1]?.record_kind).toBe("receipt");
		expect(rows[1]?.usage_date).toBe("2026-08-03");
		expect(rows[1]?.receipt_is_complete).toBe(1);
		expect(rows[1]?.receipt_event_count).toBe(0);
	});

	test("X-04 replacement cannot tombstone a different provider source", () => {
		const rows = buildUsageEventRows(
			{
				...writeInput("5", extraction([])),
				replaceAbsentEvents: true,
			},
			[
				{
					event_id: event().eventId,
					is_deleted: 0,
					record_kind: "event",
					source: "codex",
				},
			],
		);

		expect(rows).toHaveLength(1);
		expect(rows[0]?.record_kind).toBe("receipt");
	});

	test("rejects a cross-session event before it reaches ClickHouse", () => {
		expect(() =>
			buildUsageEventRows(
				writeInput("6", extraction([event({ sessionId: "another-session" })])),
				[],
			),
		).toThrow("identity does not match its write envelope");
	});

	test("V10 fences replacement reads below the candidate generation", async () => {
		const queries: ClickHouseStatement[] = [];
		const input = {
			...writeInput("8", extraction([])),
			replaceAbsentEvents: true,
		};
		const executor: ClickHouseExecutor = {
			close: () => Promise.resolve(),
			execute: () => Promise.resolve(),
			insert: () => Promise.resolve(),
			query: <T>(statement: ClickHouseStatement) => {
				queries.push(statement);
				if (queries.length === 1) return Promise.resolve([] as T[]);
				return Promise.resolve([
					{
						active_event_count: 0,
						receipt_checksum: "d".repeat(64),
						receipt_count: 1,
						receipt_event_count: 0,
						receipt_is_complete: 1,
						receipt_version: "8",
					} as T,
				]);
			},
		};

		await writeUsageExtraction(executor, input);

		expect(queries[0]?.query).toContain("event_version < {generation:UInt64}");
		expect(queries[0]?.query_params).toMatchObject({ generation: "8" });
	});

	test("W3 scopes consistency to the written generation through the canonical CTE", async () => {
		const queries: ClickHouseStatement[] = [];
		const input = writeInput("9", extraction([event()]));
		const executor = consistencyExecutor(
			{
				active_event_count: 1,
				receipt_checksum: "d".repeat(64),
				receipt_count: 1,
				receipt_event_count: 1,
				receipt_is_complete: 1,
				receipt_version: "9",
			},
			queries,
		);

		await expect(
			verifyUsageExtractionReceiptConsistency(executor, input),
		).resolves.toEqual({ status: "consistent" });
		expect(queries[0]?.query).toMatch(/WITH\s+active_usage_events AS/u);
		expect(queries[0]?.query).toContain("event_version <= {generation:UInt64}");
		expect(queries[0]?.query).toContain("event_version = {generation:UInt64}");
		expect(queries[0]?.query_params).toMatchObject({ generation: "9" });
	});

	test("W3 reports a consistency repair diagnostic without creating a retry loop", async () => {
		const input = writeInput("9", extraction([event()]));
		const executor = consistencyExecutor({
			active_event_count: 0,
			receipt_checksum: "d".repeat(64),
			receipt_count: 1,
			receipt_event_count: 1,
			receipt_is_complete: 1,
			receipt_version: "9",
		});

		const result = await writeUsageExtraction(executor, input);

		expect(result.consistency).toEqual({
			status: "repair_required",
			diagnostic: {
				actualActiveEventCount: 0,
				actualReceiptCount: 1,
				code: "usage_extraction_consistency_repair_required",
				expectedEventCount: 1,
				generation: "9",
			},
		});
		expect(result.rows).toHaveLength(2);
	});
});

function consistencyExecutor(
	row: object,
	queries: ClickHouseStatement[] = [],
): ClickHouseExecutor {
	return {
		close: () => Promise.resolve(),
		execute: () => Promise.resolve(),
		insert: () => Promise.resolve(),
		query: <T>(statement: ClickHouseStatement) => {
			queries.push(statement);
			return Promise.resolve([row as T]);
		},
	};
}

function writeInput(
	generation: string,
	result: Extract<UsageExtractionResult, { status: "complete" }>,
) {
	return {
		contentSha256: SHA256,
		extraction: result,
		filterVersion: 1,
		generation,
		ingestedAt: new Date("2026-08-03T12:00:00.000Z"),
		organizationId: "org-1",
		sessionDate: new Date("2026-08-03T11:00:00.000Z"),
		sessionId: "session-1",
		source: "claude_code" as const,
		userId: "user-1",
	};
}

function extraction(
	events: readonly UsageEvent[],
): Extract<UsageExtractionResult, { status: "complete" }> {
	return {
		status: "complete",
		events,
		diagnostics: [],
		receipt: {
			complete: true,
			extractionVersion: USAGE_EVENT_EXTRACTION_VERSION,
			eventIdentityVersion: 1,
			modelRateCardVersion: USAGE_EVENT_MODEL_RATE_CARD_VERSION,
			eventCount: events.length,
			checksum: "d".repeat(64),
		},
	};
}

function event(overrides: Partial<UsageEvent> = {}): UsageEvent {
	return {
		agentId: "",
		cacheReadInputTokens: 2,
		cacheWrite1hInputTokens: 0,
		cacheWrite5mInputTokens: 0,
		contextInputTokens: 12,
		duplicateObservationCount: 0,
		eventId: "e".repeat(64),
		firstObservedLine: 1,
		identityKind: "message_id",
		lineageId: "main",
		modelStatus: "resolved",
		occurredAt: "2026-08-03T11:00:00.000Z",
		organizationId: "org-1",
		outputTokens: 5,
		parentLineageId: "",
		qualityFlags: [],
		rawModel: "claude-sonnet-4-20250514",
		reasoningOutputTokens: 0,
		resolvedModel: "claude-sonnet-4-20250514",
		serviceTier: "standard",
		sessionId: "session-1",
		source: "claude_code",
		tokenSource: "provider_increment",
		uncachedInputTokens: 10,
		usageDate: "2026-08-03",
		userId: "user-1",
		...overrides,
	};
}
