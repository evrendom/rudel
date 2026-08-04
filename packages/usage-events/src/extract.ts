import { createHash } from "node:crypto";
import { resolveModelPricing } from "@rudel/api-routes/model-pricing";
import {
	USAGE_EVENT_EXTRACTION_VERSION,
	USAGE_EVENT_IDENTITY_VERSION,
	USAGE_EVENT_MODEL_RATE_CARD_VERSION,
	type UsageEvent,
	type UsageEventModelStatus,
	type UsageEventSource,
	type UsageEventTokens,
	type UsageExtractionDiagnostic,
	type UsageExtractionInput,
	type UsageExtractionResult,
} from "./types.js";

const SYNTHETIC_MODEL = "<synthetic>";
const MAX_DIAGNOSTIC_DETAILS_PER_CODE = 20;
const MAX_DIAGNOSTIC_DETAIL_CHARACTERS = 256;
const DIAGNOSTIC_DETAILS_OVERFLOW = "<additional-details-omitted>";
const CODEX_REPLAY_BURST_MAX_GAP_MS = 1_000;

interface MutableDiagnostic {
	count: number;
	details: Set<string>;
	detailsOverflowed: boolean;
	fatal: boolean;
}

interface JsonLine {
	line: string;
	lineNumber: number;
	value: Record<string, unknown>;
}

interface ClaudeCandidate {
	agentId: string;
	cacheReadInputTokens: number;
	cacheWrite5mInputTokens: number;
	cacheWrite1hInputTokens: number;
	firstObservedLine: number;
	identityKind: string;
	identityValue: string;
	isMain: boolean;
	model: string;
	modelWasSynthetic: boolean;
	occurredAt: string | null;
	outputTokens: number;
	qualityFlags: readonly string[];
	serviceTier: string;
	transcriptName: string;
	uncachedInputTokens: number;
}

interface CodexVector {
	inputTokens: number;
	cacheReadInputTokens: number;
	outputTokens: number;
	reasoningOutputTokens: number;
}

interface CodexReplayState {
	active: boolean;
	previousTimestampMs: number;
	previousTotalKey: string;
	suppressedTransitionKeys: Set<string>;
}

interface MutableUsageEvent extends Omit<UsageEvent, "qualityFlags"> {
	qualityFlags: string[];
}

interface VersionedUsageExtractionInput extends UsageExtractionInput {
	versions: UsageExtractionVersions;
}

export interface UsageExtractionVersions {
	extractionVersion: number;
	identityVersion: number;
}

export type UsageIdentityPrefixKind =
	| "usage-event"
	| "usage-receipt"
	| "claude-lineage"
	| "codex-lineage"
	| "codex-external-lineage"
	| "codex-unresolved-lineage";

export function getUsageIdentityPrefix(
	kind: UsageIdentityPrefixKind,
	identityVersion = USAGE_EVENT_IDENTITY_VERSION,
): string {
	if (!Number.isSafeInteger(identityVersion) || identityVersion <= 0) {
		throw new Error("Usage-event identity version must be a positive integer");
	}
	return `${kind}:v${identityVersion}`;
}

export function extractUsageEvents(
	input: UsageExtractionInput,
): UsageExtractionResult {
	return extractUsageEventsAtVersions(input, {
		extractionVersion: USAGE_EVENT_EXTRACTION_VERSION,
		identityVersion: USAGE_EVENT_IDENTITY_VERSION,
	});
}

export function extractUsageEventsAtVersions(
	input: UsageExtractionInput,
	versions: UsageExtractionVersions,
): UsageExtractionResult {
	validateUsageExtractionVersions(versions);
	const versionedInput: VersionedUsageExtractionInput = { ...input, versions };
	const diagnostics = new Map<string, MutableDiagnostic>();
	const events =
		input.source === "claude_code"
			? extractClaudeEvents(versionedInput, diagnostics)
			: extractCodexEvents(versionedInput, diagnostics);
	const finalizedDiagnostics = finalizeDiagnostics(diagnostics);

	if (finalizedDiagnostics.some((diagnostic) => diagnostic.fatal)) {
		return createIncompleteUsageExtractionResult(
			finalizedDiagnostics,
			versions,
		);
	}

	const sortedEvents = [...events].sort((left, right) =>
		compareBytes(left.eventId, right.eventId),
	);
	return {
		status: "complete",
		events: sortedEvents,
		diagnostics: finalizedDiagnostics,
		receipt: buildReceipt(sortedEvents, true, versions),
	};
}

export function createIncompleteUsageExtractionResult(
	diagnostics: readonly UsageExtractionDiagnostic[],
	versions: UsageExtractionVersions = {
		extractionVersion: USAGE_EVENT_EXTRACTION_VERSION,
		identityVersion: USAGE_EVENT_IDENTITY_VERSION,
	},
): Extract<UsageExtractionResult, { status: "incomplete" }> {
	validateUsageExtractionVersions(versions);
	return {
		status: "incomplete",
		events: [],
		diagnostics,
		receipt: buildReceipt([], false, versions),
	};
}

function buildReceipt(
	events: readonly UsageEvent[],
	complete: boolean,
	versions: UsageExtractionVersions,
): UsageExtractionResult["receipt"] {
	return {
		complete,
		extractionVersion: versions.extractionVersion,
		eventIdentityVersion: versions.identityVersion,
		modelRateCardVersion: USAGE_EVENT_MODEL_RATE_CARD_VERSION,
		eventCount: events.length,
		checksum: checksumEvents(events),
	};
}

export function getUsageEventReceiptId(
	input: {
		organizationId: string;
		userId: string;
		sessionId: string;
		source: UsageEventSource;
	},
	identityVersion = USAGE_EVENT_IDENTITY_VERSION,
): string {
	return hashParts([
		getUsageIdentityPrefix("usage-receipt", identityVersion),
		input.source,
		input.organizationId,
		input.userId,
		input.sessionId,
	]);
}

function validateUsageExtractionVersions(
	versions: UsageExtractionVersions,
): void {
	if (
		!Number.isSafeInteger(versions.extractionVersion) ||
		versions.extractionVersion <= 0
	) {
		throw new Error(
			"Usage-event extraction version must be a positive integer",
		);
	}
	getUsageIdentityPrefix("usage-event", versions.identityVersion);
}

export function getUsageAttestationPayload(
	events: readonly UsageEvent[],
): readonly (readonly (string | number | null)[])[] {
	return [...events]
		.sort((left, right) => compareBytes(left.eventId, right.eventId))
		.map((event) => [
			"usage-attestation:v1",
			event.eventId,
			event.identityKind,
			event.usageDate,
			event.rawModel,
			event.contextInputTokens,
			event.uncachedInputTokens,
			event.cacheReadInputTokens,
			event.cacheWrite5mInputTokens,
			event.cacheWrite1hInputTokens,
			event.outputTokens,
			event.reasoningOutputTokens,
		]);
}

