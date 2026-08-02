import { describe, expect, test } from "bun:test";
import { evaluateGates } from "../../scripts/recount-token-classes.js";
import type { RecountCliOptions } from "../../scripts/token-recount/config.js";
import { recountClaudeSession, recountCodexSession } from "./recount.js";
import {
	buildRecountReport,
	type PreflightReport,
	type ProviderAnchor,
	renderRecountReportMarkdown,
	type SessionMeasurementInput,
} from "./report.js";
import type { StoredTokenRow, TokenClasses } from "./types.js";

const PREFLIGHT: PreflightReport = {
	databasePresent: true,
	tables: [
		{
			database: "rudel",
			name: "session_analytics",
			engine: "ReplacingMergeTree",
			sortingKey: "source, organization_id, user_id, session_id",
			primaryKey: "source, organization_id, user_id, session_id",
			partitionKey: "",
			totalRows: 4,
			totalBytes: 1_024,
		},
	],
	requiredColumnsPresent: true,
	missingColumns: [],
	skippingIndexes: [],
	explainEstimates: {},
};

describe("token recount report", () => {
	test("attributes the pre-fix gaps and reconciles exact provider anchors", () => {
		const claudeContent = claudeLine(
			"shared-request",
			"2026-08-01T10:00:00.000Z",
			tokens(100, 40, 10, 5),
		);
		const subagentContent = claudeLine(
			"subagent-request",
			"2026-08-01T10:01:00.000Z",
			tokens(20, 4, 2, 3),
		);
		const claudeRecount = recountClaudeSession({
			content: claudeContent,
			subagents: { worker: subagentContent },
		});
		const codexContent = [
			codexLine("2026-08-01T11:00:00.000Z", 100, 40, 10),
			codexLine("2026-08-01T11:01:00.000Z", 10, 4, 1),
			codexLine("2026-08-01T11:02:00.000Z", 50, 20, 5),
		].join("\n");
		const codexRecount = recountCodexSession(codexContent);
		const measurements: SessionMeasurementInput[] = [
			measurement(
				"claude_code",
				"claude-anchor",
				claudeRecount,
				stored("claude_code", "claude-anchor", 150, 40, 10, 5),
				["random", "subagent_candidate", "anchor"],
			),
			measurement(
				"codex",
				"codex-anchor",
				codexRecount,
				stored("codex", "codex-anchor", 50, 20, 0, 5),
				["random", "anchor"],
			),
			measurement(
				"claude_code",
				"claude-fork",
				recountClaudeSession({ content: claudeContent, subagents: {} }),
				stored("claude_code", "claude-fork", 150, 40, 10, 5),
				["random"],
			),
		];
		const anchors: ProviderAnchor[] = [
			anchor("claude-anchor", "claude_code", claudeRecount.tokens),
			anchor("codex-anchor", "codex", codexRecount.tokens),
		];

		const report = buildRecountReport({
			generatedAt: "2026-08-02T12:00:00.000Z",
			target: "local",
			organizationId: "owner-one",
			lookbackDays: 30,
			sampleSizePerSource: 100,
			measurements,
			anchors,
			preflight: PREFLIGHT,
		});

		expect(report.findings.find((finding) => finding.id === "H1")?.state).toBe(
			"gap_observed",
		);
		expect(report.findings.find((finding) => finding.id === "M8")?.state).toBe(
			"gap_observed",
		);
		expect(
			report.findings.find((finding) => finding.id === "M9_FORK")?.state,
		).toBe("gap_observed");
		expect(report.anchorSummary.acceptanceReady).toBe(true);
		expect(report.anchorSummary.passed).toBe(2);
		expect(report.anchorSummary.missingRequiredFeatures).toEqual([]);
		const featureGateOptions: RecountCliOptions = {
			target: "local",
			organizationId: "owner-one",
			lookbackDays: 30,
			sampleSizePerSource: 100,
			findingCandidateCount: 10,
			seed: 1,
			anchorFile: "/tmp/anchors.json",
			outputDirectory: "/tmp/reports",
			requireAnchors: false,
			requireZeroDiff: false,
			requireFeatureAnchors: true,
			expectedFindings: [],
		};
		expect(evaluateGates(report, featureGateOptions)).toEqual([]);
		expect(
			evaluateGates(
				{
					...report,
					anchorSummary: {
						...report.anchorSummary,
						missingRequiredFeatures: ["cache_1h"],
					},
				},
				featureGateOptions,
			),
		).toEqual(["provider anchors are missing billing features: cache_1h"]);
		expect(report.aggregate.forkReplayTokens).toBeGreaterThan(0);
		expect(report.forkReplayEvidence[0]?.requestFingerprint).toMatch(
			/^[a-f0-9]{16}$/,
		);
		const markdown = renderRecountReportMarkdown(report);
		expect(markdown).toContain("## Per-session diffs");
		expect(markdown).not.toContain("shared-request");
	});
});

