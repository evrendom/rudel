// biome-ignore-all lint/nursery/noExcessiveLinesPerFile: Row derivation, structural sharing, and cache identity form one measured transcript-model pass.
import type {
	TraceEvent,
	TraceItem,
} from "@/components/conversation/conversation-trace";
import type { AgentTraceRequestUsagePlacement } from "@/components/conversation/conversation-trace-requests";
import {
	type ConversationTraceDerivedSection,
	deriveConversationTraceSections,
} from "@/components/conversation/conversation-trace-sections";
import type { SessionDetailLevel } from "./session-detail-level";
import type { SessionDetailOverviewTurnOption } from "./session-detail-overview-model";
import {
	deriveTranscriptFoldPlan,
	deriveTranscriptSectionFoldMetadata,
	type TranscriptFoldSummary,
	type TranscriptSectionFoldMetadata,
} from "./session-transcript-folds";
import {
	boundTraceSectionEvents,
	splitAgentSectionBeforeEvent,
	splitAgentSectionByEstimatedHeight,
} from "./session-transcript-section-budget";
import { areTranscriptValuesEqual } from "./session-transcript-structural-sharing";
import type { SessionTurn } from "./session-turns";
import { measureTranscriptSuspect } from "./transcript-forensics";

export const SECTION_MAX_RENDERED_EVENTS = 60;
export const SECTION_MAX_ESTIMATED_PX = 800;
const TRANSCRIPT_SECTION_CACHE_LIMIT = 1_000;

type DerivedSectionPayload = {
	allEvents: ConversationTraceSectionDerivationContext;
	hiddenEventCount: number;
	isFirst: boolean;
	isLast: boolean;
	modelSetting?: string;
	planMode: boolean;
	traceSection: ConversationTraceDerivedSection;
};

type ConversationTraceSectionDerivationContext = {
	eventCount: number;
	events: readonly TraceEvent[];
	planMode: boolean;
};

type TranscriptSection = {
	estimatedHeight: number;
	fold: TranscriptSectionFoldMetadata;
	id: string;
	payload: DerivedSectionPayload;
	turnId: string;
};

type FoldSummary = TranscriptFoldSummary;

export type SessionTranscriptRow =
	| {
			id: string;
			items: readonly TraceItem[];
			kind: "member";
			startsTrace: boolean;
			turnId: string;
	  }
	| {
			id: string;
			isFirst: boolean;
			kind: "section";
			section: TranscriptSection;
			turnId: string;
	  }
	| {
			hidden: { events: number; kindLabel: string };
			id: string;
			kind: "section-overflow";
			turnId: string;
	  }
	| {
			agentModel: string | undefined;
			allEvents: readonly TraceEvent[];
			expanded: boolean;
			hidden: FoldSummary;
			id: string;
			kind: "turn-fold";
			modelSetting: string | undefined;
			planMode: boolean;
			turnId: string;
	  }
	| {
			estimatedHeight: number | undefined;
			id: string;
			kind: "turn-pending";
			option: SessionDetailOverviewTurnOption;
			turnId: string;
	  }
	| { id: string; kind: "turn-error"; turnId: string }
	| { id: string; kind: "no-response"; turnId: string }
	| {
			direction: "newer" | "older";
			id: string;
			kind: "window-edge";
			state: "error" | "idle" | "loading";
	  }
	| { id: "subagents"; kind: "subagents-anchor" };

export type SessionTranscriptTurnSource = {
	body: SessionTurn | undefined;
	bodyState?: "error" | "loading";
	estimatedHeight?: number;
	option: SessionDetailOverviewTurnOption;
	requestUsagePlacement: AgentTraceRequestUsagePlacement;
};

export type SessionTranscriptRowModel = {
	rowIndex: ReadonlyMap<string, number>;
	rows: readonly SessionTranscriptRow[];
	rowTurnIndex: ReadonlyMap<string, number>;
	turnFirstRowIndex: ReadonlyMap<string, number>;
};

type SessionTranscriptFoldState = {
	expandedTurnIds: ReadonlySet<string>;
	protectedTurnIds: ReadonlySet<string>;
};