function extractClaudeEvents(
	input: VersionedUsageExtractionInput,
	diagnostics: Map<string, MutableDiagnostic>,
): readonly UsageEvent[] {
	const candidates: ClaudeCandidate[] = [];
	visitJsonLines(input.content, diagnostics, (line) => {
		const candidate = readClaudeCandidate("main", true, line, diagnostics);
		if (candidate) candidates.push(candidate);
	});

	for (const [agentId, content] of Object.entries(input.subagents).sort(
		([left], [right]) => compareBytes(left, right),
	)) {
		const transcriptName = `subagent:${agentId}`;
		visitJsonLines(content, diagnostics, (line) => {
			const candidate = readClaudeCandidate(
				transcriptName,
				false,
				line,
				diagnostics,
			);
			if (candidate) candidates.push(candidate);
		});
	}

	const groups = new Map<string, ClaudeCandidate[]>();
	for (const candidate of candidates) {
		const groupKey = `${candidate.identityKind}\u0000${candidate.identityValue}`;
		const group = groups.get(groupKey) ?? [];
		group.push(candidate);
		groups.set(groupKey, group);
	}

	return [...groups.values()].map((group) =>
		mergeClaudeCandidateGroup(input, group, diagnostics),
	);
}

function readClaudeCandidate(
	transcriptName: string,
	isMainTranscript: boolean,
	line: JsonLine,
	diagnostics: Map<string, MutableDiagnostic>,
): ClaudeCandidate | undefined {
	if (line.value.type !== "assistant") return undefined;
	const message = readRecord(line.value.message);
	const usage = readRecord(message?.usage);
	if (!usage) return undefined;
	if (!hasRequiredClaudeTokens(usage)) {
		if (isPotentiallyBillableTokenRecord(usage)) {
			if (readToken(usage.input_tokens) === undefined) {
				addDiagnostic(diagnostics, "claude_invalid_input_tokens", true);
			}
			if (readToken(usage.output_tokens) === undefined) {
				addDiagnostic(diagnostics, "claude_invalid_output_tokens", true);
			}
		} else {
			addDiagnostic(diagnostics, "claude_nonbillable_partial_usage", false);
		}
		return undefined;
	}

	const inputTokens = readRequiredToken(
		usage.input_tokens,
		"claude_invalid_input_tokens",
		diagnostics,
	);
	const outputTokens = readRequiredToken(
		usage.output_tokens,
		"claude_invalid_output_tokens",
		diagnostics,
	);
	const cacheReadInputTokens = readOptionalToken(
		usage,
		"cache_read_input_tokens",
		"claude_invalid_cache_read_tokens",
		diagnostics,
	);
	const flatCacheWrite = readOptionalToken(
		usage,
		"cache_creation_input_tokens",
		"claude_invalid_flat_cache_write_tokens",
		diagnostics,
	);
	const cacheCreation = readOptionalRecord(
		usage,
		"cache_creation",
		"claude_invalid_cache_creation",
		diagnostics,
	);
	const nested5m = readOptionalToken(
		cacheCreation,
		"ephemeral_5m_input_tokens",
		"claude_invalid_cache_write_5m_tokens",
		diagnostics,
	);
	const nested1h = readOptionalToken(
		cacheCreation,
		"ephemeral_1h_input_tokens",
		"claude_invalid_cache_write_1h_tokens",
		diagnostics,
	);
	if (
		inputTokens === undefined ||
		outputTokens === undefined ||
		cacheReadInputTokens === undefined ||
		flatCacheWrite === undefined ||
		nested5m === undefined ||
		nested1h === undefined
	) {
		return undefined;
	}

	const nestedTotal = nested5m + nested1h;
	const qualityFlags: string[] = [];
	if (cacheCreation && flatCacheWrite !== nestedTotal) {
		qualityFlags.push("cache_write_flat_nested_mismatch");
		addDiagnostic(diagnostics, "claude_cache_write_flat_nested_mismatch");
	}
	const cacheWrite5mInputTokens =
		nested5m + Math.max(0, flatCacheWrite - nestedTotal);
	const cacheWrite1hInputTokens = nested1h;
	if (
		inputTokens === 0 &&
		cacheReadInputTokens === 0 &&
		cacheWrite5mInputTokens === 0 &&
		cacheWrite1hInputTokens === 0 &&
		outputTokens === 0
	) {
		qualityFlags.push("zero_usage_event");
		addDiagnostic(diagnostics, "claude_zero_usage_event", false);
	}
	const isSidechain = line.value.isSidechain === true;
	const transcriptAgentId = isMainTranscript
		? ""
		: transcriptName.slice("subagent:".length);
	const embeddedAgentId = readNonEmptyString(line.value.agentId) ?? "";
	const agentId = isSidechain
		? embeddedAgentId || transcriptAgentId
		: isMainTranscript
			? "main"
			: transcriptAgentId;
	if (isSidechain && agentId === "") {
		qualityFlags.push("sidechain_agent_id_missing");
		addDiagnostic(diagnostics, "claude_sidechain_agent_id_missing", false);
	}
	if ((!isMainTranscript || isSidechain) && agentId === "main") {
		qualityFlags.push("subagent_id_collides_with_main");
		addDiagnostic(diagnostics, "claude_subagent_id_collides_with_main", false);
	}

	const messageId = readNonEmptyString(message?.id);
	const requestId = readNonEmptyString(line.value.requestId);
	const uuid = readNonEmptyString(line.value.uuid);
	let identityKind: string;
	let identityValue: string;
	if (messageId) {
		identityKind = "message_id";
		identityValue = messageId;
	} else if (requestId) {
		identityKind = "request_id";
		identityValue = requestId;
	} else if (uuid) {
		identityKind = "uuid";
		identityValue = uuid;
	} else {
		identityKind = "record_sha256";
		identityValue = sha256(line.line);
		qualityFlags.push("keyless_usage_record");
		addDiagnostic(diagnostics, "claude_keyless_usage_record");
	}

	const model = readNonEmptyString(message?.model) ?? "";
	const occurredAt = readTimestamp(line.value.timestamp);
	if (occurredAt === null) {
		qualityFlags.push("invalid_or_missing_timestamp");
		addDiagnostic(diagnostics, "claude_invalid_or_missing_timestamp");
	}

	return {
		agentId,
		cacheReadInputTokens,
		cacheWrite5mInputTokens,
		cacheWrite1hInputTokens,
		firstObservedLine: line.lineNumber,
		identityKind,
		identityValue,
		isMain: isMainTranscript && !isSidechain,
		model: model === SYNTHETIC_MODEL ? "" : model,
		modelWasSynthetic: model === SYNTHETIC_MODEL,
		occurredAt,
		outputTokens,
		qualityFlags,
		serviceTier: normalizeServiceTier(
			usage.service_tier,
			"claude_code",
			qualityFlags,
			diagnostics,
		),
		transcriptName,
		uncachedInputTokens: inputTokens,
	};
}

