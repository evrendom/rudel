export type RecountSource = "claude_code" | "codex";

export interface TokenClasses {
	uncachedInputTokens: number;
	cacheReadInputTokens: number;
	cacheCreation5mInputTokens: number;
	cacheCreation1hInputTokens: number;
	outputTokens: number;
}

export interface FourTokenClasses {
	uncachedInputTokens: number;
	cacheReadInputTokens: number;
	cacheCreationInputTokens: number;
	outputTokens: number;
}

export interface RecountDiagnostics {
	contentBytes: number;
	contentLines: number;
	parsedLines: number;
	malformedLines: number;
	missingTimestamps: number;
	invalidTimestamps: number;
	usageLines: number;
	duplicateUsageLines: number;
	interleavedDuplicateUsageLines: number;
	crossFileDuplicateUsageLines: number;
	sidechainUsageLines: number;
	cacheSplitFallbackTokens: number;
	cacheSplitMismatches: number;
	currentMvWouldCap: boolean;
	codexTokenEvents: number;
	codexIgnoredTokenEvents: number;
	codexResetSegments: number;
}

export interface RequestTokenFact {
	dedupeKey: string;
	requestId: string | undefined;
	timestampMs: number | undefined;
	sequence: number;
	transcriptName: string;
	tokens: TokenClasses;
}

export interface SessionRecount {
	source: RecountSource;
	tokens: TokenClasses;
	mainTokens: TokenClasses;
	subagentTokens: TokenClasses;
	diagnostics: RecountDiagnostics;
	requestFacts: readonly RequestTokenFact[];
}

export interface RecountIdentity {
	source: RecountSource;
	organizationId: string;
	userId: string;
	sessionId: string;
}

export interface StoredTokenRow extends RecountIdentity {
	inputTokens: number;
	outputTokens: number;
	cacheReadInputTokens: number;
	cacheCreationInputTokens: number;
	totalTokens: number;
}

export interface TokenClassDiff {
	uncachedInputTokens: number;
	cacheReadInputTokens: number;
	cacheCreationInputTokens: number;
	outputTokens: number;
}

export interface TokenInvariantViolation {
	name: string;
	expected: string;
	actual: string;
}

export interface RecountSession extends RecountIdentity {
	recount: SessionRecount;
}

export interface ForkReplayEvidence {
	requestFingerprint: string;
	canonicalSessionKey: string;
	replayedSessionKeys: readonly string[];
	replayedTokens: TokenClasses;
}

export interface ForkReplayAnalysis {
	evidence: readonly ForkReplayEvidence[];
	adjustmentsBySessionKey: ReadonlyMap<string, TokenClasses>;
}