type CachedSections = {
	body: SessionTurn;
	option: SessionDetailOverviewTurnOption;
	sections: readonly TranscriptSection[];
};

export function createTranscriptSectionCache(
	limit = TRANSCRIPT_SECTION_CACHE_LIMIT,
) {
	const cache = new Map<string, CachedSections>();
	return {
		clear() {
			cache.clear();
		},
		deleteTurn(turnId: string) {
			for (const key of cache.keys()) {
				if (key.startsWith(`${turnId}\u0000`)) {
					cache.delete(key);
				}
			}
		},
		get(input: {
			body: SessionTurn;
			level: SessionDetailLevel;
			option: SessionDetailOverviewTurnOption;
			requestUsagePlacement: AgentTraceRequestUsagePlacement;
			revision: string;
		}) {
			const key = sectionCacheKey(input);
			const existing = cache.get(key);
			if (existing?.body === input.body && existing.option === input.option) {
				cache.delete(key);
				cache.set(key, existing);
				return existing.sections;
			}
			const sections = deriveTranscriptSections(input);
			cache.set(key, { body: input.body, option: input.option, sections });
			while (cache.size > limit) {
				const oldestKey = cache.keys().next().value;
				if (oldestKey === undefined) {
					break;
				}
				cache.delete(oldestKey);
			}
			return sections;
		},
		get size() {
			return cache.size;
		},
	};
}

type TranscriptSectionCache = ReturnType<typeof createTranscriptSectionCache>;

type TranscriptTerminalBoundary =
	| { eventId: string; kind: "message"; sectionIndex: number }
	| { kind: "interruption"; sectionIndex: number };

function isTranscriptInterruptionItem(
	item: Exclude<TraceItem, { kind: "agent" }>,
) {
	return (
		item.kind === "system" &&
		(item.systemType === "interruption" ||
			/^(?:Turn aborted|\[Request interrupted by user\])$/iu.test(
				item.text.trim(),
			))
	);
}

function deriveTranscriptSections(input: {
	body: SessionTurn;
	level: SessionDetailLevel;
	option: SessionDetailOverviewTurnOption;
	requestUsagePlacement: AgentTraceRequestUsagePlacement;
}): TranscriptSection[] {
	return measureTranscriptSuspect(
		"section-derivation",
		{ level: input.level, turnId: input.option.turnId },
		() => deriveTranscriptSectionsUnmeasured(input),
	);
}

function getRootModelSetting(items: readonly TraceItem[]) {
	for (const item of items) {
		if (
			item.kind === "agent" &&
			(item.agentName === undefined || item.agentName === "/root") &&
			item.modelSetting
		) {
			return item.modelSetting;
		}
	}
	return undefined;
}

function findTranscriptTerminalBoundary(
	sections: readonly ConversationTraceDerivedSection[],
) {
	let boundary: TranscriptTerminalBoundary | undefined;
	for (const [sectionIndex, section] of sections.entries()) {
		if (section.kind === "item" && isTranscriptInterruptionItem(section.item)) {
			boundary = { kind: "interruption", sectionIndex };
			continue;
		}
		if (section.kind !== "agent") {
			continue;
		}
		const message = section.events
			.filter((event) => event.kind === "message")
			.at(-1);
		if (message) {
			boundary = { eventId: message.id, kind: "message", sectionIndex };
		}
	}
	return boundary;
}

