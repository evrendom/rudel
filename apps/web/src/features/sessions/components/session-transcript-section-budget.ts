import type { TraceEvent } from "@/components/conversation/conversation-trace";
import type {
	ConversationTraceAgentSection,
	ConversationTraceDerivedSection,
} from "@/components/conversation/conversation-trace-sections";
import { buildAgentTraceTreeBranches } from "@/components/conversation/conversation-trace-tree-branches";

const REQUEST_HEADER_ESTIMATED_PX = 120;
const COMPACT_EVENT_ESTIMATED_PX = 32;
const TEXT_EVENT_BASE_ESTIMATED_PX = 40;
const EVENT_TEXT_LINE_ESTIMATED_PX = 20;
const EVENT_TEXT_CHARACTERS_PER_LINE = 120;

export function boundTraceSectionEvents(
	section: ConversationTraceDerivedSection,
	maxEvents: number,
) {
	if (section.kind === "item" || section.events.length <= maxEvents) {
		return { hiddenEventCount: 0, section };
	}
	const events = section.events.slice(0, maxEvents);
	const bounded: ConversationTraceAgentSection = {
		...section,
		branches: buildAgentTraceTreeBranches(events),
		events,
	};
	return {
		hiddenEventCount: section.events.length - events.length,
		section: bounded,
	};
}

export function splitAgentSectionByEstimatedHeight(
	section: ConversationTraceAgentSection,
	maxEstimatedPx: number,
) {
	const eventChunks: TraceEvent[][] = [];
	let events: TraceEvent[] = [];
	let estimatedHeight = section.showHeader ? REQUEST_HEADER_ESTIMATED_PX : 0;
	for (const event of section.events) {
		const eventHeight = estimateTraceEventHeight(event, maxEstimatedPx);
		if (events.length > 0 && estimatedHeight + eventHeight > maxEstimatedPx) {
			eventChunks.push(events);
			events = [];
			estimatedHeight = 0;
		}
		events.push(event);
		estimatedHeight = Math.min(maxEstimatedPx, estimatedHeight + eventHeight);
	}
	if (events.length > 0) {
		eventChunks.push(events);
	}

	return eventChunks.map((chunkEvents, chunkIndex) => {
		const continuation = chunkIndex > 0;
		const chunk: ConversationTraceAgentSection = {
			...section,
			branches: buildAgentTraceTreeBranches(chunkEvents),
			events: chunkEvents,
			inlineUsage: continuation ? false : section.inlineUsage,
			key: continuation ? `${section.key}:b${chunkIndex}` : section.key,
			showHeader: continuation ? false : section.showHeader,
		};
		return {
			chunkIndex,
			estimatedHeight: estimateAgentSectionHeight(chunk, maxEstimatedPx),
			section: chunk,
		};
	});
}

function estimateAgentSectionHeight(
	section: ConversationTraceAgentSection,
	maxEstimatedPx: number,
) {
	const requestHeader = section.showHeader ? REQUEST_HEADER_ESTIMATED_PX : 0;
	return Math.min(
		maxEstimatedPx,
		Math.max(
			COMPACT_EVENT_ESTIMATED_PX,
			requestHeader +
				section.events.reduce(
					(total, event) =>
						total + estimateTraceEventHeight(event, maxEstimatedPx),
					0,
				),
		),
	);
}

function estimateTraceEventHeight(event: TraceEvent, maxEstimatedPx: number) {
	if (event.kind !== "message" && event.kind !== "reasoning") {
		return COMPACT_EVENT_ESTIMATED_PX;
	}
	const textLines = event.text
		.split("\n")
		.reduce(
			(total, line) =>
				total +
				Math.max(1, Math.ceil(line.length / EVENT_TEXT_CHARACTERS_PER_LINE)),
			0,
		);
	return Math.min(
		maxEstimatedPx,
		TEXT_EVENT_BASE_ESTIMATED_PX +
			Math.max(0, textLines - 1) * EVENT_TEXT_LINE_ESTIMATED_PX,
	);
}
