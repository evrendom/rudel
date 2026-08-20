import { splitDisplayTextParts } from "./display-boundaries.js";
import {
	scanMemberLanguageSignals,
	scanModelLanguageSignals,
} from "./scanner.js";
import type {
	LanguageSignalCounts,
	LanguageSignalMatch,
	LanguageSignalSummaryInput,
	ModelLanguageSignalMatch,
} from "./types.js";

export function summarize(
	input: LanguageSignalSummaryInput,
): LanguageSignalCounts {
	const member = countTextSegments(input.memberText, scanMemberLanguageSignals);
	const model = countTextSegments(input.modelText, scanModelLanguageSignals);

	return {
		member_swears: member.swears,
		member_apologies: member.apologies,
		member_positive: member.positive,
		model_swears: model.swears,
		model_apologies: model.apologies,
		model_positive: model.positive,
	};
}

function countTextSegments(
	segments: readonly string[],
	scan: (text: string) => readonly LanguageSignalMatch[],
) {
	return countSignals(scanDisplayTextSegments(segments, scan));
}

export function scanModelLanguageSignalSegments(
	segments: readonly string[],
): ReadonlyArray<ModelLanguageSignalMatch> {
	return scanDisplayTextSegments(segments, scanModelLanguageSignals);
}

function scanDisplayTextSegments<TMatch extends LanguageSignalMatch>(
	segments: readonly string[],
	scan: (text: string) => readonly TMatch[],
): TMatch[] {
	const matches: TMatch[] = [];

	for (const segment of segments) {
		for (const part of splitDisplayTextParts(segment)) {
			if (part.type !== "text" && part.type !== "strong") continue;
			matches.push(...scan(part.content));
		}
	}

	return matches;
}

function countSignals(signals: readonly LanguageSignalMatch[]) {
	let swears = 0;
	let apologies = 0;
	let positive = 0;

	for (const signal of signals) {
		switch (signal.category) {
			case "swear":
				swears += 1;
				break;
			case "apology":
				apologies += 1;
				break;
			case "positive":
				positive += 1;
				break;
			case "negative":
				break;
		}
	}

	return { apologies, positive, swears };
}
