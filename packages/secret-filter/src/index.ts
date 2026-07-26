export {
	FILTER_VERSION,
	FILTERED_TRANSCRIPT_PATHS,
	filterKnownSecrets,
	filterSessionTextFields,
	getRedactionCount,
	mergeRedactionCounts,
} from "./filter.js";
export { GITLEAKS_VERSION } from "./generated-rules.js";
export type {
	RedactionCounts,
	SecretFilterResult,
	SessionTextFilterResult,
} from "./types.js";
