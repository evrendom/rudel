import { createHash } from "node:crypto";
import type {
	ForkReplayAnalysis,
	ForkReplayEvidence,
	FourTokenClasses,
	RecountDiagnostics,
	RecountSession,
	RequestTokenFact,
	SessionRecount,
	StoredTokenRow,
	TokenClassDiff,
	TokenClasses,
	TokenInvariantViolation,
} from "./types.js";

const CURRENT_MV_MAX_CONTENT_BYTES = 120_000_000;
const CURRENT_MV_MAX_NEWLINES = 8_000;

interface ClaudeRecountInput {
	content: string;
	subagents: Readonly<Record<string, string>>;
}

interface TranscriptParseResult {
	facts: readonly RequestTokenFact[];
	diagnostics: RecountDiagnostics;
}

interface MutableDiagnostics extends RecountDiagnostics {}

interface CodexUsageSnapshot {
	inputTokens: number;
	cacheReadInputTokens: number;
	outputTokens: number;
}

interface JsonLineContext {
	lineNumber: number;
	value: Record<string, unknown>;
}

export function recountClaudeSession(
	input: ClaudeRecountInput,
): SessionRecount {
	const main = parseClaudeTranscript("main", input.content);
	const subagentResults = Object.entries(input.subagents)
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([name, content]) =>
			parseClaudeTranscript(`subagent:${name}`, content),
		);
	const merged = mergeClaudeFacts(main, subagentResults);
	const mainTokens = sumRequestFacts(main.facts);
	const tokens = sumRequestFacts(merged.facts);

	return {
		source: "claude_code",
		tokens,
		mainTokens,
		subagentTokens: subtractTokenClasses(tokens, mainTokens),
		diagnostics: merged.diagnostics,
		requestFacts: merged.facts,
	};
}

export function recountCodexSession(content: string): SessionRecount {
	const diagnostics = createDiagnostics(content);
	const snapshots: CodexUsageSnapshot[] = [];

	visitJsonLines(content, diagnostics, ({ value }) => {
		const timestamp = readTimestamp(value);
		recordTimestampDiagnostic(timestamp, diagnostics);
		if (value.type !== "event_msg") return;

		const payload = readRecord(value.payload);
		if (!payload || payload.type !== "token_count") return;
		diagnostics.codexTokenEvents += 1;

		const info = readRecord(payload.info);
		const usage = readRecord(info?.total_token_usage);
		const snapshot = usage ? readCodexUsageSnapshot(usage) : undefined;
		if (!snapshot) {
			diagnostics.codexIgnoredTokenEvents += 1;
			return;
		}
		snapshots.push(snapshot);
	});

	const segmented = sumCodexSegments(snapshots);
	diagnostics.codexResetSegments = segmented.resetCount;
	const tokens = codexSnapshotToTokenClasses(segmented.total);

	return {
		source: "codex",
		tokens,
		mainTokens: tokens,
		subagentTokens: emptyTokenClasses(),
		diagnostics,
		requestFacts: [],
	};
}

export function compareWithStored(
	recount: SessionRecount,
	stored: StoredTokenRow,
): TokenClassDiff {
	const expected = toFourTokenClasses(recount.tokens);
	const actual = storedToFourTokenClasses(stored);

	return {
		uncachedInputTokens:
			expected.uncachedInputTokens - actual.uncachedInputTokens,
		cacheReadInputTokens:
			expected.cacheReadInputTokens - actual.cacheReadInputTokens,
		cacheCreationInputTokens:
			expected.cacheCreationInputTokens - actual.cacheCreationInputTokens,
		outputTokens: expected.outputTokens - actual.outputTokens,
	};
}