function mergeClaudeCandidateGroup(
	input: VersionedUsageExtractionInput,
	group: readonly ClaudeCandidate[],
	diagnostics: Map<string, MutableDiagnostic>,
): UsageEvent {
	const first = group[0];
	if (!first) throw new Error("Claude candidate group must not be empty");
	const qualityFlags = new Set(
		group.flatMap((candidate) => candidate.qualityFlags),
	);
	if (group.length > 1) {
		addDiagnostic(diagnostics, "claude_duplicate_usage_record", false);
	}
	if (first.identityKind === "record_sha256" && group.length > 1) {
		qualityFlags.add("keyless_exact_duplicate");
		addDiagnostic(diagnostics, "claude_keyless_exact_duplicate", false);
	}

	const preferredMetadata = selectClaudeMetadataCandidates(group);
	const occurredAt = resolveClaudeTimestamp(
		preferredMetadata,
		group,
		qualityFlags,
	);
	const model = resolveClaudeModel(
		preferredMetadata,
		group,
		occurredAt,
		qualityFlags,
	);
	const serviceTier = resolveClaudeServiceTier(
		preferredMetadata,
		group,
		qualityFlags,
	);
	const agentIds = new Set(group.map((candidate) => candidate.agentId));
	const hasMain = group.some((candidate) => candidate.isMain);
	const agentId = hasMain
		? "main"
		: agentIds.size === 1
			? (group[0]?.agentId ?? "")
			: "";
	if (!hasMain && agentIds.size > 1) {
		qualityFlags.add("agent_identity_conflict");
	}

	const uncachedInputTokens = maxField(group, "uncachedInputTokens");
	const cacheReadInputTokens = maxField(group, "cacheReadInputTokens");
	const cacheWrite5mInputTokens = maxField(group, "cacheWrite5mInputTokens");
	const cacheWrite1hInputTokens = maxField(group, "cacheWrite1hInputTokens");
	const outputTokens = maxField(group, "outputTokens");
	const contextInputTokens =
		uncachedInputTokens +
		cacheReadInputTokens +
		cacheWrite5mInputTokens +
		cacheWrite1hInputTokens;
	const transcriptNames = [...new Set(group.map((item) => item.transcriptName))]
		.sort(compareBytes)
		.join("\u0000");
	const eventId = getEventId(input, first.identityKind, first.identityValue);

	return {
		organizationId: input.organizationId,
		userId: input.userId,
		sessionId: input.sessionId,
		source: input.source,
		eventId,
		identityKind: first.identityKind,
		occurredAt,
		usageDate: occurredAt?.slice(0, 10) ?? null,
		rawModel: model.rawModel,
		resolvedModel: model.resolvedModel,
		modelStatus: model.status,
		serviceTier,
		contextInputTokens,
		uncachedInputTokens,
		cacheReadInputTokens,
		cacheWrite5mInputTokens,
		cacheWrite1hInputTokens,
		outputTokens,
		reasoningOutputTokens: 0,
		agentId,
		lineageId: hashParts([
			getUsageIdentityPrefix("claude-lineage", input.versions.identityVersion),
			input.sessionId,
			transcriptNames,
		]),
		parentLineageId: "",
		tokenSource: "provider_increment",
		firstObservedLine: Math.min(
			...group.map((candidate) => candidate.firstObservedLine),
		),
		duplicateObservationCount: group.length - 1,
		qualityFlags: [...qualityFlags].sort(compareBytes),
	};
}

function selectClaudeMetadataCandidates(
	group: readonly ClaudeCandidate[],
): readonly ClaudeCandidate[] {
	const main = group.filter((candidate) => candidate.isMain);
	return main.length > 0 ? main : group;
}

function resolveClaudeModel(
	preferred: readonly ClaudeCandidate[],
	all: readonly ClaudeCandidate[],
	occurredAt: string | null,
	qualityFlags: Set<string>,
): {
	rawModel: string;
	resolvedModel: string;
	status: UsageEventModelStatus;
} {
	const preferredReal = uniqueModelsCaseInsensitive(
		preferred.map((candidate) => candidate.model),
	);
	const realModels =
		preferredReal.length > 0
			? preferredReal
			: uniqueModelsCaseInsensitive(all.map((candidate) => candidate.model));
	if (realModels.length > 1) {
		qualityFlags.add("model_conflict");
		return { rawModel: "", resolvedModel: "", status: "conflict" };
	}
	const rawModel = realModels[0];
	if (rawModel) {
		return resolveUsageModel(rawModel, occurredAt, qualityFlags, "claude_code");
	}
	if (all.some((candidate) => candidate.modelWasSynthetic)) {
		qualityFlags.add("synthetic_model");
		return { rawModel: "", resolvedModel: "", status: "synthetic" };
	}
	qualityFlags.add("missing_model");
	return { rawModel: "", resolvedModel: "", status: "missing" };
}

function resolveClaudeTimestamp(
	preferred: readonly ClaudeCandidate[],
	all: readonly ClaudeCandidate[],
	qualityFlags: Set<string>,
): string | null {
	const preferredTimestamps = uniqueNonEmpty(
		preferred.map((candidate) => candidate.occurredAt ?? ""),
	).sort(compareBytes);
	const timestamps =
		preferredTimestamps.length > 0
			? preferredTimestamps
			: uniqueNonEmpty(all.map((candidate) => candidate.occurredAt ?? "")).sort(
					compareBytes,
				);
	if (timestamps.length > 1) qualityFlags.add("timestamp_conflict");
	const occurredAt = timestamps[0] ?? null;
	if (occurredAt === null) qualityFlags.add("invalid_or_missing_timestamp");
	return occurredAt;
}

function resolveClaudeServiceTier(
	preferred: readonly ClaudeCandidate[],
	all: readonly ClaudeCandidate[],
	qualityFlags: Set<string>,
): string {
	const preferredTiers = uniqueNonEmpty(
		preferred.map((candidate) => candidate.serviceTier),
	);
	const tiers =
		preferredTiers.length > 0
			? preferredTiers
			: uniqueNonEmpty(all.map((candidate) => candidate.serviceTier));
	if (tiers.length > 1) {
		qualityFlags.add("service_tier_conflict");
		return "";
	}
	return tiers[0] ?? "";
}