function deriveTranscriptSectionsUnmeasured(input: {
	body: SessionTurn;
	level: SessionDetailLevel;
	option: SessionDetailOverviewTurnOption;
	requestUsagePlacement: AgentTraceRequestUsagePlacement;
}): TranscriptSection[] {
	const modelSetting = getRootModelSetting(input.body.responseItems);
	const derivation = deriveConversationTraceSections({
		items: input.body.responseItems,
		requestUsage: input.option.metrics.usageEvents,
		requestUsagePlacement: input.requestUsagePlacement,
		traceCallDisplayMode: input.level,
	});
	const terminalBoundary = findTranscriptTerminalBoundary(derivation.sections);
	const terminalSeparatedSections = derivation.sections.flatMap(
		(traceSection, sectionIndex) => {
			const terminalMessageId =
				terminalBoundary?.kind === "message" &&
				terminalBoundary.sectionIndex === sectionIndex
					? terminalBoundary.eventId
					: undefined;
			const sections =
				traceSection.kind === "agent" && terminalMessageId
					? splitAgentSectionBeforeEvent(traceSection, terminalMessageId)
					: [traceSection];
			return sections.map((section, splitIndex) => ({
				groupId:
					splitIndex === 0
						? `${input.option.turnId}:s${sectionIndex}`
						: `${input.option.turnId}:s${sectionIndex}t${splitIndex}`,
				isTerminalBoundary:
					terminalBoundary?.sectionIndex === sectionIndex &&
					(terminalBoundary.kind === "interruption" ||
						splitIndex === sections.length - 1),
				traceSection: section,
			}));
		},
	);
	const parts = terminalSeparatedSections.flatMap(
		({ groupId, isTerminalBoundary, traceSection }) => {
			const bounded = boundTraceSectionEvents(
				traceSection,
				SECTION_MAX_RENDERED_EVENTS,
			);
			const events = traceSection.kind === "agent" ? traceSection.events : [];
			const fold = deriveTranscriptSectionFoldMetadata(
				events,
				groupId,
				isTerminalBoundary,
			);
			const sectionParts =
				bounded.section.kind === "agent"
					? splitAgentSectionByEstimatedHeight(
							bounded.section,
							SECTION_MAX_ESTIMATED_PX,
						)
					: [
							{
								chunkIndex: 0,
								estimatedHeight: 56,
								section: bounded.section,
							},
						];
			return sectionParts.map((part, partIndex) => ({
				estimatedHeight: part.estimatedHeight,
				fold,
				id: part.chunkIndex === 0 ? groupId : `${groupId}b${part.chunkIndex}`,
				hiddenEventCount:
					partIndex === sectionParts.length - 1 ? bounded.hiddenEventCount : 0,
				traceSection: part.section,
			}));
		},
	);
	return parts.map((part, partIndex) => {
		return {
			estimatedHeight: part.estimatedHeight,
			fold: part.fold,
			id: part.id,
			payload: {
				allEvents: {
					eventCount: derivation.events.length,
					events: derivation.events,
					planMode: derivation.planMode,
				},
				hiddenEventCount: part.hiddenEventCount,
				isFirst: partIndex === 0,
				isLast: partIndex === parts.length - 1,
				...(modelSetting ? { modelSetting } : {}),
				planMode: derivation.planMode,
				traceSection: part.traceSection,
			},
			turnId: input.option.turnId,
		};
	});
}

export function buildSessionTranscriptRowModel(input: {
	cache: TranscriptSectionCache;
	folds?: SessionTranscriptFoldState;
	includeSubagentsAnchor?: boolean;
	level: SessionDetailLevel;
	newerEdge?: "error" | "idle" | "loading";
	olderEdge?: "error" | "idle" | "loading";
	revision: string;
	turns: readonly SessionTranscriptTurnSource[];
}): SessionTranscriptRowModel {
	const rows: SessionTranscriptRow[] = [];
	const firstMemberTurnId = input.turns.find(
		(turn) =>
			turn.body?.userItems.some((item) => item.kind === "user") ??
			turn.option.memberPreview !== "No member message",
	)?.option.turnId;
	if (input.olderEdge) {
		rows.push({
			direction: "older",
			id: "window-edge:older",
			kind: "window-edge",
			state: input.olderEdge,
		});
	}
	for (const turn of input.turns) {
		appendTurnRows(rows, turn, {
			cache: input.cache,
			folds: input.folds,
			level: input.level,
			revision: input.revision,
			startsTrace: turn.option.turnId === firstMemberTurnId,
		});
	}
	if (input.newerEdge) {
		rows.push({
			direction: "newer",
			id: "window-edge:newer",
			kind: "window-edge",
			state: input.newerEdge,
		});
	}
	if (input.includeSubagentsAnchor) {
		rows.push({ id: "subagents", kind: "subagents-anchor" });
	}
	return indexSessionTranscriptRows(rows, input.turns);
}

