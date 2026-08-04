import { getLogger } from "@logtape/logtape";
import {
	ingestRudelUsageEvents,
	type RudelUsageEventsRow,
} from "@rudel/ch-schema/generated";
import {
	getUsageEventReceiptId,
	USAGE_EVENT_EXTRACTION_VERSION,
	USAGE_EVENT_IDENTITY_VERSION,
	USAGE_EVENT_MODEL_RATE_CARD_VERSION,
	type UsageEvent,
	type UsageEventSource,
	type UsageExtractionResult,
} from "@rudel/usage-events";
import {
	type ClickHouseExecutor,
	getSafeClickHouseTable,
} from "../clickhouse.js";

const USAGE_EVENTS_TABLE = "rudel.usage_events";
const ZERO_SHA256 = "0".repeat(64);
const UNKNOWN_DATE = "1970-01-01";
const UNKNOWN_TIMESTAMP = "1970-01-01 00:00:00.000";
const logger = getLogger(["rudel", "api", "usage-event-ingest"]);

export function buildActiveUsageEventsCte(options?: {
	readonly generationFence?: boolean;
	readonly generationCeiling?: boolean;
	readonly includeNonEvents?: boolean;
}): string {
	if (options?.generationFence && options.generationCeiling) {
		throw new Error("Active usage-event CTE accepts only one generation bound");
	}
	const generationBound = options?.generationFence
		? "AND event_version < {generation:UInt64}"
		: options?.generationCeiling
			? "AND event_version <= {generation:UInt64}"
			: "";
	const activePredicate = options?.includeNonEvents
		? "is_deleted = 0"
		: "record_kind = 'event' AND is_deleted = 0";
	return `
		active_usage_events AS (
			SELECT *
			FROM (
				SELECT *
				FROM ${getSafeClickHouseTable(USAGE_EVENTS_TABLE)}
				WHERE organization_id = {organizationId:String}
					AND user_id = {userId:String}
					AND source = {source:String}
					AND session_id = {sessionId:String}
					${generationBound}
				ORDER BY event_version DESC
				LIMIT 1 BY organization_id, user_id, source, session_id, event_id
			)
			WHERE ${activePredicate}
		)
	`;
}

export interface ActiveUsageRecord {
	event_id: string;
	is_deleted: number;
	record_kind: string;
	source: string;
}

export interface UsageExtractionReceiptState {
	lastUsageContentSha256: string | null;
	lastUsageExtractionVersion: number | null;
	lastUsageEventIdentityVersion: number | null;
	lastUsageModelRateCardVersion: string | null;
}

export interface UsageEventWriteInput {
	contentSha256: string;
	extraction: UsageExtractionResult;
	filterVersion: number;
	generation: string;
	ingestedAt: Date;
	organizationId: string;
	replaceAbsentEvents?: boolean;
	sessionDate: Date;
	sessionId: string;
	source: UsageEventSource;
	userId: string;
}

export interface UsageExtractionConsistencyDiagnostic {
	actualActiveEventCount: number | null;
	actualReceiptCount: number | null;
	code: "usage_extraction_consistency_repair_required";
	expectedEventCount: number;
	generation: string;
}

export type UsageExtractionConsistencyResult =
	| { status: "consistent" }
	| {
			status: "repair_required";
			diagnostic: UsageExtractionConsistencyDiagnostic;
	  };

export interface UsageEventWriteResult {
	consistency: UsageExtractionConsistencyResult;
	rows: readonly RudelUsageEventsRow[];
}

export async function writeUsageExtraction(
	executor: ClickHouseExecutor,
	input: UsageEventWriteInput,
): Promise<UsageEventWriteResult> {
	const activeRecords =
		input.replaceAbsentEvents && input.extraction.status === "complete"
			? await getActiveUsageRecords(executor, input)
			: [];
	const rows = buildUsageEventRows(input, activeRecords);
	await ingestRudelUsageEvents(executor, [...rows], { validate: true });
	const consistency = await verifyUsageExtractionReceiptConsistency(
		executor,
		input,
	);
	if (consistency.status === "repair_required") {
		logger.error(
			"Usage-event write needs asynchronous consistency repair (organization_id={organizationId} session_id={sessionId} generation={generation} actual_event_count={actualEventCount} expected_event_count={expectedEventCount})",
			{
				actualEventCount:
					consistency.diagnostic.actualActiveEventCount ?? "missing",
				expectedEventCount: consistency.diagnostic.expectedEventCount,
				generation: input.generation,
				organizationId: input.organizationId,
				sessionId: input.sessionId,
			},
		);
	}
	return { consistency, rows };
}

