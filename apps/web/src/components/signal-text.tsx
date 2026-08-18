import {
	type LanguageSignalMatch,
	scanLanguageSignals,
} from "@rudel/language-signals";
import { createContext, type ReactNode, useContext, useMemo } from "react";

export const LANGUAGE_SIGNAL_SCAN_CACHE_CAPACITY = 500;

const MAX_SEARCH_HIGHLIGHT_MATCHES = 10_000;
const languageSignalScanCache = new Map<
	string,
	ReadonlyArray<LanguageSignalMatch>
>();

const SIGNAL_MARK_BASE_CLASS_NAME =
	"inline rounded-[8px] px-[4px] py-[2px] font-sans text-[13px] leading-[20px] font-normal select-none [box-decoration-break:clone] [-webkit-box-decoration-break:clone]";

const SIGNAL_MARK_CATEGORY_CLASS_NAMES: Readonly<
	Record<LanguageSignalMatch["category"], string>
> = {
	negative: "bg-[#ffe4e6] text-[#be123c] dark:bg-[#4c1d25] dark:text-[#fb7185]",
	swear: "bg-[#ffe4e6] text-[#be123c] dark:bg-[#4c1d25] dark:text-[#fb7185]",
	apology: "bg-[#fef3c7] text-[#b45309] dark:bg-[#493719] dark:text-[#fbbf24]",
	positive: "bg-[#dcfce7] text-[#15803d] dark:bg-[#173d2a] dark:text-[#4ade80]",
};

const SEARCH_MARK_CLASS_NAME = "bg-yellow-300 text-inherit dark:bg-yellow-700";
const SignalTextSearchQueryContext = createContext<string | undefined>(
	undefined,
);

interface SignalTextProps {
	readonly searchQuery?: string;
	readonly text: string;
}

interface TextRange {
	readonly start: number;
	readonly end: number;
}

export function SignalTextSearchQueryProvider({
	children,
	query,
}: {
	readonly children: ReactNode;
	readonly query: string;
}) {
	return (
		<SignalTextSearchQueryContext value={query}>
			{children}
		</SignalTextSearchQueryContext>
	);
}

export function SignalText({ searchQuery, text }: SignalTextProps) {
	const inheritedSearchQuery = useContext(SignalTextSearchQueryContext);
	const effectiveSearchQuery = searchQuery ?? inheritedSearchQuery;
	const matches = useMemo(() => scanLanguageSignalsCached(text), [text]);
	const searchRanges = useMemo(
		() => findSearchHighlightRanges(text, effectiveSearchQuery),
		[effectiveSearchQuery, text],
	);

	if (matches.length === 0 && searchRanges.length === 0) {
		return text;
	}

	return <>{renderDecoratedText(text, matches, searchRanges)}</>;
}

export function scanLanguageSignalsCached(
	text: string,
): ReadonlyArray<LanguageSignalMatch> {
	const cachedMatches = languageSignalScanCache.get(text);
	if (cachedMatches !== undefined) {
		languageSignalScanCache.delete(text);
		languageSignalScanCache.set(text, cachedMatches);
		return cachedMatches;
	}

	const matches = scanLanguageSignals(text);
	if (languageSignalScanCache.size >= LANGUAGE_SIGNAL_SCAN_CACHE_CAPACITY) {
		const oldestText = languageSignalScanCache.keys().next().value;
		if (oldestText !== undefined) {
			languageSignalScanCache.delete(oldestText);
		}
	}
	languageSignalScanCache.set(text, matches);
	return matches;
}

export function clearLanguageSignalScanCache(): void {
	languageSignalScanCache.clear();
}

export function getLanguageSignalScanCacheSize(): number {
	return languageSignalScanCache.size;
}

function renderDecoratedText(
	text: string,
	matches: ReadonlyArray<LanguageSignalMatch>,
	searchRanges: ReadonlyArray<TextRange>,
): ReactNode[] {
	const content: ReactNode[] = [];
	let cursor = 0;
	let matchIndex = 0;
	let searchRangeIndex = 0;

	while (cursor < text.length) {
		while (matches[matchIndex] && matches[matchIndex].end <= cursor) {
			matchIndex += 1;
		}
		while (
			searchRanges[searchRangeIndex] &&
			searchRanges[searchRangeIndex].end <= cursor
		) {
			searchRangeIndex += 1;
		}

		const match = matches[matchIndex];
		const searchRange = searchRanges[searchRangeIndex];
		if (searchRange && searchRange.start <= cursor) {
			content.push(
				<mark
					key={`search:${cursor}:${searchRange.end}`}
					className={SEARCH_MARK_CLASS_NAME}
					data-search-highlight="true"
				>
					{text.slice(cursor, searchRange.end)}
				</mark>,
			);
			cursor = searchRange.end;
			continue;
		}

		if (match && match.start <= cursor) {
			const end = Math.min(match.end, searchRange?.start ?? match.end);
			content.push(
				<span
					key={`signal:${cursor}:${end}:${match.ruleId}`}
					data-signal={match.category}
					data-text="true"
					className={`${SIGNAL_MARK_BASE_CLASS_NAME} ${SIGNAL_MARK_CATEGORY_CLASS_NAMES[match.category]}`}
				>
					{text.slice(cursor, end)}
				</span>,
			);
			cursor = end;
			continue;
		}

		const nextBoundary = Math.min(
			match?.start ?? text.length,
			searchRange?.start ?? text.length,
		);
		content.push(text.slice(cursor, nextBoundary));
		cursor = nextBoundary;
	}

	return content;
}

function findSearchHighlightRanges(
	text: string,
	searchQuery: string | undefined,
): ReadonlyArray<TextRange> {
	const query = searchQuery?.trim();
	if (!query) {
		return [];
	}

	const pattern = new RegExp(escapeRegularExpression(query), "giu");
	const ranges: TextRange[] = [];
	for (const match of text.matchAll(pattern)) {
		ranges.push({ start: match.index, end: match.index + match[0].length });
		if (ranges.length >= MAX_SEARCH_HIGHLIGHT_MATCHES) {
			break;
		}
	}
	return ranges;
}

function escapeRegularExpression(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
