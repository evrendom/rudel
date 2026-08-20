import { scanLanguageSignals } from "@rudel/language-signals";
import type { ReactNode } from "react";
import { type SignalScanner, SignalText } from "../signal-text";

export const TRACE_TEXT_COLLAPSE_CHARACTER_LIMIT = 1_500;
const TRACE_TEXT_PREVIEW_CHARACTER_LIMIT = TRACE_TEXT_COLLAPSE_CHARACTER_LIMIT;
const TRACE_TEXT_PREVIEW_SIGNAL_LIMIT = 5;

export type TraceTextPreviewSignal = {
	readonly category: "apology" | "negative" | "positive" | "swear";
	readonly gapBefore: boolean;
	readonly key: string;
	readonly matchedText: string;
	readonly ruleId: string;
};

export type TraceTextPreview = {
	readonly leadingText: string;
	readonly omitted: boolean;
	readonly trailingSignals: readonly TraceTextPreviewSignal[];
};

function sliceCodePoints(value: string, count: number): string {
	return Array.from(value).slice(0, count).join("");
}

export function isTraceTextCollapsible(text: string): boolean {
	return Array.from(text).length > TRACE_TEXT_COLLAPSE_CHARACTER_LIMIT;
}

export function buildTraceTextPreview(
	text: string,
	scanSignals: SignalScanner = scanLanguageSignals,
): TraceTextPreview {
	return buildTraceTextPreviewFromSegments([text], scanSignals);
}

export function buildTraceTextPreviewFromSegments(
	segments: readonly string[],
	scanSignals: SignalScanner = scanLanguageSignals,
): TraceTextPreview {
	const characterCount = segments.reduce(
		(count, segment) => count + Array.from(segment).length,
		0,
	);
	const omitted = characterCount > TRACE_TEXT_COLLAPSE_CHARACTER_LIMIT;
	if (!omitted) {
		return {
			leadingText: segments.join("\n"),
			omitted: false,
			trailingSignals: [],
		};
	}

	let remainingLeadingCharacters = TRACE_TEXT_PREVIEW_CHARACTER_LIMIT;
	const leadingParts: string[] = [];
	const trailingSignals: TraceTextPreviewSignal[] = [];
	for (const [segmentIndex, segment] of segments.entries()) {
		const leadingSource = sliceCodePoints(segment, remainingLeadingCharacters);
		if (leadingSource.length > 0) {
			leadingParts.push(leadingSource);
			remainingLeadingCharacters -= Array.from(leadingSource).length;
		}
		if (trailingSignals.length < TRACE_TEXT_PREVIEW_SIGNAL_LIMIT) {
			const matches = scanSignals(segment)
				.filter((match) => match.start >= leadingSource.length)
				.slice(0, TRACE_TEXT_PREVIEW_SIGNAL_LIMIT - trailingSignals.length);
			let previousEnd = leadingSource.length;
			for (const match of matches) {
				trailingSignals.push({
					category: match.category,
					gapBefore: segment.slice(previousEnd, match.start).trim().length > 0,
					key: `${segmentIndex}:${match.start}:${match.end}:${match.ruleId}`,
					matchedText: match.matchedText,
					ruleId: match.ruleId,
				});
				previousEnd = match.end;
			}
		}
	}
	const leadingText = leadingParts.join(" ").replace(/\s+/gu, " ").trim();

	return { leadingText, omitted, trailingSignals };
}

export function TraceTextCollapsedPreview({
	renderLeadingText,
	scanSignals = scanLanguageSignals,
	text,
}: {
	readonly renderLeadingText?: (text: string) => ReactNode;
	readonly scanSignals?: SignalScanner;
	readonly text: string | readonly string[];
}) {
	const preview =
		typeof text === "string"
			? buildTraceTextPreview(text, scanSignals)
			: buildTraceTextPreviewFromSegments(text, scanSignals);
	return (
		<span className="grid min-w-0 gap-0.5" data-trace-text-preview>
			<span data-trace-text-preview-leading>
				{renderLeadingText ? (
					renderLeadingText(preview.leadingText)
				) : (
					<SignalText scanSignals={scanSignals} text={preview.leadingText} />
				)}
			</span>
			{preview.omitted ? (
				<span
					className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-0.5"
					data-trace-text-preview-tail
				>
					{preview.trailingSignals.length === 0 ? (
						<span
							aria-hidden="true"
							className="text-(--session-overview-subtle)"
						>
							[…]
						</span>
					) : (
						preview.trailingSignals.map((signal) => (
							<span className="contents" key={signal.key}>
								{signal.gapBefore ? (
									<span
										aria-hidden="true"
										className="text-(--session-overview-subtle)"
									>
										[…]
									</span>
								) : null}
								<span data-trace-text-preview-signal>
									<SignalText
										scanSignals={scanSignals}
										text={signal.matchedText}
									/>
								</span>
							</span>
						))
					)}
				</span>
			) : null}
		</span>
	);
}
