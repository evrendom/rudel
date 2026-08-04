import type { UsageEventSource } from "@rudel/usage-events";
import type { ClickHouseExecutor } from "../clickhouse.js";

const COMPARISON_SCAN_SETTINGS = {
	max_bytes_to_read: String(16 * 1024 * 1024 * 1024),
	max_execution_time: 300,
	max_rows_to_read: "5000000",
	result_overflow_mode: "throw",
} as const;

export interface UsageEventComparisonOptions {
	maxSessions: number;
	organizationId?: string;
	topSessions: number;
}

export interface UsageEventComparisonRow {
	has_events: number;
	has_legacy: number;
	has_receipt: number;
	new_cache_read_input_tokens: string;
	new_cache_write_input_tokens: string;
	new_output_tokens: string;
	new_reasoning_output_tokens: string;
	new_uncached_input_tokens: string;
	old_cache_read_input_tokens: string;
	old_cache_write_input_tokens: string;
	old_output_tokens: string;
	old_uncached_input_tokens: string;
	organization_id: string;
	receipt_is_complete: number;
	session_id: string;
	source: string;
}

export interface UsageEventComparisonSourceSummary {
	completeReceiptSessionCount: number;
	legacyOnlySessionCount: number;
	legacySessionCount: number;
	matchedSessionCount: number;
	newCacheReadInputTokens: string;
	newCacheWriteInputTokens: string;
	newOutputTokens: string;
	newReasoningOutputTokens: string;
	newUncachedInputTokens: string;
	oldCacheReadInputTokens: string;
	oldCacheWriteInputTokens: string;
	oldOutputTokens: string;
	oldUncachedInputTokens: string;
	orphanEventSessionCount: number;
	receiptOnlySessionCount: number;
	receiptSessionCount: number;
	source: UsageEventSource;
}

export interface UsageEventComparisonDivergence {
	absoluteTokenDelta: string;
	newTotalTokens: string;
	oldTotalTokens: string;
	organizationId: string;
	sessionId: string;
	source: UsageEventSource;
}

export interface UsageEventComparisonResult {
	sources: readonly UsageEventComparisonSourceSummary[];
	topDivergences: readonly UsageEventComparisonDivergence[];
}

export function hasUsageEventCoverageGap(
	sources: readonly Pick<
		UsageEventComparisonSourceSummary,
		"legacySessionCount" | "matchedSessionCount" | "orphanEventSessionCount"
	>[],
): boolean {
	return sources.some(
		(source) =>
			source.matchedSessionCount !== source.legacySessionCount ||
			source.orphanEventSessionCount > 0,
	);
}

interface MutableSourceSummary {
	completeReceiptSessionCount: number;
	legacyOnlySessionCount: number;
	legacySessionCount: number;
	matchedSessionCount: number;
	newCacheReadInputTokens: bigint;
	newCacheWriteInputTokens: bigint;
	newOutputTokens: bigint;
	newReasoningOutputTokens: bigint;
	newUncachedInputTokens: bigint;
	oldCacheReadInputTokens: bigint;
	oldCacheWriteInputTokens: bigint;
	oldOutputTokens: bigint;
	oldUncachedInputTokens: bigint;
	orphanEventSessionCount: number;
	receiptOnlySessionCount: number;
	receiptSessionCount: number;
	source: UsageEventSource;
}

