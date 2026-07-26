import { GENERATED_SECRET_RULES } from "./generated-rules.js";
import type {
	FilterableSubagent,
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

export const FILTER_VERSION = 1;
export const FILTERED_TRANSCRIPT_PATHS: readonly string[] = [
	"content",
	"subagents[].content",
];

export function filterKnownSecrets(text: string): SecretFilterResult {
	let filteredText = text;
	let counts: RedactionCounts = {};

	for (const rule of COMPILED_SECRET_RULES) {
		const result = applyCompiledSecretRule(filteredText, rule);
		filteredText = result.text;
		counts = mergeRedactionCounts(counts, result.counts);
	}

	return { text: filteredText, counts };
}

export function filterSessionTextFields<
	TSubagent extends FilterableSubagent,
>(fields: {
	readonly content: string;
	readonly subagents: readonly TSubagent[] | undefined;
}): SessionTextFilterResult<TSubagent> {
	const contentResult = filterKnownSecrets(fields.content);
	let counts = contentResult.counts;
	const subagents = fields.subagents?.map((subagent) => {
		const result = filterKnownSecrets(subagent.content);
		counts = mergeRedactionCounts(counts, result.counts);
		return { ...subagent, content: result.text };
	});

	return {
		content: contentResult.text,
		subagents,
		counts,
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
	let cursor = 0;

	for (const match of text.matchAll(rule.matcher)) {
		const secret = match[rule.definition.secretGroup];
		const secretSpan = match.indices?.[rule.definition.secretGroup];
		if (secret === undefined || secretSpan === undefined) {
			continue;
		}

		if (isAllowlisted(secret, rule)) {
			continue;
		}

		const [secretStart, secretEnd] = secretSpan;
		pieces.push(
			text.slice(cursor, secretStart),
			`[REDACTED:${rule.definition.id}]`,
		);
		cursor = secretEnd;
		count += 1;
	}

	if (count === 0) {
		return { text, counts: {} };
	}

	pieces.push(text.slice(cursor));
	return {
		text: pieces.join(""),
		counts: { [rule.definition.id]: count },
	};
}

function isAllowlisted(secret: string, rule: CompiledSecretRule): boolean {
	return rule.allowlistMatchers.some((matcher) => matcher.test(secret));
}
