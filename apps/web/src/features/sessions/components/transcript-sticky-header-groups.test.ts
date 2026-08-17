import type { VirtualItem } from "@tanstack/react-virtual";
import { describe, expect, test } from "vitest";
import type { TraceEvent } from "@/components/conversation/conversation-trace";
import { deriveConversationTraceSections } from "@/components/conversation/conversation-trace-sections";
import { deriveTranscriptSectionFoldMetadata } from "./session-transcript-folds";
import type { SessionTranscriptRow } from "./session-transcript-sections";
import {
	deriveTranscriptStickyHeaderGroups,
	placeTranscriptStickyHeaderGroups,
} from "./use-transcript-sticky-header-wrappers";

function virtualItem(index: number, start: number, end: number): VirtualItem {
	return {
		end,
		index,
		key: `row:${index}`,
		lane: 0,
		size: end - start,
		start,
	};
}

function member(turnId: string): SessionTranscriptRow {
	return {
		id: `${turnId}:member`,
		items: [],
		kind: "member",
		startsTrace: true,
		turnId,
	};
}

function noResponse(turnId: string): SessionTranscriptRow {
	return { id: `${turnId}:no-response`, kind: "no-response", turnId };
}

function turnError(turnId: string): SessionTranscriptRow {
	return { id: `${turnId}:error`, kind: "turn-error", turnId };
}

function windowEdge(direction: "newer" | "older"): SessionTranscriptRow {
	return {
		direction,
		id: `window-edge:${direction}`,
		kind: "window-edge",
		state: "idle",
	};
}

function section(input: {
	id: string;
	isFirst: boolean;
	model?: string;
	planMode?: boolean;
	turnId: string;
}): SessionTranscriptRow {
	const timestamp = "2026-08-17T12:00:00.000Z";
	const event: TraceEvent = {
		content: input.id,
		id: `${input.id}:message`,
		kind: "message",
		text: input.id,
		timestamp,
	};
	const derivation = deriveConversationTraceSections({
		items: [
			{
				events: [event],
				executionMode: input.planMode ? "plan" : "unknown",
				id: `${input.id}:agent`,
				kind: "agent",
				timestamp,
			},
		],
		requestUsage: input.model
			? [
					{
						at: timestamp,
						cacheCreationInputTokens: 0,
						cacheReadInputTokens: 0,
						inputTokens: 1,
						model: input.model,
						outputTokens: 1,
					},
				]
			: undefined,
	});
	const traceSection = derivation.sections[0];
	if (!traceSection) {
		throw new Error("Expected a derived trace section");
	}
	return {
		id: input.id,
		kind: "section",
		section: {
			estimatedHeight: 100,
			fold: deriveTranscriptSectionFoldMetadata([event], input.id, event.id),
			id: input.id,
			payload: {
				allEvents: {
					eventCount: 1,
					events: [event],
					planMode: input.planMode ?? false,
				},
				hiddenEventCount: 0,
				isFirst: input.isFirst,
				isLast: true,
				planMode: input.planMode ?? false,
				traceSection,
			},
			turnId: input.turnId,
		},
		turnId: input.turnId,
	};
}