export async function compareUsageEventTotals(
	executor: ClickHouseExecutor,
	options: UsageEventComparisonOptions,
): Promise<UsageEventComparisonResult> {
	validateOptions(options);
	const organizationFilter = options.organizationId
		? "AND organization_id = {organizationId:String}"
		: "";
	const legacyOrganizationFilter = options.organizationId
		? "AND organization_id = {organizationId:String}"
		: "";
	const rows = await executor.query<UsageEventComparisonRow>({
		clickhouse_settings: {
			...COMPARISON_SCAN_SETTINGS,
			max_result_rows: String(options.maxSessions + 1),
		},
		query: `
			WITH
			latest_usage_records AS (
				SELECT
					organization_id,
					user_id,
					source,
					session_id,
					record_kind,
					is_deleted,
					receipt_is_complete,
					uncached_input_tokens,
					cache_read_input_tokens,
					cache_write_5m_input_tokens,
					cache_write_1h_input_tokens,
					output_tokens,
					reasoning_output_tokens
				FROM rudel.usage_events FINAL
				WHERE source IN ('claude_code', 'codex')
					${organizationFilter}
			),
			receipts AS (
				SELECT
					organization_id,
					user_id,
					source,
					session_id,
					max(receipt_is_complete) AS receipt_is_complete,
					toUInt8(1) AS has_receipt
				FROM latest_usage_records
				WHERE record_kind = 'receipt' AND is_deleted = 0
				GROUP BY organization_id, user_id, source, session_id
			),
			event_rollups AS (
				SELECT
					organization_id,
					user_id,
					source,
					session_id,
					sum(uncached_input_tokens) AS uncached_input_tokens,
					sum(cache_read_input_tokens) AS cache_read_input_tokens,
					sum(cache_write_5m_input_tokens + cache_write_1h_input_tokens) AS cache_write_input_tokens,
					sum(output_tokens) AS output_tokens,
					sum(reasoning_output_tokens) AS reasoning_output_tokens,
					toUInt8(1) AS has_events
				FROM latest_usage_records
				WHERE record_kind = 'event' AND is_deleted = 0
				GROUP BY organization_id, user_id, source, session_id
			),
			usage_side AS (
				SELECT
					if(r.has_receipt = 1, r.organization_id, e.organization_id) AS organization_id,
					if(r.has_receipt = 1, r.user_id, e.user_id) AS user_id,
					if(r.has_receipt = 1, r.source, e.source) AS source,
					if(r.has_receipt = 1, r.session_id, e.session_id) AS session_id,
					ifNull(r.has_receipt, 0) AS has_receipt,
					ifNull(e.has_events, 0) AS has_events,
					ifNull(r.receipt_is_complete, 0) AS receipt_is_complete,
					if(r.receipt_is_complete = 1, ifNull(e.uncached_input_tokens, 0), 0) AS uncached_input_tokens,
					if(r.receipt_is_complete = 1, ifNull(e.cache_read_input_tokens, 0), 0) AS cache_read_input_tokens,
					if(r.receipt_is_complete = 1, ifNull(e.cache_write_input_tokens, 0), 0) AS cache_write_input_tokens,
					if(r.receipt_is_complete = 1, ifNull(e.output_tokens, 0), 0) AS output_tokens,
					if(r.receipt_is_complete = 1, ifNull(e.reasoning_output_tokens, 0), 0) AS reasoning_output_tokens
				FROM receipts AS r
				FULL OUTER JOIN event_rollups AS e
					USING (organization_id, user_id, source, session_id)
			),
			legacy AS (
				SELECT
					organization_id,
					user_id,
					source,
					session_id,
					greatest(input_tokens - cache_read_input_tokens - cache_creation_input_tokens, 0) AS uncached_input_tokens,
					cache_read_input_tokens,
					cache_creation_input_tokens AS cache_write_input_tokens,
					output_tokens,
					toUInt8(1) AS has_legacy
				FROM rudel.session_analytics FINAL
				WHERE source IN ('claude_code', 'codex')
					AND input_tokens + output_tokens > 0
					${legacyOrganizationFilter}
			)
			SELECT
				if(l.has_legacy = 1, l.organization_id, u.organization_id) AS organization_id,
				if(l.has_legacy = 1, l.source, u.source) AS source,
				if(l.has_legacy = 1, l.session_id, u.session_id) AS session_id,
				ifNull(l.has_legacy, 0) AS has_legacy,
				ifNull(u.has_receipt, 0) AS has_receipt,
				ifNull(u.has_events, 0) AS has_events,
				ifNull(u.receipt_is_complete, 0) AS receipt_is_complete,
				toString(ifNull(l.uncached_input_tokens, 0)) AS old_uncached_input_tokens,
				toString(ifNull(l.cache_read_input_tokens, 0)) AS old_cache_read_input_tokens,
				toString(ifNull(l.cache_write_input_tokens, 0)) AS old_cache_write_input_tokens,
				toString(ifNull(l.output_tokens, 0)) AS old_output_tokens,
				toString(ifNull(u.uncached_input_tokens, 0)) AS new_uncached_input_tokens,
				toString(ifNull(u.cache_read_input_tokens, 0)) AS new_cache_read_input_tokens,
				toString(ifNull(u.cache_write_input_tokens, 0)) AS new_cache_write_input_tokens,
				toString(ifNull(u.output_tokens, 0)) AS new_output_tokens,
				toString(ifNull(u.reasoning_output_tokens, 0)) AS new_reasoning_output_tokens
			FROM legacy AS l
			FULL OUTER JOIN usage_side AS u
				USING (organization_id, user_id, source, session_id)
			ORDER BY source, organization_id, session_id
			LIMIT {sessionLimit:UInt32}
		`,
		query_params: {
			organizationId: options.organizationId ?? "",
			sessionLimit: options.maxSessions + 1,
		},
	});
	if (rows.length > options.maxSessions) {
		throw new Error(
			`Usage-event comparison found more than --max-sessions=${options.maxSessions}. Increase the explicit bound after reviewing table growth.`,
		);
	}
	return summarizeUsageEventComparison(rows, options.topSessions);
}

