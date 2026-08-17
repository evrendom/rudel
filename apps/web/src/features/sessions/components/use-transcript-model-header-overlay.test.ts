import type { VirtualItem } from "@tanstack/react-virtual";
import { describe, expect, test } from "vitest";
import type { SessionTranscriptRow } from "./session-transcript-sections";
import {
	deriveTranscriptStickyHeaderGroups,
	resolveTranscriptStickyHeaderOverlay,
} from "./use-transcript-model-header-overlay";

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

function pending(turnId: string): SessionTranscriptRow {
	return {
		id: `${turnId}:pending`,
		kind: "turn-pending",
		option: {} as never,
		turnId,
	};
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
}) {
	return {
		id: input.id,
		kind: "section",
		section: {
			payload: {
				isFirst: input.isFirst,
				planMode: input.planMode ?? false,
				traceSection: {
					kind: "agent",
					usage: input.model ? { model: input.model } : undefined,
				},
			},
		},
		turnId: input.turnId,
	} as unknown as SessionTranscriptRow;
}

describe("transcript sticky-header groups", () => {
	test("carries member and per-section model header data across budget chunks", () => {
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
			[pending("pending")],
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

		const edgeRows = fixtures[2] ?? [];
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
		const edgeMeasurements = edgeRows.map((_, index) =>
			virtualItem(index, index * 80, (index + 1) * 80),
		);
		for (let scrollTop = 0; scrollTop < edgeRows.length * 80; scrollTop += 1) {
			expect(
				resolveTranscriptStickyHeaderOverlay({
					groups: edgeGroups,
					headerHeights: { member: 56, model: 32 },
					measurements: edgeMeasurements,
					scrollTop,
				}),
				`mid-list edge coverage at ${scrollTop}`,
			).toBeDefined();
		}

		const noResponseRows = fixtures[0] ?? [];
		const noResponseGroups = deriveTranscriptStickyHeaderGroups({
			agentModel: "gpt-5.2",
			rows: noResponseRows,
			userImageUrl: undefined,
			userLabel: "Evren",
		});
		const noResponseMeasurements = noResponseRows.map((_, index) =>
			virtualItem(index, index * 100, (index + 1) * 100),
		);
		for (let scrollTop = 0; scrollTop < 200; scrollTop += 1) {
			expect(
				resolveTranscriptStickyHeaderOverlay({
					groups: noResponseGroups,
					headerHeights: { member: 56 },
					measurements: noResponseMeasurements,
					scrollTop,
				}),
				`no-response coverage at ${scrollTop}`,
			).toBeDefined();
		}
	});

	test("binary-searches measured ownership and computes push-off", () => {
		const groups = deriveTranscriptStickyHeaderGroups({
			agentModel: "gpt-5.2",
			rows: [
				member("turn-1"),
				section({
					id: "turn-1:s0",
					isFirst: true,
					turnId: "turn-1",
				}),
				section({
					id: "turn-1:s0b1",
					isFirst: false,
					turnId: "turn-1",
				}),
			],
			userImageUrl: undefined,
			userLabel: "Evren",
		});
		const measurements = [
			virtualItem(0, 0, 100),
			virtualItem(1, 100, 600),
			virtualItem(2, 600, 1_100),
		];

		expect(
			resolveTranscriptStickyHeaderOverlay({
				groups,
				headerHeights: { member: 56, model: 32 },
				measurements,
				scrollTop: 20,
			}),
		).toMatchObject({ group: { header: { kind: "member" } } });
		expect(
			resolveTranscriptStickyHeaderOverlay({
				groups,
				headerHeights: { member: 56, model: 32 },
				measurements,
				scrollTop: 1_080,
			}),
		).toMatchObject({
			group: { header: { kind: "model" }, turnId: "turn-1" },
			translateY: -12,
		});
	});

	test("uses outgoing per-kind heights without holes through member/model handovers", () => {
		const rows = [
			member("turn-1"),
			section({ id: "turn-1:s0", isFirst: true, turnId: "turn-1" }),
			member("turn-2"),
			section({ id: "turn-2:s0", isFirst: true, turnId: "turn-2" }),
		];
		const groups = deriveTranscriptStickyHeaderGroups({
			agentModel: "gpt-5.2",
			headerHeights: { member: 56, model: 32 },
			rows,
			userImageUrl: undefined,
			userLabel: "Evren",
		});
		const measurements = rows.map((_, index) =>
			virtualItem(index, index * 100, (index + 1) * 100),
		);
		const samples = Array.from({ length: 400 }, (_, scrollTop) =>
			resolveTranscriptStickyHeaderOverlay({
				groups,
				headerHeights: { member: 56, model: 32 },
				measurements,
				scrollTop,
			}),
		);
		expect(samples.every(Boolean)).toBe(true);
		expect(samples[50]?.translateY).toBe(-6);
		expect(samples[75]?.translateY).toBe(-31);
		expect(samples[150]?.translateY).toBe(0);
		expect(samples[175]?.translateY).toBe(-7);
		for (let index = 1; index < samples.length; index += 1) {
			const previous = samples[index - 1];
			const current = samples[index];
			if (
				previous &&
				current &&
				previous.group.ownerKey === current.group.ownerKey
			) {
				expect(
					Math.abs(current.translateY - previous.translateY),
				).toBeLessThanOrEqual(1);
			}
		}
	});
});
