import { GENERATED_SECRET_RULES } from "./generated-rules.js";
import type {
	FilterableSubagent,
	RedactionCounts,
	SecretFilterResult,
	SecretRule,
	SessionTextFilterResult,
} from "./types.js";

export const FILTER_VERSION = 1;
export const FILTERED_TRANSCRIPT_PATHS: readonly string[] = [
	"content",
	"subagents[].content",
];

export function filterKnownSecrets(text: string): SecretFilterResult {
	let filteredText = text;
	let counts: RedactionCounts = {};

	for (const rule of GENERATED_SECRET_RULES) {
		const result = applyRule(filteredText, rule);
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

function applyRule(text: string, rule: SecretRule): SecretFilterResult {
	const flags = rule.caseInsensitive ? "giu" : "gu";
	const regex = new RegExp(rule.regexSource, flags);
	const pieces: string[] = [];
	let count = 0;
	let cursor = 0;

	for (const match of text.matchAll(regex)) {
		const fullMatch = match[0];
		const secret = match[rule.secretGroup];
		if (match.index === undefined || secret === undefined) {
			continue;
		}

		const secretOffset = rule.secretGroup === 0 ? 0 : fullMatch.indexOf(secret);
		if (secretOffset < 0 || isAllowlisted(secret, rule)) {
			continue;
		}

		const secretStart = match.index + secretOffset;
		const secretEnd = secretStart + secret.length;
		pieces.push(text.slice(cursor, secretStart), `[REDACTED:${rule.id}]`);
		cursor = secretEnd;
		count += 1;
	}

	if (count === 0) {
		return { text, counts: {} };
	}

	pieces.push(text.slice(cursor));
	return { text: pieces.join(""), counts: { [rule.id]: count } };
}

function isAllowlisted(secret: string, rule: SecretRule): boolean {
	const flags = rule.caseInsensitive ? "iu" : "u";
	return rule.allowlistRegexSources.some((source) =>
		new RegExp(source, flags).test(secret),
	);
}