export function checkStoredTokenInvariants(
	stored: StoredTokenRow,
): readonly TokenInvariantViolation[] {
	const violations: TokenInvariantViolation[] = [];
	const cacheTotal =
		stored.cacheReadInputTokens + stored.cacheCreationInputTokens;

	if (stored.source === "claude_code" && stored.inputTokens < cacheTotal) {
		violations.push({
			name: "claude_input_includes_cache",
			expected:
				"input_tokens >= cache_read_input_tokens + cache_creation_input_tokens",
			actual: `${stored.inputTokens} < ${cacheTotal}`,
		});
	}
	if (
		stored.source === "codex" &&
		stored.cacheReadInputTokens > stored.inputTokens
	) {
		violations.push({
			name: "codex_cache_read_is_input_subset",
			expected: "cache_read_input_tokens <= input_tokens",
			actual: `${stored.cacheReadInputTokens} > ${stored.inputTokens}`,
		});
	}
	if (stored.source === "codex" && stored.cacheCreationInputTokens !== 0) {
		violations.push({
			name: "codex_has_no_cache_creation_class",
			expected: "cache_creation_input_tokens = 0",
			actual: String(stored.cacheCreationInputTokens),
		});
	}
	if (stored.totalTokens !== stored.inputTokens + stored.outputTokens) {
		violations.push({
			name: "total_is_input_plus_output",
			expected: "total_tokens = input_tokens + output_tokens",
			actual: `${stored.totalTokens} != ${stored.inputTokens + stored.outputTokens}`,
		});
	}

	return violations;
}

export function detectForkReplay(
	sessions: readonly RecountSession[],
): ForkReplayAnalysis {
	const factsByRequest = new Map<
		string,
		Array<{ sessionKey: string; fact: RequestTokenFact }>
	>();

	for (const session of sessions) {
		if (session.source !== "claude_code") continue;
		const sessionKey = buildSessionKey(session);
		for (const fact of session.recount.requestFacts) {
			if (!fact.requestId) continue;
			const requestKey = `${session.organizationId}\u0000${session.userId}\u0000${fact.requestId}`;
			const facts = factsByRequest.get(requestKey) ?? [];
			facts.push({ sessionKey, fact });
			factsByRequest.set(requestKey, facts);
		}
	}

	const evidence: ForkReplayEvidence[] = [];
	const adjustments = new Map<string, TokenClasses>();
	for (const [requestKey, requestFacts] of factsByRequest) {
		const uniqueSessions = dedupeFactsBySession(requestFacts);
		if (uniqueSessions.length < 2) continue;

		const ordered = [...uniqueSessions].sort(compareReplayFacts);
		const canonical = ordered[0];
		if (!canonical) continue;
		const replays = ordered.slice(1);
		let replayedTokens = emptyTokenClasses();
		for (const replay of replays) {
			replayedTokens = addTokenClasses(replayedTokens, replay.fact.tokens);
			adjustments.set(
				replay.sessionKey,
				addTokenClasses(
					adjustments.get(replay.sessionKey) ?? emptyTokenClasses(),
					replay.fact.tokens,
				),
			);
		}

		evidence.push({
			requestFingerprint: fingerprintRequest(requestKey),
			canonicalSessionKey: canonical.sessionKey,
			replayedSessionKeys: replays.map((replay) => replay.sessionKey),
			replayedTokens,
		});
	}

	return {
		evidence,
		adjustmentsBySessionKey: adjustments,
	};
}

export function buildSessionKey(input: {
	source: string;
	organizationId: string;
	userId: string;
	sessionId: string;
}): string {
	return [
		input.source,
		input.organizationId,
		input.userId,
		input.sessionId,
	].join(":");
}

export function toFourTokenClasses(tokens: TokenClasses): FourTokenClasses {
	return {
		uncachedInputTokens: tokens.uncachedInputTokens,
		cacheReadInputTokens: tokens.cacheReadInputTokens,
		cacheCreationInputTokens:
			tokens.cacheCreation5mInputTokens + tokens.cacheCreation1hInputTokens,
		outputTokens: tokens.outputTokens,
	};
}

export function inclusiveInputTokens(tokens: TokenClasses): number {
	const fourClasses = toFourTokenClasses(tokens);
	return (
		fourClasses.uncachedInputTokens +
		fourClasses.cacheReadInputTokens +
		fourClasses.cacheCreationInputTokens
	);
}