function extractCodexEvents(
	input: VersionedUsageExtractionInput,
	diagnostics: Map<string, MutableDiagnostic>,
): readonly UsageEvent[] {
	const events: MutableUsageEvent[] = [];
	const replayState = createCodexReplayState(input.content);
	const transitionIndexes = new Map<string, number>();
	const knownTotals = new Map<
		string,
		{ lineages: string[]; vector: CodexVector }
	>();
	let activeModel = "";
	let previousTotalKey = "";
	let hasInterleaving = false;
	let hasUnresolvedFallback = false;
	let hasInheritedBaseline = replayState.active;
	let lastTotal: CodexVector | undefined;
	const outgoingTransitions = new Map<string, Set<string>>();

	visitJsonLines(input.content, diagnostics, (line) => {
		const payload = readRecord(line.value.payload);
		if (line.value.type === "turn_context") {
			const model = readNonEmptyString(payload?.model);
			if (model && model !== SYNTHETIC_MODEL) activeModel = model;
			return;
		}
		if (line.value.type !== "event_msg" || payload?.type !== "token_count") {
			return;
		}

		const info = readRecord(payload.info);
		const totalRecord = readRecord(info?.total_token_usage);
		if (!totalRecord) {
			addDiagnostic(diagnostics, "codex_token_count_without_total", false);
			return;
		}
		if (!hasRequiredCodexTokens(totalRecord)) {
			if (isPotentiallyBillableTokenRecord(totalRecord)) {
				addDiagnostic(diagnostics, "codex_invalid_total_usage", true);
			} else {
				addDiagnostic(diagnostics, "codex_nonbillable_partial_usage", false);
			}
			return;
		}
		const total = readCodexVector(
			totalRecord,
			"codex_invalid_total_usage",
			diagnostics,
		);
		if (!total) return;
		lastTotal = total;
		const totalKey = codexVectorKey(total);
		const lastRecord = readRecord(info?.last_token_usage);
		let last: CodexVector | undefined;
		if (lastRecord && !hasRequiredCodexTokens(lastRecord)) {
			if (isPotentiallyBillableTokenRecord(lastRecord)) {
				addDiagnostic(diagnostics, "codex_invalid_last_usage", true);
				return;
			}
			addDiagnostic(diagnostics, "codex_nonbillable_partial_last_usage", false);
		} else if (lastRecord) {
			last = readCodexVector(
				lastRecord,
				"codex_invalid_last_usage",
				diagnostics,
			);
		}
		const occurredAt = readTimestamp(line.value.timestamp);
		const lineQualityFlags: string[] = [];
		const serviceTier = normalizeServiceTier(
			info?.service_tier ?? payload.service_tier,
			"codex",
			lineQualityFlags,
			diagnostics,
		);

		if (last && isZeroVector(last)) {
			addDiagnostic(diagnostics, "codex_zero_last_increment", false);
			addKnownTotal(knownTotals, total);
			previousTotalKey = totalKey;
			return;
		}

		if (last) {
			if (!isVectorLessThanOrEqual(last, total)) {
				addDiagnostic(diagnostics, "codex_last_exceeds_total", true);
				return;
			}
		}

		if (shouldSuppressCodexReplayEvent(replayState, totalKey, occurredAt)) {
			if (last) {
				const baseline = subtractCodexVectors(total, last);
				const transitionKey = `${codexVectorKey(baseline)}->${totalKey}`;
				if (!replayState.suppressedTransitionKeys.has(transitionKey)) {
					replayState.suppressedTransitionKeys.add(transitionKey);
					addDiagnostic(
						diagnostics,
						"codex_replayed_parent_prefix_suppressed",
						false,
					);
				}
			}
			addKnownTotal(knownTotals, total);
			previousTotalKey = totalKey;
			return;
		}

		if (last) {
			const baseline = subtractCodexVectors(total, last);
			const baselineKey = codexVectorKey(baseline);
			if (
				previousTotalKey !== "" &&
				baselineKey !== previousTotalKey &&
				knownTotals.has(baselineKey)
			) {
				hasInterleaving = true;
				addDiagnostic(diagnostics, "codex_non_adjacent_baseline", false);
			}
			const parent = resolveCodexParent(baseline, knownTotals, diagnostics);
			if (parent.inherited) hasInheritedBaseline = true;
			const emitted = emitCodexTransition({
				activeModel,
				baseline,
				diagnostics,
				events,
				firstObservedLine: line.lineNumber,
				increment: last,
				input,
				occurredAt,
				parentLineageId: parent.lineageId,
				qualityFlags: [...parent.qualityFlags, ...lineQualityFlags],
				serviceTier,
				tokenSource: "provider_increment",
				total,
				transitionIndexes,
			});
			if (
				emitted &&
				recordCodexOutgoingTransition(
					outgoingTransitions,
					baselineKey,
					`${baselineKey}->${totalKey}`,
				)
			) {
				hasInterleaving = true;
				addDiagnostic(diagnostics, "codex_multiple_lineages", false);
			}
			addKnownTotal(
				knownTotals,
				total,
				getCodexLineageId(input, baseline, total),
			);
			previousTotalKey = totalKey;
			return;
		}

		if (knownTotals.has(totalKey)) {
			addDiagnostic(diagnostics, "codex_missing_last_exact_repeat", false);
			previousTotalKey = totalKey;
			return;
		}

		const compatibleBaselines = getCompatibleBaselines(total, knownTotals);
		if (compatibleBaselines.length === 1) {
			const baseline = compatibleBaselines[0];
			if (!baseline) throw new Error("Expected a Codex fallback baseline");
			const increment = subtractCodexVectors(total, baseline.vector);
			const qualityFlags = [
				"cumulative_delta_fallback_unverified",
				...lineQualityFlags,
			];
			if (baseline.lineages.length > 1) {
				qualityFlags.push("ambiguous_parent_lineage");
			}
			if (baseline.lineages.length === 0) {
				hasInheritedBaseline = true;
				qualityFlags.push("inherited_external_baseline_unverified");
				addDiagnostic(diagnostics, "codex_inherited_external_baseline", false);
			}
			const baselineKey = codexVectorKey(baseline.vector);
			const emitted = emitCodexTransition({
				activeModel,
				baseline: baseline.vector,
				diagnostics,
				events,
				firstObservedLine: line.lineNumber,
				increment,
				input,
				occurredAt,
				parentLineageId: [...baseline.lineages].sort(compareBytes)[0] ?? "",
				qualityFlags,
				serviceTier,
				tokenSource: "cumulative_delta_fallback",
				total,
				transitionIndexes,
			});
			if (
				emitted &&
				recordCodexOutgoingTransition(
					outgoingTransitions,
					baselineKey,
					`${baselineKey}->${totalKey}`,
				)
			) {
				hasInterleaving = true;
				addDiagnostic(diagnostics, "codex_multiple_lineages", false);
			}
			addDiagnostic(diagnostics, "codex_cumulative_delta_fallback", false);
			addKnownTotal(
				knownTotals,
				total,
				getCodexLineageId(input, baseline.vector, total),
			);
			previousTotalKey = totalKey;
			return;
		}

		hasUnresolvedFallback = true;
		addDiagnostic(diagnostics, "codex_unresolved_missing_last", false);
		addKnownTotal(knownTotals, total);
		previousTotalKey = totalKey;
	});

	if (hasInterleaving) {
		for (const event of events) {
			addQualityFlag(event, "interleaved_model_attribution_unverified");
		}
	}
	addCodexFinalSnapshotDiagnostic(
		events,
		lastTotal,
		{
			hasInheritedBaseline,
			hasInterleaving,
			hasUnresolvedFallback,
		},
		diagnostics,
	);

	return events;
}