export function stabilizeTranscriptRows(
	previous: readonly SessionTranscriptRow[],
	next: readonly SessionTranscriptRow[],
) {
	return measureTranscriptSuspect(
		"stable-rows",
		{ next: next.length, previous: previous.length },
		() => stabilizeTranscriptRowsUnmeasured(previous, next),
	);
}

function stabilizeTranscriptRowsUnmeasured(
	previous: readonly SessionTranscriptRow[],
	next: readonly SessionTranscriptRow[],
) {
	const previousById = new Map(previous.map((row) => [row.id, row]));
	let changed = previous.length !== next.length;
	const rows = next.map((row, index) => {
		const candidate = previousById.get(row.id);
		if (candidate && isRowUnchanged(candidate, row)) {
			if (candidate !== previous[index]) {
				changed = true;
			}
			return candidate;
		}
		changed = true;
		return row;
	});
	return changed ? rows : previous;
}

function isRowUnchanged(
	left: SessionTranscriptRow,
	right: SessionTranscriptRow,
) {
	if (left.kind !== right.kind || left.id !== right.id) {
		return false;
	}
	switch (right.kind) {
		case "member":
			return (
				left.kind === "member" &&
				left.items === right.items &&
				left.startsTrace === right.startsTrace
			);
		case "section":
			return (
				left.kind === "section" &&
				left.section === right.section &&
				left.isFirst === right.isFirst
			);
		case "section-overflow":
			return (
				left.kind === "section-overflow" &&
				left.hidden.events === right.hidden.events &&
				left.hidden.kindLabel === right.hidden.kindLabel
			);
		case "turn-fold":
			return (
				left.kind === "turn-fold" &&
				left.agentModel === right.agentModel &&
				left.allEvents === right.allEvents &&
				left.expanded === right.expanded &&
				left.modelSetting === right.modelSetting &&
				left.planMode === right.planMode &&
				areFoldSummariesEqual(left.hidden, right.hidden)
			);
		case "turn-pending":
			return (
				left.kind === "turn-pending" &&
				left.estimatedHeight === right.estimatedHeight &&
				left.option === right.option
			);
		case "turn-error":
		case "no-response":
		case "subagents-anchor":
			return true;
		case "window-edge":
			return (
				left.kind === "window-edge" &&
				left.direction === right.direction &&
				left.state === right.state
			);
	}
}

function areFoldSummariesEqual(left: FoldSummary, right: FoldSummary) {
	return (
		left.events === right.events &&
		left.filesEdited === right.filesEdited &&
		left.filesRead === right.filesRead &&
		left.filesWritten === right.filesWritten &&
		left.messages === right.messages &&
		left.reasoning === right.reasoning &&
		left.skills === right.skills &&
		left.subagents === right.subagents
	);
}

export function stabilizeSessionDetailTurnOptions(
	previous: readonly SessionDetailOverviewTurnOption[],
	next: readonly SessionDetailOverviewTurnOption[],
) {
	return measureTranscriptSuspect(
		"stable-options",
		{ next: next.length, previous: previous.length },
		() => stabilizeSessionDetailTurnOptionsUnmeasured(previous, next),
	);
}

function stabilizeSessionDetailTurnOptionsUnmeasured(
	previous: readonly SessionDetailOverviewTurnOption[],
	next: readonly SessionDetailOverviewTurnOption[],
) {
	const previousByTurn = new Map(
		previous.map((option) => [option.turnId, option]),
	);
	let changed = previous.length !== next.length;
	const options = next.map((option, index) => {
		const candidate = previousByTurn.get(option.turnId);
		if (candidate && areTranscriptValuesEqual(candidate, option)) {
			if (candidate !== previous[index]) {
				changed = true;
			}
			return candidate;
		}
		changed = true;
		return option;
	});
	return changed ? options : previous;
}

