import { GENERATED_SECRET_RULES } from "./generated-rules.js";
import type {
	FilterableSubagent,
	RedactionBudgetAnomaly,
	RedactionCounts,
	SecretFilterResult,
	SecretRule,
	SessionTextFilterResult,
} from "./types.js";

export interface CompiledSecretRule {
	readonly definition: SecretRule;
	readonly matcher: RegExp;
	readonly allowlistMatchers: readonly RegExp[];
}

const COMPILED_SECRET_RULES = GENERATED_SECRET_RULES.map(compileSecretRule);
const UTF8_ENCODER = new TextEncoder();

export const FILTER_VERSION = 4;
export const MAX_FILTER_PASSES = 4;
export const MAX_REDACTION_SPAN_BYTES = 8192;
export const MAX_REDACTION_RATIO = 0.2;
export const OVERLONG_REDACTION_RULE_ID = "overlong-truncated";
export const FILTERED_TRANSCRIPT_PATHS: readonly string[] = [
	"content",
	"subagents[].content",
];

export function filterKnownSecrets(text: string): SecretFilterResult {
	let filteredText = text;
	let counts: RedactionCounts = {};
	let redactedBytes = 0;

	// Redacting one secret can expose another. Rules are folded in array order
	// over already-filtered text, and eight of them are anchored on a leading
	// \b. When two secrets are concatenated with no delimiter, the leading one
	// has no word boundary to match against -- until a later rule replaces its
	// neighbour with a marker whose brackets supply that boundary. By then the
	// earlier rule has already run.
	//
	// Re-running until a pass redacts nothing makes one call equivalent to
	// repeated calls. That matters because the number of passes a transcript
	// gets is not fixed: a current CLI filters client-side and the API filters
	// again, but an older CLI uploads raw text and gets exactly one server-side
	// pass. Without this loop those two paths store different bytes.
	for (let pass = 0; pass < MAX_FILTER_PASSES; pass += 1) {
		let passCounts: RedactionCounts = {};
		let passBytes = 0;

		for (const rule of COMPILED_SECRET_RULES) {
			const result = applyCompiledSecretRule(filteredText, rule);
			filteredText = result.text;
			passCounts = mergeRedactionCounts(passCounts, result.counts);
			passBytes += result.redactedBytes;
		}

		// A clean pass means the text is a fixpoint; nothing was rewritten, so
		// there is nothing to merge.
		if (getRedactionCount(passCounts) === 0) {
			break;
		}

		// Markers never re-match, so each pass redacts a disjoint set of the
		// original bytes and these totals cannot double-count.
		counts = mergeRedactionCounts(counts, passCounts);
		redactedBytes += passBytes;
	}

	return { text: filteredText, counts, redactedBytes };
}

export function filterSessionTextFields<
	TSubagent extends FilterableSubagent,
>(fields: {
	readonly content: string;
	readonly subagents: readonly TSubagent[] | undefined;
}): SessionTextFilterResult<TSubagent> {
	const contentResult = filterKnownSecrets(fields.content);
	let counts = contentResult.counts;
	let redactedBytes = contentResult.redactedBytes;
	const subagents = fields.subagents?.map((subagent) => {
		const result = filterKnownSecrets(subagent.content);
		counts = mergeRedactionCounts(counts, result.counts);
		redactedBytes += result.redactedBytes;
		return { ...subagent, content: result.text };
	});

	return {
		content: contentResult.text,
		subagents,
		counts,
		redactedBytes,
	};
}

export function mergeRedactionCounts(
	...countSets: readonly RedactionCounts[]
): RedactionCounts {
	const merged: Record<string, number> = {};
	for (const counts of countSets) {
		for (const [ruleId, count] of Object.entries(counts)) {
			merged[ruleId] = (merged[ruleId] ?? 0) + count;
		}
	}
	return merged;
}

export function getRedactionCount(counts: RedactionCounts): number {
	return Object.values(counts).reduce((total, count) => total + count, 0);
}

export function getUtf8ByteLength(text: string): number {
	return UTF8_ENCODER.encode(text).byteLength;
}