function createCodexReplayState(content: string): CodexReplayState {
	const replayStart = hasCodexParentMetadata(content)
		? detectCodexReplayBurstStart(content)
		: null;
	return {
		active: replayStart !== null,
		previousTimestampMs: replayStart ?? 0,
		previousTotalKey: "",
		suppressedTransitionKeys: new Set<string>(),
	};
}

function hasCodexParentMetadata(content: string): boolean {
	const newline = content.indexOf("\n");
	const firstLine = content
		.slice(0, newline === -1 ? content.length : newline)
		.trim();
	if (firstLine === "") return false;
	let parsed: unknown;
	try {
		parsed = JSON.parse(firstLine);
	} catch {
		return false;
	}
	const value = readRecord(parsed);
	const payload = readRecord(value?.payload);
	if (value?.type !== "session_meta" || !payload) return false;
	const source = readRecord(payload.source);
	const subagent = readRecord(source?.subagent);
	const threadSpawn = readRecord(subagent?.thread_spawn);
	const parentId =
		readNonEmptyString(payload.forked_from_id) ??
		readNonEmptyString(threadSpawn?.parent_thread_id);
	const sessionId = readNonEmptyString(payload.id);
	return parentId !== undefined && parentId !== sessionId;
}

function detectCodexReplayBurstStart(content: string): number | null {
	const timestamps: number[] = [];
	visitJsonLines(content, new Map<string, MutableDiagnostic>(), (line) => {
		const payload = readRecord(line.value.payload);
		if (line.value.type !== "event_msg" || payload?.type !== "token_count") {
			return;
		}
		const info = readRecord(payload.info);
		if (
			!readRecord(info?.last_token_usage) &&
			!readRecord(info?.total_token_usage)
		) {
			return;
		}
		const occurredAt = readTimestamp(line.value.timestamp);
		if (occurredAt === null) return;
		timestamps.push(Date.parse(occurredAt));
		return timestamps.length < 2;
	});
	const first = timestamps[0];
	const second = timestamps[1];
	if (first === undefined || second === undefined) return null;
	const gap = second - first;
	return gap >= 0 && gap <= CODEX_REPLAY_BURST_MAX_GAP_MS ? first : null;
}

function shouldSuppressCodexReplayEvent(
	state: CodexReplayState,
	totalKey: string,
	occurredAt: string | null,
): boolean {
	if (!state.active) return false;
	if (state.previousTotalKey !== "" && state.previousTotalKey === totalKey) {
		return true;
	}
	if (occurredAt === null) {
		state.active = false;
		return false;
	}
	const timestampMs = Date.parse(occurredAt);
	const gap = timestampMs - state.previousTimestampMs;
	if (gap >= 0 && gap <= CODEX_REPLAY_BURST_MAX_GAP_MS) {
		state.previousTimestampMs = timestampMs;
		state.previousTotalKey = totalKey;
		return true;
	}
	state.active = false;
	return false;
}

function emitCodexTransition(input: {
	activeModel: string;
	baseline: CodexVector;
	diagnostics: Map<string, MutableDiagnostic>;
	events: MutableUsageEvent[];
	firstObservedLine: number;
	increment: CodexVector;
	input: VersionedUsageExtractionInput;
	occurredAt: string | null;
	parentLineageId: string;
	qualityFlags: readonly string[];
	serviceTier: string;
	tokenSource: "provider_increment" | "cumulative_delta_fallback";
	total: CodexVector;
	transitionIndexes: Map<string, number>;
}): boolean {
	const transitionKey = `${codexVectorKey(input.baseline)}->${codexVectorKey(input.total)}`;
	const existingIndex = input.transitionIndexes.get(transitionKey);
	if (existingIndex !== undefined) {
		const existing = input.events[existingIndex];
		if (!existing) throw new Error("Codex transition index is out of range");
		existing.duplicateObservationCount += 1;
		addQualityFlag(existing, "indistinguishable_transition_collision");
		addDiagnostic(
			input.diagnostics,
			"codex_duplicate_transition",
			false,
			`line=${input.firstObservedLine};model=${input.activeModel || "<missing>"}`,
		);
		mergeCodexDuplicateMetadata(existing, input);
		return false;
	}

	const qualityFlags = [...input.qualityFlags];
	if (input.occurredAt === null) {
		qualityFlags.push("invalid_or_missing_timestamp");
		addDiagnostic(
			input.diagnostics,
			"codex_invalid_or_missing_timestamp",
			false,
		);
	}
	const modelQualityFlags = new Set(qualityFlags);
	const model = resolveUsageModel(
		input.activeModel,
		input.occurredAt,
		modelQualityFlags,
		input.input.source,
	);
	for (const flag of modelQualityFlags) {
		if (!qualityFlags.includes(flag)) qualityFlags.push(flag);
	}
	if (model.status === "missing") qualityFlags.push("missing_model");
	if (model.status === "unresolved") qualityFlags.push("unresolved_model");
	const lineageId = getCodexLineageId(input.input, input.baseline, input.total);
	const tokens = codexVectorToTokens(input.increment);
	const event: MutableUsageEvent = {
		organizationId: input.input.organizationId,
		userId: input.input.userId,
		sessionId: input.input.sessionId,
		source: input.input.source,
		eventId: getEventId(
			input.input,
			"transition",
			`${codexVectorKey(input.baseline)}\u0000${codexVectorKey(input.total)}`,
		),
		identityKind: "transition",
		occurredAt: input.occurredAt,
		usageDate: input.occurredAt?.slice(0, 10) ?? null,
		rawModel: model.rawModel,
		resolvedModel: model.resolvedModel,
		modelStatus: model.status,
		serviceTier: input.serviceTier,
		contextInputTokens: input.increment.inputTokens,
		...tokens,
		agentId: "main",
		lineageId,
		parentLineageId: input.parentLineageId,
		tokenSource: input.tokenSource,
		firstObservedLine: input.firstObservedLine,
		duplicateObservationCount: 0,
		qualityFlags: [...new Set(qualityFlags)].sort(compareBytes),
	};
	input.transitionIndexes.set(transitionKey, input.events.length);
	input.events.push(event);
	return true;
}

