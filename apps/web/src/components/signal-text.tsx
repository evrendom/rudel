import {
	type LanguageSignalCategory,
	scanLanguageSignals,
} from "@rudel/language-signals";
import { type ReactNode, useMemo } from "react";

const SIGNAL_MARK_CLASS_NAMES: Readonly<
	Record<LanguageSignalCategory, string>
> = {
	swear:
		"bg-[var(--language-signal-swear-background)] text-inherit [box-decoration-break:clone]",
	apology:
		"bg-[var(--language-signal-apology-background)] text-inherit [box-decoration-break:clone]",
	positive:
		"bg-[var(--language-signal-positive-background)] text-inherit [box-decoration-break:clone]",
};

const SIGNAL_VARIABLE_CLASS_NAME =
	"[--language-signal-swear-background:#ffe4e6] [--language-signal-apology-background:#fef3c7] [--language-signal-positive-background:#dcfce7] dark:[--language-signal-swear-background:#4c1d25] dark:[--language-signal-apology-background:#493719] dark:[--language-signal-positive-background:#173d2a]";

interface SignalTextProps {
	readonly text: string;
}

export function SignalText({ text }: SignalTextProps) {
	const matches = useMemo(() => scanLanguageSignals(text), [text]);

	if (matches.length === 0) {
		return text;
	}

	const content: ReactNode[] = [];
	let cursor = 0;

	for (const match of matches) {
		if (match.start > cursor) {
			content.push(text.slice(cursor, match.start));
		}

		content.push(
			<mark
				key={`${match.start}:${match.end}:${match.ruleId}`}
				data-signal={match.category}
				className={SIGNAL_MARK_CLASS_NAMES[match.category]}
			>
				{match.matchedText}
			</mark>,
		);
		cursor = match.end;
	}

	if (cursor < text.length) {
		content.push(text.slice(cursor));
	}

	return <span className={SIGNAL_VARIABLE_CLASS_NAME}>{content}</span>;
}