export function buildUsageEventRows(
	input: UsageEventWriteInput,
	activeRecords: readonly ActiveUsageRecord[],
): readonly RudelUsageEventsRow[] {
	validateWriteInput(input);
	const currentRows = input.extraction.events.map((event) =>
		buildEventRow(event, input),
	);
	const receiptRow = buildReceiptRow(input);
	const desiredKeys = new Set(
		[...currentRows, receiptRow].map((row) =>
			getRowKey(row.source, row.event_id),
		),
	);
	const tombstones =
		input.replaceAbsentEvents && input.extraction.status === "complete"
			? activeRecords
					.filter(
						(record) =>
							record.is_deleted === 0 &&
							record.source === input.source &&
							!desiredKeys.has(getRowKey(record.source, record.event_id)),
					)
					.map((record) => buildTombstoneRow(record, input))
			: [];

	return [...currentRows, ...tombstones, receiptRow];
}

export function hasMatchingUsageExtractionReceipt(
	state: UsageExtractionReceiptState,
	contentSha256: string,
): boolean {
	return (
		state.lastUsageContentSha256 === contentSha256 &&
		state.lastUsageExtractionVersion === USAGE_EVENT_EXTRACTION_VERSION &&
		state.lastUsageEventIdentityVersion === USAGE_EVENT_IDENTITY_VERSION &&
		state.lastUsageModelRateCardVersion === USAGE_EVENT_MODEL_RATE_CARD_VERSION
	);
}

export function shouldReplaceUsageEventsForVersion(
	state: UsageExtractionReceiptState,
): boolean {
	// Only monotone upgrades retire prior identities. A binary downgrade keeps
	// newer facts intact and intentionally does not attempt reverse replacement.
	return (
		(state.lastUsageExtractionVersion !== null &&
			state.lastUsageExtractionVersion < USAGE_EVENT_EXTRACTION_VERSION) ||
		(state.lastUsageEventIdentityVersion !== null &&
			state.lastUsageEventIdentityVersion < USAGE_EVENT_IDENTITY_VERSION)
	);
}

async function getActiveUsageRecords(
	executor: ClickHouseExecutor,
	input: Pick<
		UsageEventWriteInput,
		"generation" | "organizationId" | "sessionId" | "source" | "userId"
	>,
): Promise<readonly ActiveUsageRecord[]> {
	return executor.query<ActiveUsageRecord>({
		query: `
			WITH ${buildActiveUsageEventsCte({ generationFence: true })}
			SELECT
				source,
				event_id,
				record_kind,
				is_deleted
			FROM active_usage_events
		`,
		query_params: {
			organizationId: input.organizationId,
			generation: input.generation,
			sessionId: input.sessionId,
			source: input.source,
			userId: input.userId,
		},
	});
}

interface UsageExtractionConsistencyRow {
	active_event_count: number;
	receipt_checksum: string;
	receipt_count: number;
	receipt_event_count: number;
	receipt_is_complete: number;
	receipt_version: string;
}

export async function verifyUsageExtractionReceiptConsistency(
	executor: ClickHouseExecutor,
	input: UsageEventWriteInput,
): Promise<UsageExtractionConsistencyResult> {
	const [state] = await executor.query<UsageExtractionConsistencyRow>({
		query: `
			WITH ${buildActiveUsageEventsCte({
				generationCeiling: true,
				includeNonEvents: true,
			})}
			SELECT
				countIf(record_kind = 'event' AND event_version = {generation:UInt64}) AS active_event_count,
				countIf(record_kind = 'receipt' AND event_version = {generation:UInt64}) AS receipt_count,
				anyIf(receipt_event_count, record_kind = 'receipt' AND event_version = {generation:UInt64}) AS receipt_event_count,
				anyIf(receipt_checksum, record_kind = 'receipt' AND event_version = {generation:UInt64}) AS receipt_checksum,
				anyIf(receipt_is_complete, record_kind = 'receipt' AND event_version = {generation:UInt64}) AS receipt_is_complete,
				toString(anyIf(event_version, record_kind = 'receipt' AND event_version = {generation:UInt64})) AS receipt_version
			FROM active_usage_events
		`,
		query_params: {
			generation: input.generation,
			organizationId: input.organizationId,
			sessionId: input.sessionId,
			source: input.source,
			userId: input.userId,
		},
	});

	const expectedComplete = input.extraction.status === "complete" ? 1 : 0;
	const activeCountMatches =
		expectedComplete === 0 ||
		state?.active_event_count === input.extraction.events.length;
	if (
		state &&
		state.receipt_count === 1 &&
		state.receipt_version === input.generation &&
		state.receipt_is_complete === expectedComplete &&
		state.receipt_event_count === input.extraction.receipt.eventCount &&
		state.receipt_checksum === input.extraction.receipt.checksum &&
		activeCountMatches
	) {
		return { status: "consistent" };
	}
	return {
		status: "repair_required",
		diagnostic: {
			actualActiveEventCount: state?.active_event_count ?? null,
			actualReceiptCount: state?.receipt_count ?? null,
			code: "usage_extraction_consistency_repair_required",
			expectedEventCount: input.extraction.events.length,
			generation: input.generation,
		},
	};
}