function appendTurnRows(
	rows: SessionTranscriptRow[],
	turn: SessionTranscriptTurnSource,
	context: {
		cache: TranscriptSectionCache;
		folds: SessionTranscriptFoldState | undefined;
		level: SessionDetailLevel;
		revision: string;
		startsTrace: boolean;
	},
) {
	const turnId = turn.option.turnId;
	if (!turn.body) {
		if (turn.bodyState === "error") {
			rows.push({ id: `${turnId}:error`, kind: "turn-error", turnId });
		} else if (turn.option.hasBody) {
			rows.push({
				estimatedHeight: turn.estimatedHeight,
				id: `${turnId}:pending`,
				kind: "turn-pending",
				option: turn.option,
				turnId,
			});
		} else {
			rows.push({ id: `${turnId}:no-response`, kind: "no-response", turnId });
		}
		return;
	}
	if (turn.body.userItems.length > 0) {
		rows.push({
			id: `${turnId}:member`,
			items: turn.body.userItems,
			kind: "member",
			startsTrace: context.startsTrace,
			turnId,
		});
	}
	if (turn.body.responseItems.length === 0) {
		rows.push({ id: `${turnId}:no-response`, kind: "no-response", turnId });
		return;
	}
	const sections = context.cache.get({
		body: turn.body,
		level: context.level,
		option: turn.option,
		requestUsagePlacement: turn.requestUsagePlacement,
		revision: context.revision,
	});
	const foldPlan = context.folds
		? deriveTranscriptFoldPlan(
				sections,
				context.folds.protectedTurnIds.has(turnId),
			)
		: undefined;
	if (foldPlan) {
		const expanded = context.folds?.expandedTurnIds.has(turnId) ?? false;
		const firstSection = sections[0];
		const firstAgentSection = sections.find(
			(section) => section.payload.traceSection.kind === "agent",
		)?.payload.traceSection;
		if (!firstSection) {
			return;
		}
		rows.push({
			agentModel:
				firstAgentSection?.kind === "agent"
					? firstAgentSection.usage?.model
					: undefined,
			allEvents: firstSection.payload.allEvents.events,
			expanded,
			hidden: foldPlan.summary,
			id: `${turnId}:fold`,
			kind: "turn-fold",
			modelSetting: firstSection.payload.modelSetting,
			planMode: firstSection.payload.planMode,
			turnId,
		});
		for (const section of sections) {
			if (foldPlan.hiddenSectionIds.has(section.id)) {
				if (!expanded) {
					continue;
				}
			}
			appendSectionRows(rows, section, turnId, false);
		}
		return;
	}
	for (const section of sections) {
		appendSectionRows(rows, section, turnId);
	}
}

function appendSectionRows(
	rows: SessionTranscriptRow[],
	section: TranscriptSection,
	turnId: string,
	isFirst = section.payload.isFirst,
) {
	rows.push({ id: section.id, isFirst, kind: "section", section, turnId });
	if (section.payload.hiddenEventCount > 0) {
		rows.push({
			hidden: {
				events: section.payload.hiddenEventCount,
				kindLabel: "activity events",
			},
			id: `${section.id}:overflow`,
			kind: "section-overflow",
			turnId,
		});
	}
}

function indexSessionTranscriptRows(
	rows: readonly SessionTranscriptRow[],
	turns: readonly SessionTranscriptTurnSource[],
): SessionTranscriptRowModel {
	const rowIndex = new Map<string, number>();
	const rowTurnIndex = new Map<string, number>();
	const turnFirstRowIndex = new Map<string, number>();
	const turnIndex = new Map(
		turns.map((turn, index) => [turn.option.turnId, index]),
	);
	rows.forEach((row, index) => {
		rowIndex.set(row.id, index);
		if (!("turnId" in row)) {
			return;
		}
		const indexForTurn = turnIndex.get(row.turnId);
		if (indexForTurn === undefined) {
			return;
		}
		rowTurnIndex.set(row.id, indexForTurn);
		if (!turnFirstRowIndex.has(row.turnId)) {
			turnFirstRowIndex.set(row.turnId, index);
		}
	});
	return { rowIndex, rows, rowTurnIndex, turnFirstRowIndex };
}

function sectionCacheKey(input: {
	level: SessionDetailLevel;
	option: SessionDetailOverviewTurnOption;
	requestUsagePlacement: AgentTraceRequestUsagePlacement;
	revision: string;
}) {
	return `${input.option.turnId}\u0000${input.revision}\u0000${input.level}\u0000${input.requestUsagePlacement}`;
}
