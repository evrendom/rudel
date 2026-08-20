import {
	buildConversationTrace,
	extractSessionCompactionMetadata,
	getSessionTurnMemberText,
	groupTraceIntoTurns,
	parseConversations,
} from "@rudel/api-routes";
import { type LanguageSignalCounts, summarize } from "@rudel/language-signals";

export function summarizeSessionLanguageSignals(
	content: string,
): LanguageSignalCounts {
	const compactionMetadata = extractSessionCompactionMetadata(content);
	const visibleTrace = buildConversationTrace(
		parseConversations(content),
	).filter((item) => !compactionMetadata.hiddenTraceItemIds.has(item.id));
	const memberText = groupTraceIntoTurns(visibleTrace)
		.map(getSessionTurnMemberText)
		.filter(Boolean);
	const modelText = visibleTrace.flatMap((item) =>
		item.kind === "agent"
			? item.events.flatMap((event) =>
					event.kind === "message" ? [event.text] : [],
				)
			: [],
	);

	return summarize({ memberText, modelText });
}