function buildEventRow(
	event: UsageEvent,
	input: UsageEventWriteInput,
): RudelUsageEventsRow {
	return {
		organization_id: event.organizationId,
		user_id: event.userId,
		source: event.source,
		session_id: event.sessionId,
		event_id: event.eventId,
		record_kind: "event",
		event_version: input.generation,
		event_identity_version: USAGE_EVENT_IDENTITY_VERSION,
		extraction_version: USAGE_EVENT_EXTRACTION_VERSION,
		model_rate_card_version: USAGE_EVENT_MODEL_RATE_CARD_VERSION,
		filter_version: input.filterVersion,
		content_sha256: input.contentSha256,
		occurred_at: toClickHouseTimestamp(event.occurredAt),
		usage_date: event.usageDate ?? UNKNOWN_DATE,
		has_valid_timestamp: event.occurredAt === null ? 0 : 1,
		raw_model: event.rawModel,
		resolved_model: event.resolvedModel,
		model_status: event.modelStatus,
		service_tier: event.serviceTier,
		context_input_tokens: String(event.contextInputTokens),
		uncached_input_tokens: String(event.uncachedInputTokens),
		cache_read_input_tokens: String(event.cacheReadInputTokens),
		cache_write_5m_input_tokens: String(event.cacheWrite5mInputTokens),
		cache_write_1h_input_tokens: String(event.cacheWrite1hInputTokens),
		output_tokens: String(event.outputTokens),
		reasoning_output_tokens: String(event.reasoningOutputTokens),
		agent_id: event.agentId,
		lineage_id: event.lineageId,
		parent_lineage_id: event.parentLineageId,
		token_source: event.tokenSource,
		identity_kind: event.identityKind,
		first_observed_line: event.firstObservedLine,
		duplicate_observation_count: event.duplicateObservationCount,
		quality_flags: [...event.qualityFlags],
		is_deleted: 0,
		receipt_is_complete: 0,
		receipt_event_count: 0,
		receipt_checksum: ZERO_SHA256,
		ingested_at: toClickHouseTimestamp(input.ingestedAt.toISOString()),
	};
}

function buildReceiptRow(input: UsageEventWriteInput): RudelUsageEventsRow {
	return {
		organization_id: input.organizationId,
		user_id: input.userId,
		source: input.source,
		session_id: input.sessionId,
		event_id: getUsageEventReceiptId(input),
		record_kind: "receipt",
		event_version: input.generation,
		event_identity_version: USAGE_EVENT_IDENTITY_VERSION,
		extraction_version: USAGE_EVENT_EXTRACTION_VERSION,
		model_rate_card_version: USAGE_EVENT_MODEL_RATE_CARD_VERSION,
		filter_version: input.filterVersion,
		content_sha256: input.contentSha256,
		occurred_at: UNKNOWN_TIMESTAMP,
		usage_date: toClickHouseDate(input.sessionDate),
		has_valid_timestamp: 0,
		raw_model: "",
		resolved_model: "",
		model_status: "missing",
		service_tier: "",
		context_input_tokens: "0",
		uncached_input_tokens: "0",
		cache_read_input_tokens: "0",
		cache_write_5m_input_tokens: "0",
		cache_write_1h_input_tokens: "0",
		output_tokens: "0",
		reasoning_output_tokens: "0",
		agent_id: "",
		lineage_id: "",
		parent_lineage_id: "",
		token_source: "provider_increment",
		identity_kind: "receipt",
		first_observed_line: 0,
		duplicate_observation_count: 0,
		quality_flags: input.extraction.diagnostics.map((diagnostic) =>
			diagnostic.count === 1
				? diagnostic.code
				: `${diagnostic.code}:${diagnostic.count}`,
		),
		is_deleted: 0,
		receipt_is_complete: input.extraction.receipt.complete ? 1 : 0,
		receipt_event_count: input.extraction.receipt.eventCount,
		receipt_checksum: input.extraction.receipt.checksum,
		ingested_at: toClickHouseTimestamp(input.ingestedAt.toISOString()),
	};
}