function mergeCodexDuplicateMetadata(
	existing: MutableUsageEvent,
	input: {
		activeModel: string;
		diagnostics: Map<string, MutableDiagnostic>;
		occurredAt: string | null;
		serviceTier: string;
	},
): void {
	if (existing.occurredAt === null && input.occurredAt !== null) {
		existing.occurredAt = input.occurredAt;
		existing.usageDate = input.occurredAt.slice(0, 10);
		removeQualityFlag(existing, "invalid_or_missing_timestamp");
	} else if (
		existing.occurredAt !== null &&
		input.occurredAt !== null &&
		existing.occurredAt !== input.occurredAt
	) {
		addQualityFlag(existing, "timestamp_conflict");
	}

	if (existing.serviceTier === "" && input.serviceTier !== "") {
		existing.serviceTier = input.serviceTier;
	} else if (
		existing.serviceTier !== "" &&
		input.serviceTier !== "" &&
		existing.serviceTier !== input.serviceTier
	) {
		addQualityFlag(existing, "service_tier_conflict");
	}

	if (input.activeModel === "") {
		refreshCodexModelResolution(existing);
		return;
	}
	if (existing.rawModel === "") {
		const modelQualityFlags = new Set(existing.qualityFlags);
		const model = resolveUsageModel(
			input.activeModel,
			existing.occurredAt,
			modelQualityFlags,
			existing.source,
		);
		for (const flag of modelQualityFlags) addQualityFlag(existing, flag);
		existing.rawModel = model.rawModel;
		existing.resolvedModel = model.resolvedModel;
		existing.modelStatus = model.status;
		removeQualityFlag(existing, "missing_model");
		if (model.status === "unresolved") {
			addQualityFlag(existing, "unresolved_model");
		}
		return;
	}
	if (normalizeModel(input.activeModel) !== normalizeModel(existing.rawModel)) {
		existing.rawModel = "";
		existing.resolvedModel = "";
		existing.modelStatus = "conflict";
		removeQualityFlag(existing, "unresolved_model");
		addQualityFlag(existing, "model_conflict");
		addDiagnostic(input.diagnostics, "codex_transition_model_conflict", false);
		return;
	}
	refreshCodexModelResolution(existing);
}

function refreshCodexModelResolution(existing: MutableUsageEvent): void {
	if (existing.rawModel === "" || existing.modelStatus === "conflict") return;
	const modelQualityFlags = new Set(existing.qualityFlags);
	const model = resolveUsageModel(
		existing.rawModel,
		existing.occurredAt,
		modelQualityFlags,
		existing.source,
	);
	for (const flag of modelQualityFlags) addQualityFlag(existing, flag);
	existing.resolvedModel = model.resolvedModel;
	existing.modelStatus = model.status;
	if (model.status === "resolved") {
		removeQualityFlag(existing, "unresolved_model");
	} else {
		addQualityFlag(existing, "unresolved_model");
	}
}

function recordCodexOutgoingTransition(
	outgoingTransitions: Map<string, Set<string>>,
	baselineKey: string,
	transitionKey: string,
): boolean {
	const transitions = outgoingTransitions.get(baselineKey) ?? new Set<string>();
	const previousSize = transitions.size;
	transitions.add(transitionKey);
	outgoingTransitions.set(baselineKey, transitions);
	return transitions.size > previousSize && transitions.size > 1;
}

function resolveCodexParent(
	baseline: CodexVector,
	knownTotals: Map<string, { lineages: string[]; vector: CodexVector }>,
	diagnostics: Map<string, MutableDiagnostic>,
): { inherited: boolean; lineageId: string; qualityFlags: readonly string[] } {
	if (isZeroVector(baseline)) {
		return { inherited: false, lineageId: "", qualityFlags: [] };
	}
	const known = knownTotals.get(codexVectorKey(baseline));
	if (known) {
		if (known.lineages.length === 0) {
			addDiagnostic(diagnostics, "codex_inherited_external_baseline", false);
			return {
				inherited: true,
				lineageId: "",
				qualityFlags: ["inherited_external_baseline_unverified"],
			};
		}
		const qualityFlags =
			known.lineages.length > 1 ? ["ambiguous_parent_lineage"] : [];
		return {
			inherited: false,
			lineageId: [...known.lineages].sort(compareBytes)[0] ?? "",
			qualityFlags,
		};
	}

	addDiagnostic(diagnostics, "codex_inherited_external_baseline", false);
	addKnownTotal(knownTotals, baseline);
	return {
		inherited: true,
		lineageId: "",
		qualityFlags: ["inherited_external_baseline_unverified"],
	};
}

function getCompatibleBaselines(
	total: CodexVector,
	knownTotals: ReadonlyMap<
		string,
		{ lineages: readonly string[]; vector: CodexVector }
	>,
): Array<{ lineages: readonly string[]; vector: CodexVector }> {
	return [...knownTotals.values()].filter((candidate) =>
		isVectorLessThanOrEqual(candidate.vector, total),
	);
}

function addKnownTotal(
	knownTotals: Map<string, { lineages: string[]; vector: CodexVector }>,
	vector: CodexVector,
	lineageId?: string,
): void {
	const key = codexVectorKey(vector);
	const existing = knownTotals.get(key);
	if (!existing) {
		knownTotals.set(key, {
			lineages: lineageId === undefined ? [] : [lineageId],
			vector,
		});
		return;
	}
	if (lineageId !== undefined && !existing.lineages.includes(lineageId)) {
		existing.lineages.push(lineageId);
	}
}

function addCodexFinalSnapshotDiagnostic(
	events: readonly UsageEvent[],
	lastTotal: CodexVector | undefined,
	shape: {
		hasInheritedBaseline: boolean;
		hasInterleaving: boolean;
		hasUnresolvedFallback: boolean;
	},
	diagnostics: Map<string, MutableDiagnostic>,
): void {
	if (!lastTotal) return;
	if (
		shape.hasInheritedBaseline ||
		shape.hasInterleaving ||
		shape.hasUnresolvedFallback ||
		events.some((event) => event.modelStatus === "conflict")
	) {
		addDiagnostic(diagnostics, "codex_final_snapshot_diagnostic_only", false);
		return;
	}
	const totals = sumCodexEventVectors(events);
	if (codexVectorKey(totals) !== codexVectorKey(lastTotal)) {
		addDiagnostic(diagnostics, "codex_single_lineage_final_mismatch", false);
	}
}