export function summarizeUsageEventComparison(
	rows: readonly UsageEventComparisonRow[],
	topSessions: number,
): UsageEventComparisonResult {
	const bySource = new Map<UsageEventSource, MutableSourceSummary>();
	const divergences: UsageEventComparisonDivergence[] = [];

	for (const row of rows) {
		const source = parseSource(row.source);
		const summary = bySource.get(source) ?? emptySummary(source);
		const hasLegacy = row.has_legacy === 1;
		const hasReceipt = row.has_receipt === 1;
		const hasCompleteReceipt = hasReceipt && row.receipt_is_complete === 1;
		const hasEvents = row.has_events === 1;

		if (hasLegacy) summary.legacySessionCount += 1;
		if (hasReceipt) summary.receiptSessionCount += 1;
		if (hasCompleteReceipt) summary.completeReceiptSessionCount += 1;
		if (hasLegacy && hasCompleteReceipt) summary.matchedSessionCount += 1;
		if (hasLegacy && !hasReceipt) summary.legacyOnlySessionCount += 1;
		if (!hasLegacy && hasReceipt) summary.receiptOnlySessionCount += 1;
		if (hasEvents && !hasReceipt) summary.orphanEventSessionCount += 1;

		const oldUncached = hasLegacy ? BigInt(row.old_uncached_input_tokens) : 0n;
		const oldCacheRead = hasLegacy
			? BigInt(row.old_cache_read_input_tokens)
			: 0n;
		const oldCacheWrite = hasLegacy
			? BigInt(row.old_cache_write_input_tokens)
			: 0n;
		const oldOutput = hasLegacy ? BigInt(row.old_output_tokens) : 0n;
		const newUncached = hasCompleteReceipt
			? BigInt(row.new_uncached_input_tokens)
			: 0n;
		const newCacheRead = hasCompleteReceipt
			? BigInt(row.new_cache_read_input_tokens)
			: 0n;
		const newCacheWrite = hasCompleteReceipt
			? BigInt(row.new_cache_write_input_tokens)
			: 0n;
		const newOutput = hasCompleteReceipt ? BigInt(row.new_output_tokens) : 0n;
		const newReasoning = hasCompleteReceipt
			? BigInt(row.new_reasoning_output_tokens)
			: 0n;

		summary.oldUncachedInputTokens += oldUncached;
		summary.oldCacheReadInputTokens += oldCacheRead;
		summary.oldCacheWriteInputTokens += oldCacheWrite;
		summary.oldOutputTokens += oldOutput;
		summary.newUncachedInputTokens += newUncached;
		summary.newCacheReadInputTokens += newCacheRead;
		summary.newCacheWriteInputTokens += newCacheWrite;
		summary.newOutputTokens += newOutput;
		summary.newReasoningOutputTokens += newReasoning;
		bySource.set(source, summary);

		const oldTotal = oldUncached + oldCacheRead + oldCacheWrite + oldOutput;
		const newTotal = newUncached + newCacheRead + newCacheWrite + newOutput;
		const delta = newTotal - oldTotal;
		divergences.push({
			absoluteTokenDelta: (delta < 0n ? -delta : delta).toString(),
			newTotalTokens: newTotal.toString(),
			oldTotalTokens: oldTotal.toString(),
			organizationId: row.organization_id,
			sessionId: row.session_id,
			source,
		});
	}

	return {
		sources: [...bySource.values()]
			.sort((left, right) => left.source.localeCompare(right.source))
			.map(toSourceSummary),
		topDivergences: divergences
			.sort((left, right) => {
				const deltaOrder =
					BigInt(right.absoluteTokenDelta) - BigInt(left.absoluteTokenDelta);
				if (deltaOrder !== 0n) return deltaOrder > 0n ? 1 : -1;
				return (
					left.source.localeCompare(right.source) ||
					left.organizationId.localeCompare(right.organizationId) ||
					left.sessionId.localeCompare(right.sessionId)
				);
			})
			.slice(0, topSessions),
	};
}

