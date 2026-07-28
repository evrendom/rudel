export {
	FILTER_VERSION,
	FILTERED_TRANSCRIPT_PATHS,
	filterKnownSecrets,
	filterSessionTextFields,
	getRedactionBudgetAnomaly,
	getRedactionCount,
	getUtf8ByteLength,
	MAX_FILTER_PASSES,
	MAX_REDACTION_RATIO,
	MAX_REDACTION_SPAN_BYTES,
	mergeRedactionCounts,
	OVERLONG_REDACTION_RULE_ID,
} from "./filter.js";
export { GITLEAKS_VERSION } from "./generated-rules.js";
export type {
	RedactionBudgetAnomaly,
	RedactionCounts,
	SecretFilterResult,
	SessionTextFilterResult,
} from "./types.js";
