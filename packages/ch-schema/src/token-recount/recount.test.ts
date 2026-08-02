import { describe, expect, test } from "bun:test";
import {
	buildSessionKey,
	checkStoredTokenInvariants,
	compareWithStored,
	detectForkReplay,
	inclusiveInputTokens,
	recountClaudeSession,
	recountCodexSession,
	totalTokens,
} from "./recount.js";
import type { RecountSession, StoredTokenRow } from "./types.js";

interface ClaudeUsage {
	inputTokens: number;
	cacheReadInputTokens: number;
	cacheCreationInputTokens: number;
	cacheCreation5mInputTokens: number;
	cacheCreation1hInputTokens: number;
	outputTokens: number;
}

describe("independent Claude token recount", () => {
	test("counts subagents and globally dedupes interleaved request IDs", () => {
		const main = [
			claudeAssistantLine({
				requestId: "request-main",
				messageId: "message-main",
				timestamp: "2026-08-01T10:00:00.000Z",
				usage: usage(100, 50, 30, 10, 20, 10),
			}),
			claudeAssistantLine({
				requestId: "request-repeat",
				messageId: "message-repeat",
				timestamp: "2026-08-01T10:01:00.000Z",
				usage: usage(5, 0, 0, 0, 0, 1),
			}),
			JSON.stringify({
				type: "user",
				timestamp: "not-a-timestamp",
				message: { role: "user", content: "interleaves updates" },
			}),
			claudeAssistantLine({
				requestId: "request-other",
				messageId: "message-other",
				timestamp: "2026-08-01T10:02:00.000Z",
				usage: usage(7, 0, 0, 0, 0, 2),
			}),
			claudeAssistantLine({
				requestId: "request-repeat",
				messageId: "message-repeat",
				timestamp: "2026-08-01T10:03:00.000Z",
				usage: usage(9, 1, 0, 0, 0, 3),
			}),
		].join("\n");
		const subagent = [
			claudeAssistantLine({
				requestId: "request-main",
				messageId: "message-main",
				timestamp: "2026-08-01T10:00:00.000Z",
				usage: usage(100, 50, 30, 10, 20, 10),
				isSidechain: true,
			}),
			claudeAssistantLine({
				requestId: "request-subagent",
				messageId: "message-subagent",
				timestamp: "2026-08-01T10:04:00.000Z",
				usage: usage(20, 4, 2, 2, 0, 5),
				isSidechain: true,
			}),
		].join("\n");

		const recount = recountClaudeSession({
			content: main,
			subagents: { agentOne: subagent },
		});

		expect(recount.tokens).toEqual({
			uncachedInputTokens: 136,
			cacheReadInputTokens: 55,
			cacheCreation5mInputTokens: 12,
			cacheCreation1hInputTokens: 20,
			outputTokens: 20,
		});
		expect(recount.subagentTokens).toEqual({
			uncachedInputTokens: 20,
			cacheReadInputTokens: 4,
			cacheCreation5mInputTokens: 2,
			cacheCreation1hInputTokens: 0,
			outputTokens: 5,
		});
		expect(recount.diagnostics.duplicateUsageLines).toBe(1);
		expect(recount.diagnostics.interleavedDuplicateUsageLines).toBe(1);
		expect(recount.diagnostics.crossFileDuplicateUsageLines).toBe(1);
		expect(recount.diagnostics.sidechainUsageLines).toBe(2);
		expect(recount.diagnostics.invalidTimestamps).toBe(1);
		expect(recount.diagnostics.cacheSplitMismatches).toBe(0);
		expect(inclusiveInputTokens(recount.tokens)).toBe(223);
		expect(totalTokens(recount.tokens)).toBe(243);
	});

	test("extracts real usage even when the current MV line cap would zero it", () => {
		const assistant = claudeAssistantLine({
			requestId: "request-capped",
			messageId: "message-capped",
			timestamp: "2026-08-01T10:00:00.000Z",
			usage: usage(101, 202, 303, 303, 0, 404),
		});
		const filler = Array.from({ length: 8_001 }, () => "{}");

		const recount = recountClaudeSession({
			content: [assistant, ...filler].join("\n"),
			subagents: {},
		});

		expect(recount.diagnostics.currentMvWouldCap).toBe(true);
		expect(recount.tokens).toEqual({
			uncachedInputTokens: 101,
			cacheReadInputTokens: 202,
			cacheCreation5mInputTokens: 303,
			cacheCreation1hInputTokens: 0,
			outputTokens: 404,
		});
	});
});