function measurement(
	source: "claude_code" | "codex",
	sessionId: string,
	recount: ReturnType<typeof recountClaudeSession | typeof recountCodexSession>,
	storedRow: StoredTokenRow,
	sampleReasons: SessionMeasurementInput["sampleReasons"],
): SessionMeasurementInput {
	return {
		source,
		organizationId: "owner-one",
		userId: "user-one",
		sessionId,
		latestSessionDate: "2026-08-01 10:00:00.000",
		sampleReasons,
		recount,
		stored: storedRow,
	};
}

function anchor(
	sessionId: string,
	source: "claude_code" | "codex",
	providerTokens: TokenClasses,
): ProviderAnchor {
	return {
		features:
			source === "claude_code"
				? ["cache_1h", "long_context", "subagent_heavy", "capped"]
				: ["intro_boundary", "multi_model", "codex_resume"],
		name: `${source} controlled anchor`,
		source,
		organizationId: "owner-one",
		userId: "user-one",
		sessionId,
		providerTokens,
		verifiedAt: "2026-08-02",
		evidenceReference: ".context/anchors/provider-dashboard.png",
	};
}

function stored(
	source: "claude_code" | "codex",
	sessionId: string,
	inputTokens: number,
	cacheReadInputTokens: number,
	cacheCreationInputTokens: number,
	outputTokens: number,
): StoredTokenRow {
	return {
		source,
		organizationId: "owner-one",
		userId: "user-one",
		sessionId,
		inputTokens,
		cacheReadInputTokens,
		cacheCreationInputTokens,
		outputTokens,
		totalTokens: inputTokens + outputTokens,
	};
}

function tokens(
	uncachedInputTokens: number,
	cacheReadInputTokens: number,
	cacheCreation5mInputTokens: number,
	outputTokens: number,
): TokenClasses {
	return {
		uncachedInputTokens,
		cacheReadInputTokens,
		cacheCreation5mInputTokens,
		cacheCreation1hInputTokens: 0,
		outputTokens,
	};
}

function claudeLine(
	requestId: string,
	timestamp: string,
	usage: TokenClasses,
): string {
	return JSON.stringify({
		type: "assistant",
		timestamp,
		requestId,
		message: {
			id: `message-${requestId}`,
			usage: {
				input_tokens: usage.uncachedInputTokens,
				cache_read_input_tokens: usage.cacheReadInputTokens,
				cache_creation_input_tokens:
					usage.cacheCreation5mInputTokens + usage.cacheCreation1hInputTokens,
				cache_creation: {
					ephemeral_5m_input_tokens: usage.cacheCreation5mInputTokens,
					ephemeral_1h_input_tokens: usage.cacheCreation1hInputTokens,
				},
				output_tokens: usage.outputTokens,
			},
		},
	});
}

function codexLine(
	timestamp: string,
	inputTokens: number,
	cacheReadInputTokens: number,
	outputTokens: number,
): string {
	return JSON.stringify({
		type: "event_msg",
		timestamp,
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
