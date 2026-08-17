import { describe, expect, it } from "vitest";
import type { SessionDetailOverviewTurnOption } from "./session-detail-overview-model";
import {
	estimateSessionTurnTableRowSize,
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
});
