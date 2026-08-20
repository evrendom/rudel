import { scanMemberLanguageSignals } from "@rudel/language-signals";

const SIGNAL_CONTEXT_WORD_COUNT = 4;

export type SessionTurnMemberTextDisplay = {
	excerpt: string;
	fullText: string;
};

export function buildSessionTurnMemberTextDisplay(
	text: string,
): SessionTurnMemberTextDisplay {
	const fullText = text.replace(/\s+/gu, " ").trim();
	const firstSignal = scanMemberLanguageSignals(fullText)[0];
	if (!firstSignal) {
		return { excerpt: fullText, fullText };
	}

	const wordsBeforeSignal = Array.from(
		fullText.slice(0, firstSignal.start).matchAll(/\S+/gu),
	);
	const contextStart =
		wordsBeforeSignal.at(-SIGNAL_CONTEXT_WORD_COUNT)?.index ?? 0;
	return {
		excerpt:
			contextStart === 0 ? fullText : `… ${fullText.slice(contextStart)}`,
		fullText,
	};
}
