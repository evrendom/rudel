import { describe, expect, it } from "vitest";
import type { SessionDetailOverviewTurnOption } from "./session-detail-overview-model";
import {
	estimateSessionContinuousTurnSize,
	estimateSessionTurnTableRowSize,
	getSessionVirtualViewport,
	measureSessionVirtualElement,
} from "./session-detail-virtualization";
import type { SessionTurnTableRow } from "./session-turn-table";

function createOption(
	overrides: Partial<SessionDetailOverviewTurnOption> = {},
): SessionDetailOverviewTurnOption {
	return {
		compactionsBefore: [],
		hasBody: true,
		key: "turn-1",
		memberPreview: "member",
		memberText: "member",
		metrics: {
			editedFiles: [],
			errorCount: 0,
			errorEvents: [],
			estimatedCost: undefined,
			inputTokens: undefined,
			outputTokens: undefined,
			skills: [],
			skillEvents: [],
			usageEvents: [],
		},
		preview: "response",
		slashCommands: [],
		timing: {
			durationLabel: undefined,
			durationSeconds: undefined,
			endTime: "",
			startTime: "",
		},
		toolCallCount: 0,
		turnId: "turn-1",
		turnNumber: 1,
		...overrides,
	};
}

describe("session detail virtualization", () => {
	it("remeasures the live element height instead of reusing a stale cached size", () => {
		const element = document.createElement("div");
		Object.defineProperty(element, "offsetHeight", {
			configurable: true,
			value: 240,
		});
		expect(measureSessionVirtualElement(element)).toBe(240);

		Object.defineProperty(element, "offsetHeight", {
			configurable: true,
			value: 920,
		});
		expect(measureSessionVirtualElement(element)).toBe(920);
	});

	it("estimates larger thread rows from summary previews and activity", () => {
		const compact = estimateSessionContinuousTurnSize(createOption());
		const dense = estimateSessionContinuousTurnSize(
			createOption({
				memberPreview: "m".repeat(300),
				metrics: {
					...createOption().metrics,
					errorCount: 2,
					skills: ["one", "two"],
				},
				preview: "r".repeat(400),
				toolCallCount: 3,
			}),
		);
		expect(dense).toBeGreaterThan(compact);
	});

	it("includes turn decorations in the ledger row estimate", () => {
		const option = createOption({
			compactionsBefore: [
				{ key: "compact-1", timestamp: "2026-08-16T12:00:00.000Z" },
			],
		});
		const row = {
			characterCount: 10,
			key: "turn-1:model",
			match: { index: 0, option },
			speaker: "model",
			toolCallGroups: [],
		} satisfies SessionTurnTableRow;
		expect(
			estimateSessionTurnTableRowSize({
				beginsTurn: true,
				hasEpisode: true,
				row,
			}),
		).toBeGreaterThan(
			estimateSessionTurnTableRowSize({
				beginsTurn: false,
				hasEpisode: false,
				row,
			}),
		);
	});

	it("derives active and visible turns from virtual measurements", () => {
		const viewport = getSessionVirtualViewport({
			count: 6,
			items: [
				{ end: 300, index: 1, key: "one", lane: 0, size: 200, start: 100 },
				{ end: 500, index: 2, key: "two", lane: 0, size: 200, start: 300 },
				{ end: 700, index: 3, key: "three", lane: 0, size: 200, start: 500 },
			],
			scrollOffset: 250,
			viewportSize: 320,
		});
		expect(viewport).toEqual({
			activeIndex: 2,
			visibleRange: [1, 3],
		});
	});
});
