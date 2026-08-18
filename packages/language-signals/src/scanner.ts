import { LANGUAGE_SIGNAL_RULES } from "./rules.js";
import type { LanguageSignalCategory, LanguageSignalMatch } from "./types.js";

interface CompiledSurface {
	readonly category: LanguageSignalCategory;
	readonly ruleId: string;
	readonly source: string;
	readonly surfaceLength: number;
	readonly categoryPrecedence: number;
	readonly ruleOrder: number;
	readonly surfaceOrder: number;
}

const CATEGORY_PRECEDENCE: Readonly<Record<LanguageSignalCategory, number>> = {
	swear: 0,
	apology: 1,
	positive: 2,
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
	`(?<![\\p{L}\\p{N}])(?:${COMPILED_SURFACES.map(({ source }) => `(${source})`).join("|")})(?![\\p{L}\\p{N}])`,
	"giu",
);

export function scanLanguageSignals(
	text: string,
): ReadonlyArray<LanguageSignalMatch> {
	const matches: LanguageSignalMatch[] = [];

	for (const match of text.matchAll(LANGUAGE_SIGNAL_PATTERN)) {
		const compiledSurface = findCompiledSurface(match);
		if (compiledSurface !== undefined) {
			matches.push({
				category: compiledSurface.category,
				ruleId: compiledSurface.ruleId,
				matchedText: match[0],
				start: match.index,
				end: match.index + match[0].length,
			});
		}

		if (matches.length >= MAX_LANGUAGE_SIGNAL_MATCHES) {
			break;
		}
	}

	return matches;
}

function findCompiledSurface(
	match: RegExpExecArray,
): CompiledSurface | undefined {
	for (let captureIndex = 1; captureIndex < match.length; captureIndex += 1) {
		if (match[captureIndex] !== undefined) {
			return COMPILED_SURFACES[captureIndex - 1];
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
