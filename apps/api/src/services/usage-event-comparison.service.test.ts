import { describe, expect, test } from "bun:test";
import {
	hasUsageEventCoverageGap,
	summarizeUsageEventComparison,
} from "./usage-event-comparison.service.js";

describe("usage-event side-by-side summary", () => {
	test("keeps token classes separate and ranks absolute per-session divergence", () => {
		const result = summarizeUsageEventComparison(
			[
				{
					has_events: 1,
					has_legacy: 1,
					has_receipt: 1,
					new_cache_read_input_tokens: "30",
					new_cache_write_input_tokens: "40",
					new_output_tokens: "50",
					new_reasoning_output_tokens: "5",
					new_uncached_input_tokens: "20",
					old_cache_read_input_tokens: "3",
					old_cache_write_input_tokens: "4",
					old_output_tokens: "5",
					old_uncached_input_tokens: "2",
					organization_id: "org-1",
					receipt_is_complete: 1,
					session_id: "large-diff",
					source: "claude_code",
				},
				{
					has_events: 0,
					has_legacy: 1,
					has_receipt: 0,
					new_cache_read_input_tokens: "0",
					new_cache_write_input_tokens: "0",
					new_output_tokens: "0",
					new_reasoning_output_tokens: "0",
					new_uncached_input_tokens: "0",
					old_cache_read_input_tokens: "2",
					old_cache_write_input_tokens: "3",
					old_output_tokens: "4",
					old_uncached_input_tokens: "1",
					organization_id: "org-1",
					receipt_is_complete: 0,
					session_id: "legacy-only",
					source: "codex",
				},
				{
					has_events: 1,
					has_legacy: 0,
					has_receipt: 1,
					new_cache_read_input_tokens: "1",
					new_cache_write_input_tokens: "1",
					new_output_tokens: "1",
					new_reasoning_output_tokens: "0",
					new_uncached_input_tokens: "1",
					old_cache_read_input_tokens: "0",
					old_cache_write_input_tokens: "0",
					old_output_tokens: "0",
					old_uncached_input_tokens: "0",
					organization_id: "org-2",
					receipt_is_complete: 0,
					session_id: "incomplete-new-only",
					source: "codex",
				},
			],
			2,
		);

		expect(result.sources).toEqual([
			{
				completeReceiptSessionCount: 1,
				legacyOnlySessionCount: 0,
				legacySessionCount: 1,
				matchedSessionCount: 1,
				newCacheReadInputTokens: "30",
				newCacheWriteInputTokens: "40",
				newOutputTokens: "50",
				newReasoningOutputTokens: "5",
				newUncachedInputTokens: "20",
				orphanEventSessionCount: 0,
				oldCacheReadInputTokens: "3",
				oldCacheWriteInputTokens: "4",
				oldOutputTokens: "5",
				oldUncachedInputTokens: "2",
				receiptOnlySessionCount: 0,
				receiptSessionCount: 1,
				source: "claude_code",
			},
			{
				completeReceiptSessionCount: 0,
				legacyOnlySessionCount: 1,
				legacySessionCount: 1,
				matchedSessionCount: 0,
				newCacheReadInputTokens: "0",
				newCacheWriteInputTokens: "0",
				newOutputTokens: "0",
				newReasoningOutputTokens: "0",
				newUncachedInputTokens: "0",
				orphanEventSessionCount: 0,
				oldCacheReadInputTokens: "2",
				oldCacheWriteInputTokens: "3",
				oldOutputTokens: "4",
				oldUncachedInputTokens: "1",
				receiptOnlySessionCount: 1,
				receiptSessionCount: 1,
				source: "codex",
			},
		]);
		expect(result.topDivergences).toEqual([
			{
				absoluteTokenDelta: "126",
				newTotalTokens: "140",
				oldTotalTokens: "14",
				organizationId: "org-1",
				sessionId: "large-diff",
				source: "claude_code",
			},
			{
				absoluteTokenDelta: "10",
				newTotalTokens: "0",
				oldTotalTokens: "10",
				organizationId: "org-1",
				sessionId: "legacy-only",
				source: "codex",
			},
		]);
	});

	test("requires each legacy session to match a complete receipt", () => {
		expect(
			hasUsageEventCoverageGap([
				{
					legacySessionCount: 1,
					matchedSessionCount: 0,
					orphanEventSessionCount: 0,
				},
			]),
		).toBe(true);
		expect(
			hasUsageEventCoverageGap([
				{
					legacySessionCount: 1,
					matchedSessionCount: 1,
					orphanEventSessionCount: 0,
				},
			]),
		).toBe(false);
	});
});