export function totalTokens(tokens: TokenClasses): number {
	return inclusiveInputTokens(tokens) + tokens.outputTokens;
}

export function addTokenClasses(
	left: TokenClasses,
	right: TokenClasses,
): TokenClasses {
	return {
		uncachedInputTokens: left.uncachedInputTokens + right.uncachedInputTokens,
		cacheReadInputTokens:
			left.cacheReadInputTokens + right.cacheReadInputTokens,
		cacheCreation5mInputTokens:
			left.cacheCreation5mInputTokens + right.cacheCreation5mInputTokens,
		cacheCreation1hInputTokens:
			left.cacheCreation1hInputTokens + right.cacheCreation1hInputTokens,
		outputTokens: left.outputTokens + right.outputTokens,
	};
}

export function subtractTokenClasses(
	left: TokenClasses,
	right: TokenClasses,
): TokenClasses {
	return {
		uncachedInputTokens: Math.max(
			0,
			left.uncachedInputTokens - right.uncachedInputTokens,
		),
		cacheReadInputTokens: Math.max(
			0,
			left.cacheReadInputTokens - right.cacheReadInputTokens,
		),
		cacheCreation5mInputTokens: Math.max(
			0,
			left.cacheCreation5mInputTokens - right.cacheCreation5mInputTokens,
		),
		cacheCreation1hInputTokens: Math.max(
			0,
			left.cacheCreation1hInputTokens - right.cacheCreation1hInputTokens,
		),
		outputTokens: Math.max(0, left.outputTokens - right.outputTokens),
	};
}

export function emptyTokenClasses(): TokenClasses {
	return {
		uncachedInputTokens: 0,
		cacheReadInputTokens: 0,
		cacheCreation5mInputTokens: 0,
		cacheCreation1hInputTokens: 0,
		outputTokens: 0,
	};
}

function parseClaudeTranscript(
	transcriptName: string,
	content: string,
): TranscriptParseResult {
	const diagnostics = createDiagnostics(content);
	const factsByKey = new Map<string, RequestTokenFact>();
	let previousUsageKey: string | undefined;
	let usageSequence = 0;

	visitJsonLines(content, diagnostics, ({ lineNumber, value }) => {
		const timestamp = readTimestamp(value);
		recordTimestampDiagnostic(timestamp, diagnostics);
		if (value.type !== "assistant") return;

		const message = readRecord(value.message);
		const usage = readRecord(message?.usage);
		if (!usage) return;
		const tokens = readClaudeTokenClasses(usage, diagnostics);
		const requestId = readNonEmptyString(value.requestId);
		const messageId = readNonEmptyString(message?.id);
		const uuid = readNonEmptyString(value.uuid);
		const dedupeKey = requestId
			? `request:${requestId}`
			: messageId
				? `message:${messageId}`
				: uuid
					? `uuid:${uuid}`
					: `line:${transcriptName}:${lineNumber}`;
		const existing = factsByKey.get(dedupeKey);
		if (existing) {
			diagnostics.duplicateUsageLines += 1;
			if (previousUsageKey !== dedupeKey) {
				diagnostics.interleavedDuplicateUsageLines += 1;
			}
		}
		if (value.isSidechain === true) diagnostics.sidechainUsageLines += 1;

		usageSequence += 1;
		diagnostics.usageLines += 1;
		factsByKey.set(dedupeKey, {
			dedupeKey,
			requestId,
			timestampMs: timestamp.kind === "valid" ? timestamp.value : undefined,
			sequence: usageSequence,
			transcriptName,
			tokens,
		});
		previousUsageKey = dedupeKey;
	});

	return { facts: [...factsByKey.values()], diagnostics };
}

