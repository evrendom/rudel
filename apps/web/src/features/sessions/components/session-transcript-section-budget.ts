import type { TraceEvent } from "@/components/conversation/conversation-trace";
import type {
	ConversationTraceAgentSection,
	ConversationTraceDerivedSection,
} from "@/components/conversation/conversation-trace-sections";
import {
	type AgentTraceTreeBranch,
	buildAgentTraceTreeBranches,
} from "@/components/conversation/conversation-trace-tree-branches";

const REQUEST_HEADER_ESTIMATED_PX = 120;
const CONTINUATION_SECTION_ESTIMATED_PX = 12;
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

export function splitAgentSectionBeforeEvent(
	section: ConversationTraceAgentSection,
	eventId: string,
) {
	const eventIndex = section.events.findIndex((event) => event.id === eventId);
	if (eventIndex <= 0) {
		return [section];
	}
	const earlierEvents = section.events.slice(0, eventIndex);
	const terminalEvents = section.events.slice(eventIndex);
	return [
		{
			...section,
			branches: buildAgentTraceTreeBranches(earlierEvents),
			continuesToNext: true,
			events: earlierEvents,
		},
		{
			...section,
			branches: buildAgentTraceTreeBranches(terminalEvents),
			continuesFromPrevious: true,
			events: terminalEvents,
			inlineUsage: false,
			key: `${section.key}:terminal`,
			showHeader: false,
		},
	];
}

export function splitAgentSectionByEstimatedHeight(
	section: ConversationTraceAgentSection,
	maxEstimatedPx: number,
) {
	const fullBranches = buildAgentTraceTreeBranches(section.events);
	const eventIndices = new Map<TraceEvent, number>();
	section.events.forEach((event, eventIndex) => {
		eventIndices.set(event, eventIndex);
	});
	const eventChunks: { events: TraceEvent[]; startIndex: number }[] = [];
	let events: TraceEvent[] = [];
	let startIndex = 0;
	let estimatedHeight = section.showHeader ? REQUEST_HEADER_ESTIMATED_PX : 0;
	section.events.forEach((event, eventIndex) => {
		const eventHeight = estimateTraceEventHeight(event, maxEstimatedPx);
		if (events.length > 0 && estimatedHeight + eventHeight > maxEstimatedPx) {
			eventChunks.push({ events, startIndex });
			events = [];
			startIndex = eventIndex;
			estimatedHeight = 0;
		}
		events.push(event);
		estimatedHeight = Math.min(maxEstimatedPx, estimatedHeight + eventHeight);
	});
	if (events.length > 0) {
		eventChunks.push({ events, startIndex });
	}

	return eventChunks.map((eventChunk, chunkIndex) => {
		const continuationChunk = chunkIndex > 0;
		const continuesFromPrevious =
			section.continuesFromPrevious || continuationChunk;
		const continuesToNext =
			section.continuesToNext || chunkIndex < eventChunks.length - 1;
		const chunk: ConversationTraceAgentSection = {
			...section,
			branches: sliceAgentTraceTreeBranches({
				branches: fullBranches,
				endIndex: eventChunk.startIndex + eventChunk.events.length,
				eventIndices,
				startIndex: eventChunk.startIndex,
			}),
			continuesFromPrevious,
			continuesToNext,
			events: eventChunk.events,
			inlineUsage: continuationChunk ? false : section.inlineUsage,
			key: continuationChunk ? `${section.key}:b${chunkIndex}` : section.key,
			showHeader: continuationChunk ? false : section.showHeader,
		};
		return {
			chunkIndex,
			estimatedHeight: estimateAgentSectionHeight(chunk, maxEstimatedPx),
			section: chunk,
		};
	});
}

function sliceAgentTraceTreeBranches(input: {
	branches: readonly AgentTraceTreeBranch[];
	endIndex: number;
	eventIndices: ReadonlyMap<TraceEvent, number>;
	startIndex: number;
}) {
	return input.branches.flatMap<AgentTraceTreeBranch>((branch) => {
		const rootIndex = branch.root
			? input.eventIndices.get(branch.root)
			: undefined;
		const root =
			branch.root &&
			rootIndex !== undefined &&
			rootIndex >= input.startIndex &&
			rootIndex < input.endIndex
				? branch.root
				: undefined;
		const childStartIndex = branch.children.findIndex((child) => {
			const childIndex = input.eventIndices.get(child);
			return (
				childIndex !== undefined &&
				childIndex >= input.startIndex &&
				childIndex < input.endIndex
			);
		});
		const children = branch.children.filter((child) => {
			const eventIndex = input.eventIndices.get(child);
			return (
				eventIndex !== undefined &&
				eventIndex >= input.startIndex &&
				eventIndex < input.endIndex
			);
		});
		if (!root && children.length === 0) {
			return [];
		}
		return [
			{
				...branch,
				childStartIndex:
					childStartIndex < 0 ? branch.totalChildren : childStartIndex,
				children,
				root,
			},
		];
	});
}

function estimateAgentSectionHeight(
	section: ConversationTraceAgentSection,
	maxEstimatedPx: number,
) {
	const requestHeader = section.showHeader ? REQUEST_HEADER_ESTIMATED_PX : 0;
	const continuationSpacing = section.continuesFromPrevious
		? CONTINUATION_SECTION_ESTIMATED_PX
		: 0;
	return Math.min(
		maxEstimatedPx,
		Math.max(
			COMPACT_EVENT_ESTIMATED_PX,
			requestHeader +
				continuationSpacing +
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
