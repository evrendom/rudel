import { MODEL_RATE_CARD_VERSION } from "@rudel/api-routes/model-pricing";

export const USAGE_EVENT_IDENTITY_VERSION = 1;
export const USAGE_EVENT_EXTRACTION_VERSION = 4;
export const USAGE_EVENT_MODEL_RATE_CARD_VERSION = MODEL_RATE_CARD_VERSION;

export type UsageEventSource = "claude_code" | "codex";

export type UsageEventModelStatus =
	| "resolved"
	| "unresolved"
	| "missing"
	| "synthetic"
	| "conflict";

export type UsageEventTokenSource =
	| "provider_increment"
	| "cumulative_delta_fallback";

export interface UsageEventTokens {
	uncachedInputTokens: number;
	cacheReadInputTokens: number;
	cacheWrite5mInputTokens: number;
	cacheWrite1hInputTokens: number;
	outputTokens: number;
	reasoningOutputTokens: number;
}

export interface UsageEvent extends UsageEventTokens {
	organizationId: string;
	userId: string;
	sessionId: string;
	source: UsageEventSource;
	eventId: string;
	identityKind: string;
	occurredAt: string | null;
	usageDate: string | null;
	rawModel: string;
	resolvedModel: string;
	modelStatus: UsageEventModelStatus;
	serviceTier: string;
	modelProvider: string;
	inferenceSpeed: string;
	inferenceGeo: string;
	contextInputTokens: number;
	/** "main" is the primary transcript; a literal subagent ID "main" is flagged as ambiguous. */
	agentId: string;
	lineageId: string;
	parentLineageId: string;
	tokenSource: UsageEventTokenSource;
	firstObservedLine: number;
	duplicateObservationCount: number;
	qualityFlags: readonly string[];
}

export interface UsageExtractionDiagnostic {
	code: string;
	count: number;
	details?: readonly string[];
	fatal: boolean;
}

export interface UsageExtractionReceipt {
	complete: boolean;
	extractionVersion: number;
	eventIdentityVersion: number;
	modelRateCardVersion: string;
	eventCount: number;
	checksum: string;
}

export interface UsageExtractionInput {
	organizationId: string;
	userId: string;
	sessionId: string;
	source: UsageEventSource;
	content: string;
	subagents: Readonly<Record<string, string>>;
}

export type UsageExtractionResult =
	| {
			status: "complete";
			events: readonly UsageEvent[];
			diagnostics: readonly UsageExtractionDiagnostic[];
			receipt: UsageExtractionReceipt;
	  }
	| {
			status: "incomplete";
			events: readonly [];
			diagnostics: readonly UsageExtractionDiagnostic[];
			receipt: UsageExtractionReceipt;
	  };