function mergeClaudeFacts(
	main: TranscriptParseResult,
	subagents: readonly TranscriptParseResult[],
): TranscriptParseResult {
	const diagnostics = cloneDiagnostics(main.diagnostics);
	const factsByKey = new Map<string, RequestTokenFact>();
	for (const fact of main.facts) factsByKey.set(fact.dedupeKey, fact);

	for (const subagent of subagents) {
		mergeDiagnostics(diagnostics, subagent.diagnostics);
		for (const fact of subagent.facts) {
			const existing = factsByKey.get(fact.dedupeKey);
			if (existing) {
				diagnostics.crossFileDuplicateUsageLines += 1;
			}
			if (!existing || isLaterFact(fact, existing)) {
				factsByKey.set(fact.dedupeKey, fact);
			}
		}
	}

	return { facts: [...factsByKey.values()], diagnostics };
}

function readClaudeTokenClasses(
	usage: Record<string, unknown>,
	diagnostics: MutableDiagnostics,
): TokenClasses {
	const flatCacheCreation = readNonNegativeInteger(
		usage.cache_creation_input_tokens,
	);
	const cacheCreation = readRecord(usage.cache_creation);
	const nested5m = readNonNegativeInteger(
		cacheCreation?.ephemeral_5m_input_tokens,
	);
	const nested1h = readNonNegativeInteger(
		cacheCreation?.ephemeral_1h_input_tokens,
	);
	const nestedTotal = nested5m + nested1h;
	const cacheCreationTotal = Math.max(flatCacheCreation, nestedTotal);
	if (flatCacheCreation !== nestedTotal && nestedTotal > 0) {
		diagnostics.cacheSplitMismatches += 1;
	}
	const fallbackTokens = Math.max(0, flatCacheCreation - nestedTotal);
	diagnostics.cacheSplitFallbackTokens += fallbackTokens;

	return {
		uncachedInputTokens: readNonNegativeInteger(usage.input_tokens),
		cacheReadInputTokens: readNonNegativeInteger(usage.cache_read_input_tokens),
		cacheCreation5mInputTokens:
			nestedTotal > 0
				? nested5m + Math.max(0, cacheCreationTotal - nestedTotal)
				: cacheCreationTotal,
		cacheCreation1hInputTokens: nested1h,
		outputTokens: readNonNegativeInteger(usage.output_tokens),
	};
}

function readCodexUsageSnapshot(
	usage: Record<string, unknown>,
): CodexUsageSnapshot | undefined {
	const inputTokens = readOptionalNonNegativeInteger(usage.input_tokens);
	const outputTokens = readOptionalNonNegativeInteger(usage.output_tokens);
	const cacheReadInputTokens = readOptionalNonNegativeInteger(
		usage.cached_input_tokens,
	);
	if (
		inputTokens === undefined ||
		outputTokens === undefined ||
		cacheReadInputTokens === undefined
	) {
		return undefined;
	}
	return { inputTokens, outputTokens, cacheReadInputTokens };
}

function sumCodexSegments(snapshots: readonly CodexUsageSnapshot[]): {
	total: CodexUsageSnapshot;
	resetCount: number;
} {
	let total = emptyCodexSnapshot();
	let segmentMax: CodexUsageSnapshot | undefined;
	let previous: CodexUsageSnapshot | undefined;
	let resetCount = 0;

	for (const snapshot of snapshots) {
		if (previous && hasCodexCounterReset(previous, snapshot)) {
			if (segmentMax) total = addCodexSnapshots(total, segmentMax);
			segmentMax = undefined;
			resetCount += 1;
		}
		segmentMax = segmentMax
			? maxCodexSnapshots(segmentMax, snapshot)
			: snapshot;
		previous = snapshot;
	}
	if (segmentMax) total = addCodexSnapshots(total, segmentMax);

	return { total, resetCount };
}

function hasCodexCounterReset(
	previous: CodexUsageSnapshot,
	current: CodexUsageSnapshot,
): boolean {
	return (
		current.inputTokens < previous.inputTokens ||
		current.outputTokens < previous.outputTokens ||
		current.cacheReadInputTokens < previous.cacheReadInputTokens
	);
}