describe("transcript sticky-header groups", () => {
	test("carries member and per-section model data across budget chunks", () => {
		const rows = [
			member("turn-1"),
			section({
				id: "turn-1:s0",
				isFirst: true,
				model: "claude-sonnet-4-5",
				planMode: true,
				turnId: "turn-1",
			}),
			section({
				id: "turn-1:s0b1",
				isFirst: false,
				turnId: "turn-1",
			}),
			section({
				id: "turn-1:s0b2",
				isFirst: false,
				turnId: "turn-1",
			}),
			member("turn-2"),
			section({
				id: "turn-2:s0",
				isFirst: true,
				model: "gpt-5.2",
				turnId: "turn-2",
			}),
		];
		const groups = deriveTranscriptStickyHeaderGroups({
			agentModel: "session-fallback",
			rows,
			userImageUrl: undefined,
			userLabel: "Evren",
		});

		expect(groups).toHaveLength(4);
		expect(groups[0]).toMatchObject({
			endRowIndex: 0,
			header: { kind: "member", userLabel: "Evren" },
			headerRowIndex: 0,
			startRowIndex: 0,
			turnId: "turn-1",
		});
		expect(groups[1]).toMatchObject({
			endRowIndex: 3,
			header: {
				agentLabel: "Sonnet 4.5",
				agentModel: "claude-sonnet-4-5",
				continues: true,
				kind: "model",
				planMode: true,
				terminal: false,
			},
			startRowIndex: 1,
			turnId: "turn-1",
		});
		expect(groups[3]).toMatchObject({
			header: {
				agentLabel: "GPT 5.2",
				agentModel: "gpt-5.2",
				kind: "model",
				terminal: true,
			},
			turnId: "turn-2",
		});
	});

	test("tiles every row exactly once, including no-response turns and kind-less edges", () => {
		const fixtures: readonly (readonly SessionTranscriptRow[])[] = [
			[member("no-response"), noResponse("no-response")],
			[turnError("error")],
			[
				windowEdge("older"),
				member("turn-1"),
				noResponse("turn-1"),
				windowEdge("newer"),
				member("turn-2"),
				section({
					id: "turn-2:s0",
					isFirst: true,
					turnId: "turn-2",
				}),
				{ id: "subagents", kind: "subagents-anchor" },
			],
			[windowEdge("older"), { id: "subagents", kind: "subagents-anchor" }],
		];

		for (const rows of fixtures) {
			const groups = deriveTranscriptStickyHeaderGroups({
				agentModel: "gpt-5.2",
				rows,
				userImageUrl: undefined,
				userLabel: "Evren",
			});
			const coverage = Array.from({ length: rows.length }, () => 0);
			for (const group of groups) {
				for (
					let rowIndex = group.startRowIndex;
					rowIndex <= group.endRowIndex;
					rowIndex += 1
				) {
					coverage[rowIndex] = (coverage[rowIndex] ?? 0) + 1;
				}
			}
			expect(coverage, rows.map((row) => row.id).join(", ")).toEqual(
				Array.from({ length: rows.length }, () => 1),
			);
			expect(groups[0]?.startRowIndex).toBe(0);
			expect(groups.at(-1)?.endRowIndex).toBe(rows.length - 1);
			for (let index = 1; index < groups.length; index += 1) {
				expect(groups[index]?.startRowIndex).toBe(
					(groups[index - 1]?.endRowIndex ?? -1) + 1,
				);
			}
		}

		const edgeRows = fixtures[2];
		if (!edgeRows) {
			throw new Error("Expected the window-edge fixture");
		}
		const edgeGroups = deriveTranscriptStickyHeaderGroups({
			agentModel: "gpt-5.2",
			rows: edgeRows,
			userImageUrl: undefined,
			userLabel: "Evren",
		});
		const middleEdgeIndex = edgeRows.findIndex(
			(row) => row.kind === "window-edge" && row.direction === "newer",
		);
		expect(
			edgeGroups.find(
				(group) =>
					group.startRowIndex <= middleEdgeIndex &&
					group.endRowIndex >= middleEdgeIndex,
			)?.turnId,
		).toBe("turn-1");
	});

	test("places only intersecting groups from measured header starts to group ends", () => {
		const rows = [
			member("turn-1"),
			section({ id: "turn-1:s0", isFirst: true, turnId: "turn-1" }),
			section({ id: "turn-1:s0b1", isFirst: false, turnId: "turn-1" }),
			section({ id: "turn-1:s0b2", isFirst: false, turnId: "turn-1" }),
			member("turn-2"),
			section({ id: "turn-2:s0", isFirst: true, turnId: "turn-2" }),
		];
		const groups = deriveTranscriptStickyHeaderGroups({
			agentModel: "gpt-5.2",
			rows,
			userImageUrl: undefined,
			userLabel: "Evren",
		});
		const measurements = [
			virtualItem(0, 0, 100),
			virtualItem(1, 100, 300),
			virtualItem(2, 300, 500),
			virtualItem(3, 500, 700),
			virtualItem(4, 700, 800),
			virtualItem(5, 800, 1_000),
		];

		expect(
			placeTranscriptStickyHeaderGroups({
				groups,
				measurements,
				virtualItems: measurements.slice(1, 4),
			}),
		).toMatchObject([
			{
				extent: 600,
				group: { header: { kind: "model" }, turnId: "turn-1" },
				start: 100,
			},
		]);
	});
});