export function getRedactionBudgetAnomaly(
	redactedBytes: number,
	inputBytes: number,
	counts: RedactionCounts,
): RedactionBudgetAnomaly | null {
	if (
		inputBytes <= 0 ||
		redactedBytes <= 0 ||
		redactedBytes <= inputBytes * MAX_REDACTION_RATIO
	) {
		return null;
	}

	return {
		inputBytes,
		redactedBytes,
		ruleIds: Object.entries(counts)
			.filter(([, count]) => count > 0)
			.map(([ruleId]) => ruleId)
			.sort(),
	};
}

export function compileSecretRule(rule: SecretRule): CompiledSecretRule {
	const matcherFlags = rule.caseInsensitive ? "dgiu" : "dgu";
	const allowlistFlags = rule.caseInsensitive ? "iu" : "u";
	return {
		definition: rule,
		matcher: new RegExp(rule.regexSource, matcherFlags),
		allowlistMatchers: rule.allowlistRegexSources.map(
			(source) => new RegExp(source, allowlistFlags),
		),
	};
}

export function applyCompiledSecretRule(
	text: string,
	rule: CompiledSecretRule,
): SecretFilterResult {
	const pieces: string[] = [];
	let count = 0;
	let truncationCount = 0;
	let redactedBytes = 0;
	let cursor = 0;

	rule.matcher.lastIndex = 0;
	let match = rule.matcher.exec(text);
	while (match !== null) {
		const secret = match[rule.definition.secretGroup];
		const secretSpan = match.indices?.[rule.definition.secretGroup];
		if (secret === undefined || secretSpan === undefined) {
			advanceAfterMatch(rule.matcher, match);
			match = rule.matcher.exec(text);
			continue;
		}

		if (isAllowlisted(secret, rule)) {
			advanceAfterMatch(rule.matcher, match);
			match = rule.matcher.exec(text);
			continue;
		}

		const [secretStart, secretEnd] = secretSpan;
		const boundedSpan = getBoundedRedactionSpan(text, secretStart, secretEnd);
		pieces.push(
			text.slice(cursor, secretStart),
			`[REDACTED:${rule.definition.id}]`,
		);
		cursor = boundedSpan.end;
		count += 1;
		redactedBytes += boundedSpan.bytes;

		if (boundedSpan.truncated) {
			truncationCount += 1;
		}

		// Resume from the bytes actually redacted. Resuming from match[0]'s end
		// would skip any real secret inside the preserved tail of an overlong match.
		rule.matcher.lastIndex = boundedSpan.end;
		match = rule.matcher.exec(text);
	}
	rule.matcher.lastIndex = 0;

	if (count === 0) {
		return { text, counts: {}, redactedBytes: 0 };
	}

	pieces.push(text.slice(cursor));
	const counts: Record<string, number> = {
		[rule.definition.id]: count,
	};
	if (truncationCount > 0) {
		counts[OVERLONG_REDACTION_RULE_ID] = truncationCount;
	}
	return {
		text: pieces.join(""),
		counts,
		redactedBytes,
	};
}

function advanceAfterMatch(matcher: RegExp, match: RegExpExecArray): void {
	if (matcher.lastIndex === match.index) {
		matcher.lastIndex += 1;
	}
}

function getBoundedRedactionSpan(
	text: string,
	start: number,
	end: number,
): {
	readonly bytes: number;
	readonly end: number;
	readonly truncated: boolean;
} {
	const secret = text.slice(start, end);
	const secretBytes = getUtf8ByteLength(secret);
	if (secretBytes <= MAX_REDACTION_SPAN_BYTES) {
		return { bytes: secretBytes, end, truncated: false };
	}

	let bytes = 0;
	let boundedEnd = start;
	for (const character of secret) {
		const characterBytes = getUtf8ByteLength(character);
		if (bytes + characterBytes > MAX_REDACTION_SPAN_BYTES) {
			break;
		}
		bytes += characterBytes;
		boundedEnd += character.length;
	}

	return { bytes, end: boundedEnd, truncated: true };
}

function isAllowlisted(secret: string, rule: CompiledSecretRule): boolean {
	return rule.allowlistMatchers.some((matcher) => matcher.test(secret));
}