function maxCodexSnapshots(
	left: CodexUsageSnapshot,
	right: CodexUsageSnapshot,
): CodexUsageSnapshot {
	return {
		inputTokens: Math.max(left.inputTokens, right.inputTokens),
		outputTokens: Math.max(left.outputTokens, right.outputTokens),
		cacheReadInputTokens: Math.max(
			left.cacheReadInputTokens,
			right.cacheReadInputTokens,
		),
	};
}

function addCodexSnapshots(
	left: CodexUsageSnapshot,
	right: CodexUsageSnapshot,
): CodexUsageSnapshot {
	return {
		inputTokens: left.inputTokens + right.inputTokens,
		outputTokens: left.outputTokens + right.outputTokens,
		cacheReadInputTokens:
			left.cacheReadInputTokens + right.cacheReadInputTokens,
	};
}

function emptyCodexSnapshot(): CodexUsageSnapshot {
	return { inputTokens: 0, cacheReadInputTokens: 0, outputTokens: 0 };
}

function codexSnapshotToTokenClasses(
	snapshot: CodexUsageSnapshot,
): TokenClasses {
	return {
		uncachedInputTokens: Math.max(
			0,
			snapshot.inputTokens - snapshot.cacheReadInputTokens,
		),
		cacheReadInputTokens: snapshot.cacheReadInputTokens,
		cacheCreation5mInputTokens: 0,
		cacheCreation1hInputTokens: 0,
		outputTokens: snapshot.outputTokens,
	};
}

function storedToFourTokenClasses(stored: StoredTokenRow): FourTokenClasses {
	return {
		uncachedInputTokens: Math.max(
			0,
			stored.inputTokens -
				stored.cacheReadInputTokens -
				stored.cacheCreationInputTokens,
		),
		cacheReadInputTokens: stored.cacheReadInputTokens,
		cacheCreationInputTokens: stored.cacheCreationInputTokens,
		outputTokens: stored.outputTokens,
	};
}

function sumRequestFacts(facts: readonly RequestTokenFact[]): TokenClasses {
	return facts.reduce(
		(total, fact) => addTokenClasses(total, fact.tokens),
		emptyTokenClasses(),
	);
}

function visitJsonLines(
	content: string,
	diagnostics: MutableDiagnostics,
	visitor: (context: JsonLineContext) => void,
): void {
	let start = 0;
	let lineNumber = 0;
	while (start <= content.length) {
		const newline = content.indexOf("\n", start);
		const end = newline === -1 ? content.length : newline;
		lineNumber += 1;
		const line = content.slice(start, end).trim();
		if (line.length > 0) {
			let parsed: unknown;
			try {
				parsed = JSON.parse(line);
			} catch {
				diagnostics.malformedLines += 1;
				parsed = undefined;
			}
			const value = readRecord(parsed);
			if (value) {
				diagnostics.parsedLines += 1;
				visitor({ lineNumber, value });
			} else if (parsed !== undefined) {
				diagnostics.malformedLines += 1;
			}
		}
		if (newline === -1) break;
		start = newline + 1;
	}
}

function createDiagnostics(content: string): MutableDiagnostics {
	const newlineCount = countNewlines(content);
	const contentBytes = Buffer.byteLength(content, "utf8");
	return {
		contentBytes,
		contentLines: content.length === 0 ? 0 : newlineCount + 1,
		parsedLines: 0,
		malformedLines: 0,
		missingTimestamps: 0,
		invalidTimestamps: 0,
		usageLines: 0,
		duplicateUsageLines: 0,
		interleavedDuplicateUsageLines: 0,
		crossFileDuplicateUsageLines: 0,
		sidechainUsageLines: 0,
		cacheSplitFallbackTokens: 0,
		cacheSplitMismatches: 0,
		currentMvWouldCap:
			contentBytes > CURRENT_MV_MAX_CONTENT_BYTES ||
			newlineCount > CURRENT_MV_MAX_NEWLINES,
		codexTokenEvents: 0,
		codexIgnoredTokenEvents: 0,
		codexResetSegments: 0,
	};
}