function buildTombstoneRow(
	active: ActiveUsageRecord,
	input: UsageEventWriteInput,
): RudelUsageEventsRow {
	const source = parseUsageEventSource(active.source);
	return {
		organization_id: input.organizationId,
		user_id: input.userId,
		source,
		session_id: input.sessionId,
		event_id: active.event_id,
		record_kind: active.record_kind,
		event_version: input.generation,
		event_identity_version: USAGE_EVENT_IDENTITY_VERSION,
		extraction_version: USAGE_EVENT_EXTRACTION_VERSION,
		model_rate_card_version: USAGE_EVENT_MODEL_RATE_CARD_VERSION,
		filter_version: input.filterVersion,
		content_sha256: input.contentSha256,
		occurred_at: UNKNOWN_TIMESTAMP,
		usage_date: toClickHouseDate(input.sessionDate),
		has_valid_timestamp: 0,
		raw_model: "",
		resolved_model: "",
		model_status: "missing",
		service_tier: "",
		context_input_tokens: "0",
		uncached_input_tokens: "0",
		cache_read_input_tokens: "0",
		cache_write_5m_input_tokens: "0",
		cache_write_1h_input_tokens: "0",
		output_tokens: "0",
		reasoning_output_tokens: "0",
		agent_id: "",
		lineage_id: "",
		parent_lineage_id: "",
		token_source: "provider_increment",
		identity_kind: "tombstone",
		first_observed_line: 0,
		duplicate_observation_count: 0,
		quality_flags: ["replaced_event_absent"],
		is_deleted: 1,
		receipt_is_complete: 0,
		receipt_event_count: 0,
		receipt_checksum: ZERO_SHA256,
		ingested_at: toClickHouseTimestamp(input.ingestedAt.toISOString()),
	};
}

function validateWriteInput(input: UsageEventWriteInput): void {
	if (!/^[1-9][0-9]*$/u.test(input.generation)) {
		throw new Error("Usage event generation must be a positive integer string");
	}
	if (!/^[a-f0-9]{64}$/u.test(input.contentSha256)) {
		throw new Error("Usage event content hash must be lowercase SHA-256");
	}
	if (Number.isNaN(input.sessionDate.getTime())) {
		throw new Error("Usage event session date must be valid");
	}
	if (
		!Number.isSafeInteger(input.filterVersion) ||
		input.filterVersion < 0 ||
		input.filterVersion > 65_535
	) {
		throw new Error("Usage event filter version is out of range");
	}
	if (
		input.extraction.receipt.extractionVersion !==
			USAGE_EVENT_EXTRACTION_VERSION ||
		input.extraction.receipt.eventIdentityVersion !==
			USAGE_EVENT_IDENTITY_VERSION ||
		input.extraction.receipt.modelRateCardVersion !==
			USAGE_EVENT_MODEL_RATE_CARD_VERSION ||
		input.extraction.receipt.eventCount !== input.extraction.events.length ||
		input.extraction.receipt.complete !==
			(input.extraction.status === "complete") ||
		!/^[a-f0-9]{64}$/u.test(input.extraction.receipt.checksum)
	) {
		throw new Error(
			"Usage extraction receipt does not match the writer contract",
		);
	}
	for (const event of input.extraction.events) {
		if (
			event.organizationId !== input.organizationId ||
			event.userId !== input.userId ||
			event.sessionId !== input.sessionId ||
			event.source !== input.source
		) {
			throw new Error("Usage event identity does not match its write envelope");
		}
		if (!/^[a-f0-9]{64}$/u.test(event.eventId)) {
			throw new Error("Usage event ID must be lowercase SHA-256");
		}
		if (!hasValidUsageEventTokens(event)) {
			throw new Error("Usage event tokens must be non-negative safe integers");
		}
	}
}

function hasValidUsageEventTokens(event: UsageEvent): boolean {
	return [
		event.contextInputTokens,
		event.uncachedInputTokens,
		event.cacheReadInputTokens,
		event.cacheWrite5mInputTokens,
		event.cacheWrite1hInputTokens,
		event.outputTokens,
		event.reasoningOutputTokens,
	].every((value) => Number.isSafeInteger(value) && value >= 0);
}

function parseUsageEventSource(value: string): UsageEventSource {
	if (value === "claude_code" || value === "codex") return value;
	throw new Error(`Unexpected usage event source: ${value}`);
}

function getRowKey(source: string, eventId: string): string {
	return `${source}\u0000${eventId}`;
}

function toClickHouseTimestamp(value: string | null): string {
	if (value === null) return UNKNOWN_TIMESTAMP;
	return value.replace("T", " ").replace("Z", "");
}

function toClickHouseDate(value: Date): string {
	return value.toISOString().slice(0, 10);
}
