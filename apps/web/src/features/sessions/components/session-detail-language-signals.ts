import {
	type LanguageSignalCategory,
	scanLanguageSignals,
	scanModelLanguageSignals,
} from "@rudel/language-signals";

export const SESSION_DETAIL_SIGNAL_LABELS: Readonly<
	Partial<Record<LanguageSignalCategory, string>>
> = {
	apology: "Apologetic",
	negative: "Negative",
	positive: "Positive",
};

export function getDisplayedSessionLanguageSignals(text: string) {
	return scanLanguageSignals(text).filter(
		(signal) => SESSION_DETAIL_SIGNAL_LABELS[signal.category] !== undefined,
	);
}

export function getDisplayedModelLanguageSignals(text: string) {
	return scanModelLanguageSignals(text).filter(
		(signal) => SESSION_DETAIL_SIGNAL_LABELS[signal.category] !== undefined,
	);
}