describe("independent Codex token recount", () => {
	test("sums maxima across cumulative-counter reset segments", () => {
		const content = [
			codexTokenLine("2026-08-01T10:00:00.000Z", 100, 40, 10),
			codexTokenLine("2026-08-01T10:01:00.000Z", 200, 80, 20),
			codexTokenLine("2026-08-01T10:02:00.000Z", 200, 80, 20),
			JSON.stringify({
				timestamp: "2026-08-01T10:03:00.000Z",
				type: "event_msg",
				payload: { type: "token_count", info: null },
			}),
			JSON.stringify({
				timestamp: "2026-08-01T10:04:00.000Z",
				type: "event_msg",
				payload: {
					type: "token_count",
					info: { total_token_usage: {} },
				},
			}),
			codexTokenLine("invalid", 20, 5, 2),
			codexTokenLine("2026-08-01T10:06:00.000Z", 50, 10, 5),
		].join("\n");

		const recount = recountCodexSession(content);

		expect(recount.tokens).toEqual({
			uncachedInputTokens: 160,
			cacheReadInputTokens: 90,
			cacheCreation5mInputTokens: 0,
			cacheCreation1hInputTokens: 0,
			outputTokens: 25,
		});
		expect(recount.diagnostics.codexTokenEvents).toBe(7);
		expect(recount.diagnostics.codexIgnoredTokenEvents).toBe(2);
		expect(recount.diagnostics.codexResetSegments).toBe(1);
		expect(recount.diagnostics.invalidTimestamps).toBe(1);
	});
});

describe("recount comparisons and invariants", () => {
	test("compares the same four classes stored by session_analytics", () => {
		const recount = recountClaudeSession({
			content: claudeAssistantLine({
				requestId: "request-compare",
				messageId: "message-compare",
				timestamp: "2026-08-01T10:00:00.000Z",
				usage: usage(100, 50, 30, 10, 20, 10),
			}),
			subagents: {},
		});
		const stored = storedRow({
			inputTokens: 165,
			cacheReadInputTokens: 45,
			cacheCreationInputTokens: 20,
			outputTokens: 8,
			totalTokens: 173,
		});

		expect(compareWithStored(recount, stored)).toEqual({
			uncachedInputTokens: 0,
			cacheReadInputTokens: 5,
			cacheCreationInputTokens: 10,
			outputTokens: 2,
		});
	});

	test("reports provider-class identity violations", () => {
		const claude = storedRow({
			inputTokens: 9,
			cacheReadInputTokens: 7,
			cacheCreationInputTokens: 3,
			outputTokens: 2,
			totalTokens: 99,
		});
		const codex = storedRow({
			source: "codex",
			inputTokens: 5,
			cacheReadInputTokens: 6,
			cacheCreationInputTokens: 1,
			outputTokens: 2,
			totalTokens: 7,
		});

		expect(checkStoredTokenInvariants(claude).map((item) => item.name)).toEqual(
			["claude_input_includes_cache", "total_is_input_plus_output"],
		);
		expect(checkStoredTokenInvariants(codex).map((item) => item.name)).toEqual([
			"codex_cache_read_is_input_subset",
			"codex_has_no_cache_creation_class",
		]);
	});

	test("measures cross-session request replay without exposing request IDs", () => {
		const first = recountSession("session-a", "2026-08-01T10:00:00.000Z");
		const fork = recountSession("session-b", "2026-08-01T10:00:00.000Z");

		const analysis = detectForkReplay([fork, first]);

		expect(analysis.evidence).toHaveLength(1);
		expect(analysis.evidence[0]?.requestFingerprint).toMatch(/^[a-f0-9]{16}$/);
		expect(analysis.evidence[0]?.canonicalSessionKey).toBe(
			buildSessionKey(first),
		);
		expect(analysis.evidence[0]?.replayedSessionKeys).toEqual([
			buildSessionKey(fork),
		]);
		expect(analysis.adjustmentsBySessionKey.get(buildSessionKey(fork))).toEqual(
			first.recount.tokens,
		);
	});
});