function cloneDiagnostics(diagnostics: RecountDiagnostics): MutableDiagnostics {
	return { ...diagnostics };
}

function mergeDiagnostics(
	target: MutableDiagnostics,
	source: RecountDiagnostics,
): void {
	target.contentBytes += source.contentBytes;
	target.contentLines += source.contentLines;
	target.parsedLines += source.parsedLines;
	target.malformedLines += source.malformedLines;
	target.missingTimestamps += source.missingTimestamps;
	target.invalidTimestamps += source.invalidTimestamps;
	target.usageLines += source.usageLines;
	target.duplicateUsageLines += source.duplicateUsageLines;
	target.interleavedDuplicateUsageLines +=
		source.interleavedDuplicateUsageLines;
	target.crossFileDuplicateUsageLines += source.crossFileDuplicateUsageLines;
	target.sidechainUsageLines += source.sidechainUsageLines;
	target.cacheSplitFallbackTokens += source.cacheSplitFallbackTokens;
	target.cacheSplitMismatches += source.cacheSplitMismatches;
	target.codexTokenEvents += source.codexTokenEvents;
	target.codexIgnoredTokenEvents += source.codexIgnoredTokenEvents;
	target.codexResetSegments += source.codexResetSegments;
}

function countNewlines(content: string): number {
	let count = 0;
	for (let index = 0; index < content.length; index += 1) {
		if (content.charCodeAt(index) === 10) count += 1;
	}
	return count;
}

function readTimestamp(
	value: Record<string, unknown>,
):
	| { kind: "missing" }
	| { kind: "invalid" }
	| { kind: "valid"; value: number } {
	if (!("timestamp" in value)) return { kind: "missing" };
	if (typeof value.timestamp !== "string") return { kind: "invalid" };
	const parsed = Date.parse(value.timestamp);
	return Number.isFinite(parsed)
		? { kind: "valid", value: parsed }
		: { kind: "invalid" };
}

function recordTimestampDiagnostic(
	timestamp: ReturnType<typeof readTimestamp>,
	diagnostics: MutableDiagnostics,
): void {
	if (timestamp.kind === "missing") diagnostics.missingTimestamps += 1;
	if (timestamp.kind === "invalid") diagnostics.invalidTimestamps += 1;
}

function dedupeFactsBySession(
	requestFacts: ReadonlyArray<{
		sessionKey: string;
		fact: RequestTokenFact;
	}>,
): Array<{ sessionKey: string; fact: RequestTokenFact }> {
	const factsBySession = new Map<
		string,
		{ sessionKey: string; fact: RequestTokenFact }
	>();
	for (const requestFact of requestFacts) {
		factsBySession.set(requestFact.sessionKey, requestFact);
	}
	return [...factsBySession.values()];
}

function compareReplayFacts(
	left: { sessionKey: string; fact: RequestTokenFact },
	right: { sessionKey: string; fact: RequestTokenFact },
): number {
	const leftTimestamp = left.fact.timestampMs ?? Number.POSITIVE_INFINITY;
	const rightTimestamp = right.fact.timestampMs ?? Number.POSITIVE_INFINITY;
	return (
		leftTimestamp - rightTimestamp ||
		left.sessionKey.localeCompare(right.sessionKey)
	);
}

function isLaterFact(
	candidate: RequestTokenFact,
	existing: RequestTokenFact,
): boolean {
	if (
		candidate.timestampMs !== undefined &&
		existing.timestampMs !== undefined
	) {
		return candidate.timestampMs >= existing.timestampMs;
	}
	return (
		candidate.timestampMs !== undefined && existing.timestampMs === undefined
	);
}

function fingerprintRequest(requestKey: string): string {
	return createHash("sha256").update(requestKey).digest("hex").slice(0, 16);
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
	return isRecord(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readNonEmptyString(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

function readNonNegativeInteger(value: unknown): number {
	return readOptionalNonNegativeInteger(value) ?? 0;
}

function readOptionalNonNegativeInteger(value: unknown): number | undefined {
	return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
		? value
		: undefined;
}