function readCodexVector(
	value: Record<string, unknown>,
	diagnosticCode: string,
	diagnostics: Map<string, MutableDiagnostic>,
): CodexVector | undefined {
	const inputTokens = readToken(value.input_tokens);
	const cacheReadInputTokens = readToken(value.cached_input_tokens);
	const outputTokens = readToken(value.output_tokens);
	if (
		inputTokens === undefined ||
		cacheReadInputTokens === undefined ||
		outputTokens === undefined ||
		cacheReadInputTokens > inputTokens
	) {
		addDiagnostic(diagnostics, diagnosticCode, true);
		return undefined;
	}
	const reasoningOutputTokens = readOptionalCodexReasoningToken(
		value,
		outputTokens,
		diagnostics,
	);
	return {
		inputTokens,
		cacheReadInputTokens,
		outputTokens,
		reasoningOutputTokens,
	};
}

function readOptionalCodexReasoningToken(
	value: Record<string, unknown>,
	outputTokens: number,
	diagnostics: Map<string, MutableDiagnostic>,
): number {
	if (!("reasoning_output_tokens" in value)) return 0;
	const reasoningOutputTokens = readToken(value.reasoning_output_tokens);
	if (
		reasoningOutputTokens === undefined ||
		reasoningOutputTokens > outputTokens
	) {
		addDiagnostic(
			diagnostics,
			"codex_invalid_optional_reasoning_output_tokens",
			false,
		);
		return 0;
	}
	return reasoningOutputTokens;
}

function codexVectorToTokens(vector: CodexVector): UsageEventTokens {
	return {
		uncachedInputTokens: vector.inputTokens - vector.cacheReadInputTokens,
		cacheReadInputTokens: vector.cacheReadInputTokens,
		cacheWrite5mInputTokens: 0,
		cacheWrite1hInputTokens: 0,
		outputTokens: vector.outputTokens,
		reasoningOutputTokens: vector.reasoningOutputTokens,
	};
}

function sumCodexEventVectors(events: readonly UsageEvent[]): CodexVector {
	return events.reduce<CodexVector>(
		(total, event) => ({
			inputTokens:
				total.inputTokens +
				event.uncachedInputTokens +
				event.cacheReadInputTokens,
			cacheReadInputTokens:
				total.cacheReadInputTokens + event.cacheReadInputTokens,
			outputTokens: total.outputTokens + event.outputTokens,
			reasoningOutputTokens:
				total.reasoningOutputTokens + event.reasoningOutputTokens,
		}),
		{
			inputTokens: 0,
			cacheReadInputTokens: 0,
			outputTokens: 0,
			reasoningOutputTokens: 0,
		},
	);
}

function getCodexLineageId(
	input: VersionedUsageExtractionInput,
	baseline: CodexVector,
	total: CodexVector,
): string {
	return hashParts([
		getUsageIdentityPrefix("codex-lineage", input.versions.identityVersion),
		input.sessionId,
		codexVectorKey(baseline),
		codexVectorKey(total),
	]);
}

function codexVectorKey(vector: CodexVector): string {
	return [
		vector.inputTokens,
		vector.cacheReadInputTokens,
		vector.outputTokens,
		vector.reasoningOutputTokens,
	].join(":");
}

function subtractCodexVectors(
	left: CodexVector,
	right: CodexVector,
): CodexVector {
	return {
		inputTokens: left.inputTokens - right.inputTokens,
		cacheReadInputTokens:
			left.cacheReadInputTokens - right.cacheReadInputTokens,
		outputTokens: left.outputTokens - right.outputTokens,
		reasoningOutputTokens:
			left.reasoningOutputTokens - right.reasoningOutputTokens,
	};
}

function isVectorLessThanOrEqual(
	left: CodexVector,
	right: CodexVector,
): boolean {
	return (
		left.inputTokens <= right.inputTokens &&
		left.cacheReadInputTokens <= right.cacheReadInputTokens &&
		left.outputTokens <= right.outputTokens &&
		left.reasoningOutputTokens <= right.reasoningOutputTokens
	);
}

function isZeroVector(vector: CodexVector): boolean {
	return (
		vector.inputTokens === 0 &&
		vector.cacheReadInputTokens === 0 &&
		vector.outputTokens === 0 &&
		vector.reasoningOutputTokens === 0
	);
}

function visitJsonLines(
	content: string,
	diagnostics: Map<string, MutableDiagnostic>,
	visitor: (line: JsonLine) => unknown,
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
				addDiagnostic(
					diagnostics,
					"malformed_json_line",
					isPotentiallyUsageBearingLine(line),
				);
				parsed = undefined;
			}
			const value = readRecord(parsed);
			if (value) {
				if (visitor({ line, lineNumber, value }) === false) return;
			} else if (parsed !== undefined) {
				addDiagnostic(diagnostics, "non_object_json_line", false);
			}
		}
		if (newline === -1) break;
		start = newline + 1;
	}
}

const USAGE_BEARING_JSON_KEY =
	/"(?:usage|token_count|total_token_usage|last_token_usage|input_tokens|output_tokens|cached_input_tokens|cache_read_input_tokens|cache_creation_input_tokens)"\s*:/u;
const CODEX_TOKEN_COUNT_TYPE = /"type"\s*:\s*"token_count"/u;

function isPotentiallyUsageBearingLine(line: string): boolean {
	return USAGE_BEARING_JSON_KEY.test(line) || CODEX_TOKEN_COUNT_TYPE.test(line);
}

function hasRequiredClaudeTokens(usage: Record<string, unknown>): boolean {
	return (
		readToken(usage.input_tokens) !== undefined &&
		readToken(usage.output_tokens) !== undefined
	);
}

function hasRequiredCodexTokens(usage: Record<string, unknown>): boolean {
	return (
		readToken(usage.input_tokens) !== undefined &&
		readToken(usage.cached_input_tokens) !== undefined &&
		readToken(usage.output_tokens) !== undefined
	);
}

function isPotentiallyBillableTokenRecord(
	usage: Record<string, unknown>,
): boolean {
	const tokenKeys = [
		"input_tokens",
		"cached_input_tokens",
		"cache_read_input_tokens",
		"cache_creation_input_tokens",
		"output_tokens",
		"reasoning_output_tokens",
	] as const;
	return tokenKeys.some((key) => {
		if (!(key in usage) || usage[key] === null) return false;
		const token = readToken(usage[key]);
		return token === undefined || token > 0;
	});
}

function getEventId(
	input: VersionedUsageExtractionInput,
	identityKind: string,
	identityValue: string,
): string {
	return hashParts([
		getUsageIdentityPrefix("usage-event", input.versions.identityVersion),
		input.source,
		input.organizationId,
		input.userId,
		input.sessionId,
		identityKind,
		identityValue,
	]);
}

function checksumEvents(events: readonly UsageEvent[]): string {
	return sha256(JSON.stringify(getUsageAttestationPayload(events)));
}