function recountSession(sessionId: string, timestamp: string): RecountSession {
	return {
		source: "claude_code",
		organizationId: "owner-one",
		userId: "user-one",
		sessionId,
		recount: recountClaudeSession({
			content: claudeAssistantLine({
				requestId: "shared-request-id",
				messageId: "shared-message-id",
				timestamp,
				usage: usage(10, 4, 2, 2, 0, 3),
			}),
			subagents: {},
		}),
	};
}

function usage(
	inputTokens: number,
	cacheReadInputTokens: number,
	cacheCreationInputTokens: number,
	cacheCreation5mInputTokens: number,
	cacheCreation1hInputTokens: number,
	outputTokens: number,
): ClaudeUsage {
	return {
		inputTokens,
		cacheReadInputTokens,
		cacheCreationInputTokens,
		cacheCreation5mInputTokens,
		cacheCreation1hInputTokens,
		outputTokens,
	};
}

function claudeAssistantLine(input: {
	requestId: string;
	messageId: string;
	timestamp: string;
	usage: ClaudeUsage;
	isSidechain?: boolean;
}): string {
	return JSON.stringify({
		type: "assistant",
		timestamp: input.timestamp,
		requestId: input.requestId,
		isSidechain: input.isSidechain ?? false,
		uuid: `uuid-${input.messageId}`,
		message: {
			id: input.messageId,
			model: "claude-sonnet-4-5",
			usage: {
				input_tokens: input.usage.inputTokens,
				cache_read_input_tokens: input.usage.cacheReadInputTokens,
				cache_creation_input_tokens: input.usage.cacheCreationInputTokens,
				cache_creation: {
					ephemeral_5m_input_tokens: input.usage.cacheCreation5mInputTokens,
					ephemeral_1h_input_tokens: input.usage.cacheCreation1hInputTokens,
				},
				output_tokens: input.usage.outputTokens,
			},
		},
	});
}

function codexTokenLine(
	timestamp: string,
	inputTokens: number,
	cacheReadInputTokens: number,
	outputTokens: number,
): string {
	return JSON.stringify({
		timestamp,
		type: "event_msg",
		payload: {
			type: "token_count",
			info: {
				total_token_usage: {
					input_tokens: inputTokens,
					cached_input_tokens: cacheReadInputTokens,
					output_tokens: outputTokens,
				},
			},
		},
	});
}

function storedRow(
	input: Partial<StoredTokenRow> & {
		inputTokens: number;
		outputTokens: number;
		cacheReadInputTokens: number;
		cacheCreationInputTokens: number;
		totalTokens: number;
	},
): StoredTokenRow {
	return {
		source: input.source ?? "claude_code",
		organizationId: input.organizationId ?? "owner-one",
		userId: input.userId ?? "user-one",
		sessionId: input.sessionId ?? "session-one",
		inputTokens: input.inputTokens,
		outputTokens: input.outputTokens,
		cacheReadInputTokens: input.cacheReadInputTokens,
		cacheCreationInputTokens: input.cacheCreationInputTokens,
		totalTokens: input.totalTokens,
	};
}
