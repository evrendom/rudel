export {
	assertFilteredJsonValidity,
	FILTER_VERSION,
	FILTERED_TRANSCRIPT_PATHS,
	filterKnownSecrets,
	filterSessionTextFields,
	getRedactionBudgetAnomaly,
	getRedactionCount,
	getUtf8ByteLength,
	MAX_FILTER_PASSES,
	MAX_REDACTION_RATIO,
	mergeRedactionCounts,
	OVERLONG_MATCH_THRESHOLD_BYTES,
	OVERLONG_REDACTION_RULE_ID,
	SECRET_FILTER_CONVERGENCE_MESSAGE,
	SecretFilterConvergenceError,
	SecretFilterJsonIntegrityError,
} from "./filter.js";
export { GITLEAKS_VERSION } from "./generated-rules.js";
export type {
	RedactionBudgetAnomaly,
	RedactionCounts,
	SecretFilterResult,
	SessionTextFilterResult,
} from "./types.js";
