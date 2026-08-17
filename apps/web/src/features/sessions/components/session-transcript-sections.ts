import type {
	TraceEvent,
	TraceItem,
} from "@/components/conversation/conversation-trace";
import type { AgentTraceRequestUsagePlacement } from "@/components/conversation/conversation-trace-requests";
import {
	type ConversationTraceAgentSection,
	type ConversationTraceDerivedSection,
	deriveConversationTraceSections,
} from "@/components/conversation/conversation-trace-sections";
import { buildAgentTraceTreeBranches } from "@/components/conversation/conversation-trace-tree-branches";
import type { SessionDetailLevel } from "./session-detail-level";
import type { SessionDetailOverviewTurnOption } from "./session-detail-overview-model";
import type { SessionTurn } from "./session-turns";

export const SECTION_MAX_RENDERED_EVENTS = 60;
export const TRANSCRIPT_SECTION_CACHE_LIMIT = 1_000;

export type DerivedSectionPayload = {
	allEvents: ConversationTraceSectionDerivationContext;
	hiddenEventCount: number;
	isFirst: boolean;
	isLast: boolean;
	planMode: boolean;
	traceSection: ConversationTraceDerivedSection;
};

type ConversationTraceSectionDerivationContext = {
	eventCount: number;
	events: readonly TraceEvent[];
	planMode: boolean;
};

export type TranscriptSection = {
	estimatedHeight: number;
	id: string;
	payload: DerivedSectionPayload;
	turnId: string;
};

export type FoldSummary = {
	events: number;
	toolCalls: number;
};

export type SessionTranscriptRow =
	| {
			id: string;
			items: readonly TraceItem[];
			kind: "member";
			startsTrace: boolean;
			turnId: string;
	  }
	| { id: string; kind: "section"; section: TranscriptSection; turnId: string }
	| {
			hidden: { events: number; kindLabel: string };
			id: string;
			kind: "section-overflow";
			turnId: string;
	  }
	| { hidden: FoldSummary; id: string; kind: "turn-fold"; turnId: string }
	| {
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
	option: SessionDetailOverviewTurnOption;
	requestUsagePlacement: AgentTraceRequestUsagePlacement;
};

export type SessionTranscriptRowModel = {
	rowIndex: ReadonlyMap<string, number>;
	rows: readonly SessionTranscriptRow[];
	rowTurnIndex: ReadonlyMap<string, number>;
	turnFirstRowIndex: ReadonlyMap<string, number>;
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

export type TranscriptSectionCache = ReturnType<
	typeof createTranscriptSectionCache
>;

export function deriveTranscriptSections(input: {
	body: SessionTurn;
	level: SessionDetailLevel;
	option: SessionDetailOverviewTurnOption;
	requestUsagePlacement: AgentTraceRequestUsagePlacement;
}): TranscriptSection[] {
	const derivation = deriveConversationTraceSections({
		items: input.body.responseItems,
		requestUsage: input.option.metrics.usageEvents,
		requestUsagePlacement: input.requestUsagePlacement,
		traceCallDisplayMode: input.level,
	});
	return derivation.sections.map((traceSection, sectionIndex) => {
		const bounded = boundTraceSection(traceSection);
		return {
			estimatedHeight: estimateTranscriptSectionHeight(bounded.section),
			id: `${input.option.turnId}:s${sectionIndex}`,
			payload: {
				allEvents: {
					eventCount: derivation.events.length,
					events: derivation.events,
					planMode: derivation.planMode,
				},
				hiddenEventCount: bounded.hiddenEventCount,
				isFirst: sectionIndex === 0,
				isLast: sectionIndex === derivation.sections.length - 1,
				planMode: derivation.planMode,
				traceSection: bounded.section,
			},
			turnId: input.option.turnId,
		};
	});
}

export function buildSessionTranscriptRowModel(input: {
	cache: TranscriptSectionCache;
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

export function isRowUnchanged(
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
			return left.kind === "section" && left.section === right.section;
		case "section-overflow":
			return (
				left.kind === "section-overflow" &&
				left.hidden.events === right.hidden.events &&
				left.hidden.kindLabel === right.hidden.kindLabel
			);
		case "turn-fold":
			return (
				left.kind === "turn-fold" &&
				left.hidden.events === right.hidden.events &&
				left.hidden.toolCalls === right.hidden.toolCalls
			);
		case "turn-pending":
			return left.kind === "turn-pending" && left.option === right.option;
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

export function stabilizeSessionDetailTurnOptions(
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
	for (const section of sections) {
		rows.push({ id: section.id, kind: "section", section, turnId });
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

function boundTraceSection(section: ConversationTraceDerivedSection) {
	if (
		section.kind === "item" ||
		section.events.length <= SECTION_MAX_RENDERED_EVENTS
	) {
		return { hiddenEventCount: 0, section };
	}
	const events = section.events.slice(0, SECTION_MAX_RENDERED_EVENTS);
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

function estimateTranscriptSectionHeight(
	section: ConversationTraceDerivedSection,
) {
	if (section.kind === "item") {
		return 56;
	}
	const requestHeader = section.showHeader ? 40 : 0;
	return Math.max(40, requestHeader + section.events.length * 40);
}

function sectionCacheKey(input: {
	level: SessionDetailLevel;
	option: SessionDetailOverviewTurnOption;
	requestUsagePlacement: AgentTraceRequestUsagePlacement;
	revision: string;
}) {
	return `${input.option.turnId}\u0000${input.revision}\u0000${input.level}\u0000${input.requestUsagePlacement}`;
}

function areTranscriptValuesEqual(left: unknown, right: unknown): boolean {
	if (Object.is(left, right)) {
		return true;
	}
	if (Array.isArray(left) || Array.isArray(right)) {
		return (
			Array.isArray(left) &&
			Array.isArray(right) &&
			left.length === right.length &&
			left.every((value, index) =>
				areTranscriptValuesEqual(value, right[index]),
			)
		);
	}
	if (
		typeof left !== "object" ||
		left === null ||
		typeof right !== "object" ||
		right === null
	) {
		return false;
	}
	const leftRecord = left as Record<string, unknown>;
	const rightRecord = right as Record<string, unknown>;
	const leftKeys = Object.keys(leftRecord);
	const rightKeys = Object.keys(rightRecord);
	return (
		leftKeys.length === rightKeys.length &&
		leftKeys.every(
			(key) =>
				Object.hasOwn(rightRecord, key) &&
				areTranscriptValuesEqual(leftRecord[key], rightRecord[key]),
		)
	);
}