function compareBytes(left: string, right: string): number {
	return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function addDiagnostic(
	diagnostics: Map<string, MutableDiagnostic>,
	code: string,
	fatal = false,
	detail?: string,
): void {
	const current = diagnostics.get(code);
	if (current) {
		current.count += 1;
		current.fatal ||= fatal;
		if (detail) addDiagnosticDetail(current, detail);
		return;
	}
	const diagnostic: MutableDiagnostic = {
		count: 1,
		details: new Set<string>(),
		detailsOverflowed: false,
		fatal,
	};
	if (detail) addDiagnosticDetail(diagnostic, detail);
	diagnostics.set(code, diagnostic);
}

function addDiagnosticDetail(
	diagnostic: MutableDiagnostic,
	detail: string,
): void {
	const boundedDetail = detail.slice(0, MAX_DIAGNOSTIC_DETAIL_CHARACTERS);
	if (diagnostic.details.has(boundedDetail) || diagnostic.detailsOverflowed) {
		return;
	}
	if (diagnostic.details.size < MAX_DIAGNOSTIC_DETAILS_PER_CODE) {
		diagnostic.details.add(boundedDetail);
		return;
	}
	diagnostic.detailsOverflowed = true;
}

function finalizeDiagnostics(
	diagnostics: ReadonlyMap<string, MutableDiagnostic>,
): readonly UsageExtractionDiagnostic[] {
	return [...diagnostics.entries()]
		.sort(([left], [right]) => compareBytes(left, right))
		.map(([code, diagnostic]) => ({
			code,
			count: diagnostic.count,
			...(diagnostic.details.size > 0 || diagnostic.detailsOverflowed
				? {
						details: [
							...diagnostic.details,
							...(diagnostic.detailsOverflowed
								? [DIAGNOSTIC_DETAILS_OVERFLOW]
								: []),
						].sort(compareBytes),
					}
				: {}),
			fatal: diagnostic.fatal,
		}));
}

function addQualityFlag(event: MutableUsageEvent, flag: string): void {
	if (!event.qualityFlags.includes(flag)) {
		event.qualityFlags.push(flag);
		event.qualityFlags.sort(compareBytes);
	}
}

function removeQualityFlag(event: MutableUsageEvent, flag: string): void {
	const index = event.qualityFlags.indexOf(flag);
	if (index !== -1) event.qualityFlags.splice(index, 1);
}

function resolveUsageModel(
	rawModel: string,
	occurredAt: string | null,
	qualityFlags: Set<string>,
	source: UsageEventSource,
): {
	rawModel: string;
	resolvedModel: string;
	status: UsageEventModelStatus;
} {
	if (rawModel === "") {
		return { rawModel: "", resolvedModel: "", status: "missing" };
	}
	if (occurredAt === null) {
		qualityFlags.add("unresolved_model");
		return { rawModel, resolvedModel: "", status: "unresolved" };
	}
	const pricing = resolveModelPricing(rawModel, {
		at: occurredAt,
		contextBand: "base",
	});
	if (!pricing) {
		qualityFlags.add("unresolved_model");
		return { rawModel, resolvedModel: "", status: "unresolved" };
	}
	const expectedProvider = source === "claude_code" ? "anthropic" : "openai";
	if (pricing.provider !== expectedProvider) {
		qualityFlags.add("provider_model_mismatch");
		return { rawModel, resolvedModel: "", status: "unresolved" };
	}
	return {
		rawModel,
		resolvedModel: pricing.model,
		status: "resolved",
	};
}

function maxField(
	group: readonly ClaudeCandidate[],
	field:
		| "uncachedInputTokens"
		| "cacheReadInputTokens"
		| "cacheWrite5mInputTokens"
		| "cacheWrite1hInputTokens"
		| "outputTokens",
): number {
	return Math.max(...group.map((candidate) => candidate[field]));
}

function uniqueNonEmpty(values: readonly string[]): string[] {
	return [...new Set(values.filter((value) => value !== ""))];
}

function uniqueModelsCaseInsensitive(values: readonly string[]): string[] {
	const models = new Map<string, string>();
	for (const value of values) {
		if (value === "") continue;
		const normalized = normalizeModel(value);
		if (!models.has(normalized)) models.set(normalized, value);
	}
	return [...models.values()];
}

const ALLOWED_SERVICE_TIERS: Readonly<
	Record<UsageEventSource, ReadonlySet<string>>
> = {
	claude_code: new Set(["batch", "priority", "standard"]),
	codex: new Set(["auto", "default", "flex", "priority", "scale"]),
};

function normalizeServiceTier(
	value: unknown,
	source: UsageEventSource,
	qualityFlags: string[],
	diagnostics: Map<string, MutableDiagnostic>,
): string {
	const tier = readNonEmptyString(value)?.toLowerCase() ?? "";
	if (tier === "" || ALLOWED_SERVICE_TIERS[source].has(tier)) return tier;
	qualityFlags.push("unrecognized_service_tier");
	addDiagnostic(
		diagnostics,
		`${source}_unrecognized_service_tier`,
		false,
		tier,
	);
	return "";
}

function readRequiredToken(
	value: unknown,
	diagnosticCode: string,
	diagnostics: Map<string, MutableDiagnostic>,
): number | undefined {
	const token = readToken(value);
	if (token === undefined) addDiagnostic(diagnostics, diagnosticCode, true);
	return token;
}

function readOptionalToken(
	record: Record<string, unknown> | undefined,
	key: string,
	diagnosticCode: string,
	diagnostics: Map<string, MutableDiagnostic>,
): number | undefined {
	if (!record || !(key in record) || record[key] === null) return 0;
	return readRequiredToken(record[key], diagnosticCode, diagnostics);
}

function readOptionalRecord(
	record: Record<string, unknown>,
	key: string,
	diagnosticCode: string,
	diagnostics: Map<string, MutableDiagnostic>,
): Record<string, unknown> | undefined {
	if (!(key in record) || record[key] === null) return undefined;
	const nested = readRecord(record[key]);
	if (!nested) addDiagnostic(diagnostics, diagnosticCode, true);
	return nested;
}

function readToken(value: unknown): number | undefined {
	return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
		? value
		: undefined;
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
	return trimmed === "" ? undefined : trimmed;
}

function readTimestamp(value: unknown): string | null {
	if (typeof value !== "string") return null;
	if (!ISO_8601_WITH_TIMEZONE.test(value)) return null;
	const timestamp = Date.parse(value);
	return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

const ISO_8601_WITH_TIMEZONE =
	/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/u;

function normalizeModel(model: string): string {
	return model.trim().toLowerCase();
}

function hashParts(parts: readonly string[]): string {
	const hash = createHash("sha256");
	for (const part of parts) {
		hash.update(part);
		hash.update("\u0000");
	}
	return hash.digest("hex");
}

function sha256(value: string): string {
	return createHash("sha256").update(value).digest("hex");
}
