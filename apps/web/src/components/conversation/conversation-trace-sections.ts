import type { TraceEvent, TraceItem } from "./conversation-trace";
import {
	getTraceCallDisplayConfig,
	shouldRenderTraceCallHeader,
	type TraceCallDisplayConfig,
	type TraceCallDisplayMode,
	type TraceCallGroupTreatment,
} from "./conversation-trace-call-display";
import {
	type AgentTraceRequestUsage,
	type AgentTraceRequestUsagePlacement,
	getTraceRequestInputTotal,
	getTraceRequestSkills,
	groupTraceEventsIntoRequests,
	takeTraceRequestUsageBefore,
} from "./conversation-trace-requests";
import {
	type AgentTraceTreeBranch,
	buildAgentTraceTreeBranches,
} from "./conversation-trace-tree-branches";

export type ConversationTraceAgentSection = {
	branches: readonly AgentTraceTreeBranch[];
	config: TraceCallDisplayConfig;
	events: readonly TraceEvent[];
	groupIndex: number | undefined;
	groupTreatment: TraceCallGroupTreatment;
	inlineUsage: boolean;
	key: string;
	kind: "agent";
	previousInputTotal: number | undefined;
	showHeader: boolean;
	skills: readonly string[];
	usage: AgentTraceRequestUsage | undefined;
};

export type ConversationTraceItemSection = {
	item: Exclude<TraceItem, { kind: "agent" }>;
	itemIndex: number;
	isLast: boolean;
	key: string;
	kind: "item";
	previousTimestamp: string | undefined;
};

export type ConversationTraceDerivedSection =
	| ConversationTraceAgentSection
	| ConversationTraceItemSection;

export type ConversationTraceSectionDerivation = {
	events: readonly TraceEvent[];
	planMode: boolean;
	sections: readonly ConversationTraceDerivedSection[];
};

/**
 * Resolves the whole-response request grouping before React renders anything.
 * Consumers may render the returned sections together (the legacy trace) or as
 * independently measured transcript rows without losing usage placement or
 * the grouping context supplied by neighboring top-level items.
 */
export function deriveConversationTraceSections(input: {
	items: readonly TraceItem[];
	requestUsage?: readonly AgentTraceRequestUsage[];
	requestUsagePlacement?: AgentTraceRequestUsagePlacement;
	traceCallDisplayMode?: TraceCallDisplayMode;
}): ConversationTraceSectionDerivation {
	const {
		items,
		requestUsage,
		requestUsagePlacement = "start",
		traceCallDisplayMode = "request",
	} = input;
	const sections: ConversationTraceDerivedSection[] = [];
	const events: TraceEvent[] = [];
	const config = getTraceCallDisplayConfig(traceCallDisplayMode);
	const usageQueue = [
		...(config.header === "none" ? [] : (requestUsage ?? [])),
	].sort((left, right) => Date.parse(left.at) - Date.parse(right.at));
	let cursor: string | undefined;
	let pendingAgentEvents: TraceEvent[] = [];
	let previousRequestInputTotal: number | undefined;
	let requestIndex = 0;
	const planMode = items.some(
		(item) => item.kind === "agent" && item.executionMode === "plan",
	);

	const flushAgentSections = (cutoffTimestamp: string | undefined) => {
		if (pendingAgentEvents.length === 0) {
			return;
		}
		const batchUsage = takeTraceRequestUsageBefore(usageQueue, cutoffTimestamp);
		for (const group of groupTraceEventsIntoRequests(
			pendingAgentEvents,
			batchUsage,
			requestUsagePlacement,
		)) {
			if (group.usage) {
				requestIndex += 1;
			}
			const currentRequestIndex = requestIndex;
			const inputTotal = group.usage
				? getTraceRequestInputTotal(group.usage)
				: undefined;
			const previousInputTotalForCall = previousRequestInputTotal;
			if (inputTotal !== undefined) {
				previousRequestInputTotal = inputTotal;
			}
			const branches = buildAgentTraceTreeBranches(group.events);
			const branchCount = branches.reduce(
				(count, branch) => count + (branch.root ? 1 : branch.children.length),
				0,
			);
			sections.push({
				branches,
				config,
				events: group.events,
				groupIndex: group.usage ? currentRequestIndex : undefined,
				groupTreatment: group.usage ? config.groupTreatment : "none",
				inlineUsage:
					group.usage !== undefined &&
					config.inlineUsageOnCollapsedRow &&
					branchCount === 1,
				key: group.usage
					? `request-${currentRequestIndex}`
					: `activity-${sections.length}`,
				kind: "agent",
				previousInputTotal: previousInputTotalForCall,
				showHeader:
					group.usage !== undefined &&
					shouldRenderTraceCallHeader(config, branchCount),
				skills: getTraceRequestSkills(group.events),
				usage: group.usage,
			});
		}
		pendingAgentEvents = [];
	};

	items.forEach((item, itemIndex) => {
		const previousTimestamp = cursor;
		if (item.kind === "agent") {
			cursor =
				item.events.at(-1)?.timestamp ?? previousTimestamp ?? item.timestamp;
			events.push(...item.events);
			pendingAgentEvents.push(...item.events);
			return;
		}

		flushAgentSections(item.timestamp);
		if (item.timestamp) {
			cursor = item.timestamp;
		}
		sections.push({
			item,
			itemIndex,
			isLast: itemIndex === items.length - 1,
			key: item.id,
			kind: "item",
			previousTimestamp,
		});
	});
	flushAgentSections(undefined);

	return { events, planMode, sections };
}
