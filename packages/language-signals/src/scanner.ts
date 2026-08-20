import { LANGUAGE_SIGNAL_RULES } from "./rules.js";
import type {
	BuiltInLanguageSignalCategory,
	LanguageSignalMatch,
	ModelLanguageSignalMatch,
} from "./types.js";

interface CompiledSurface {
	readonly category: BuiltInLanguageSignalCategory;
	readonly ruleId: string;
	readonly source: string;
	readonly surfaceLength: number;
	readonly categoryPrecedence: number;
	readonly ruleOrder: number;
	readonly surfaceOrder: number;
}

const CATEGORY_PRECEDENCE: Readonly<
	Record<BuiltInLanguageSignalCategory, number>
> = {
	negative: 0,
	swear: 1,
	apology: 2,
	positive: 3,
};

const NEGATIVE_QUESTION_RUN: CompiledSurface = {
	category: "negative",
	ruleId: "negative.question-run",
	source: "\\?{2,}",
	surfaceLength: 2,
	categoryPrecedence: CATEGORY_PRECEDENCE.negative,
	ruleOrder: -1,
	surfaceOrder: 0,
};

export const MAX_LANGUAGE_SIGNAL_MATCHES = 10_000;

const COMPILED_SURFACES = LANGUAGE_SIGNAL_RULES.flatMap((rule, ruleOrder) =>
	rule.surfaces.map((surface, surfaceOrder) => ({
		category: rule.category,
		ruleId: rule.ruleId,
		source: compileSurfaceSource(surface),
		surfaceLength: surface.length,
		categoryPrecedence: CATEGORY_PRECEDENCE[rule.category],
		ruleOrder,
		surfaceOrder,
	})),
).sort(compareCompiledSurfaces);

const LANGUAGE_SIGNAL_PATTERN = new RegExp(
	`(${NEGATIVE_QUESTION_RUN.source})|(?<![\\p{L}\\p{N}])(?:${COMPILED_SURFACES.map(({ source }) => `(${source})`).join("|")})(?![\\p{L}\\p{N}])`,
	"giu",
);

const ADJACENT_POSITIVE_NEGATION_PATTERN =
	/(?:do\s+not|don['’]?t|does\s+not|doesn['’]?t|did\s+not|didn['’]?t|not)\s+$/iu;
const SYSTEM_INSTRUCTION_BLOCK_PATTERN =
	/<system_instruction>[\s\S]*?<\/system_instruction>/giu;

export function scanLanguageSignals(
	text: string,
): ReadonlyArray<LanguageSignalMatch> {
	const matches: LanguageSignalMatch[] = [];

	for (const match of text.matchAll(LANGUAGE_SIGNAL_PATTERN)) {
		const compiledSurface = findCompiledSurface(match);
		if (compiledSurface !== undefined) {
			matches.push(buildLanguageSignalMatch(text, match, compiledSurface));
		}

		if (matches.length >= MAX_LANGUAGE_SIGNAL_MATCHES) {
			break;
		}
	}

	return matches;
}

export function scanMemberLanguageSignals(
	text: string,
): ReadonlyArray<LanguageSignalMatch> {
	const matches: LanguageSignalMatch[] = [];
	let cursor = 0;
	for (const block of text.matchAll(SYSTEM_INSTRUCTION_BLOCK_PATTERN)) {
		appendSegmentMatches(matches, text.slice(cursor, block.index), cursor);
		cursor = block.index + block[0].length;
		if (matches.length >= MAX_LANGUAGE_SIGNAL_MATCHES) {
			return matches.slice(0, MAX_LANGUAGE_SIGNAL_MATCHES);
		}
	}
	appendSegmentMatches(matches, text.slice(cursor), cursor);
	return matches.slice(0, MAX_LANGUAGE_SIGNAL_MATCHES);
}

export function stripSystemInstructionBlocks(text: string) {
	return text.replace(SYSTEM_INSTRUCTION_BLOCK_PATTERN, "");
}

function appendSegmentMatches(
	matches: LanguageSignalMatch[],
	segment: string,
	offset: number,
) {
	for (const match of scanLanguageSignals(segment)) {
		matches.push({
			...match,
			end: match.end + offset,
			start: match.start + offset,
		});
		if (matches.length >= MAX_LANGUAGE_SIGNAL_MATCHES) {
			return;
		}
	}
}

function buildLanguageSignalMatch(
	text: string,
	match: RegExpExecArray,
	compiledSurface: CompiledSurface,
): LanguageSignalMatch {
	const negation =
		compiledSurface.category === "positive"
			? text
					.slice(0, match.index)
					.match(ADJACENT_POSITIVE_NEGATION_PATTERN)?.[0]
			: undefined;
	const start = match.index - (negation?.length ?? 0);
	const end = match.index + match[0].length;

	return {
		category: negation === undefined ? compiledSurface.category : "negative",
		ruleId:
			negation === undefined
				? compiledSurface.ruleId
				: "negative.negated-positive",
		matchedText: text.slice(start, end),
		start,
		end,
	};
}

export function scanModelLanguageSignals(
	text: string,
): ReadonlyArray<ModelLanguageSignalMatch> {
	return scanLanguageSignals(text).filter(
		(match): match is ModelLanguageSignalMatch => match.category !== "positive",
	);
}

function findCompiledSurface(
	match: RegExpExecArray,
): CompiledSurface | undefined {
	if (match[1] !== undefined) {
		return NEGATIVE_QUESTION_RUN;
	}

	for (let captureIndex = 2; captureIndex < match.length; captureIndex += 1) {
		if (match[captureIndex] !== undefined) {
			return COMPILED_SURFACES[captureIndex - 2];
		}
	}

	return undefined;
}

function compareCompiledSurfaces(
	left: CompiledSurface,
	right: CompiledSurface,
): number {
	return (
		right.surfaceLength - left.surfaceLength ||
		left.categoryPrecedence - right.categoryPrecedence ||
		left.ruleOrder - right.ruleOrder ||
		left.surfaceOrder - right.surfaceOrder
	);
}

function compileSurfaceSource(surface: string): string {
	let source = "";
	let previousWasWhitespace = false;

	for (const character of surface) {
		if (/\s/u.test(character)) {
			if (!previousWasWhitespace) {
				source += "\\s+";
			}
			previousWasWhitespace = true;
			continue;
		}

		previousWasWhitespace = false;
		if (character === "'" || character === "’") {
			source += "['’]";
			continue;
		}

		source += character.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	}

	return source;
}