function emptySummary(source: UsageEventSource): MutableSourceSummary {
	return {
		completeReceiptSessionCount: 0,
		legacyOnlySessionCount: 0,
		legacySessionCount: 0,
		matchedSessionCount: 0,
		newCacheReadInputTokens: 0n,
		newCacheWriteInputTokens: 0n,
		newOutputTokens: 0n,
		newReasoningOutputTokens: 0n,
		newUncachedInputTokens: 0n,
		oldCacheReadInputTokens: 0n,
		oldCacheWriteInputTokens: 0n,
		oldOutputTokens: 0n,
		oldUncachedInputTokens: 0n,
		orphanEventSessionCount: 0,
		receiptOnlySessionCount: 0,
		receiptSessionCount: 0,
		source,
	};
}

function toSourceSummary(
	summary: MutableSourceSummary,
): UsageEventComparisonSourceSummary {
	return {
		completeReceiptSessionCount: summary.completeReceiptSessionCount,
		legacyOnlySessionCount: summary.legacyOnlySessionCount,
		legacySessionCount: summary.legacySessionCount,
		matchedSessionCount: summary.matchedSessionCount,
		newCacheReadInputTokens: summary.newCacheReadInputTokens.toString(),
		newCacheWriteInputTokens: summary.newCacheWriteInputTokens.toString(),
		newOutputTokens: summary.newOutputTokens.toString(),
		newReasoningOutputTokens: summary.newReasoningOutputTokens.toString(),
		newUncachedInputTokens: summary.newUncachedInputTokens.toString(),
		oldCacheReadInputTokens: summary.oldCacheReadInputTokens.toString(),
		oldCacheWriteInputTokens: summary.oldCacheWriteInputTokens.toString(),
		oldOutputTokens: summary.oldOutputTokens.toString(),
		oldUncachedInputTokens: summary.oldUncachedInputTokens.toString(),
		orphanEventSessionCount: summary.orphanEventSessionCount,
		receiptOnlySessionCount: summary.receiptOnlySessionCount,
		receiptSessionCount: summary.receiptSessionCount,
		source: summary.source,
	};
}

function parseSource(source: string): UsageEventSource {
	if (source === "claude_code" || source === "codex") return source;
	throw new Error(`Unexpected usage-event comparison source: ${source}`);
}

function validateOptions(options: UsageEventComparisonOptions): void {
	if (!Number.isSafeInteger(options.maxSessions) || options.maxSessions <= 0) {
		throw new Error("Usage-event comparison maxSessions must be positive");
	}
	if (!Number.isSafeInteger(options.topSessions) || options.topSessions <= 0) {
		throw new Error("Usage-event comparison topSessions must be positive");
	}
	if (options.topSessions > options.maxSessions) {
		throw new Error(
			"Usage-event comparison topSessions cannot exceed maxSessions",
		);
	}
}
