import type { SessionDetailTurn } from "@rudel/api-routes";
import { describe, expect, it } from "vitest";
import type { SessionDetailOverviewTurnOption } from "./session-detail-overview-model";
import { searchSessionDetailTurns } from "./session-detail-search";

const option = {
	compactionsBefore: [],
	hasBody: true,
	key: "turn-hidden",
	memberPreview: "short preview",
	memberText: "short preview",
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
	preview: "ordinary response",
	slashCommands: [],
	timing: {
		durationLabel: undefined,
		durationSeconds: undefined,
		endTime: "",
		startTime: "",
	},
	toolCallCount: 0,
	turnId: "turn-hidden",
	turnNumber: 42,
} satisfies SessionDetailOverviewTurnOption;

const body = {
	responseItems: [
		{
			id: "agent-1",
			kind: "agent",
			executionMode: "default",
			timestamp: "2026-08-16T12:00:01.000Z",
			events: [
				{
					id: "message-1",
					kind: "message",
					content: "The distant needle phrase is only in the body.",
					text: "The distant needle phrase is only in the body.",
					timestamp: "2026-08-16T12:00:01.000Z",
				},
			],
		},
	],
	revision: "2026-08-16T12:00:02.000Z",
	turnId: "turn-hidden",
	userItems: [],
} satisfies SessionDetailTurn;

describe("session detail search", () => {
	it("streams a body-only hit into the result set after that body arrives", () => {
		expect(
			searchSessionDetailTurns({
				bodies: new Map(),
				options: [option],
				query: "needle",
			}),
		).toEqual([]);

		expect(
			searchSessionDetailTurns({
				bodies: new Map([[option.turnId, body]]),
				options: [option],
				query: "needle",
			}),
		).toEqual([
			expect.objectContaining({
				index: 0,
				turnId: "turn-hidden",
				turnNumber: 42,
			}),
		]);
	});

	it("matches overview previews before any body is loaded", () => {
		expect(
			searchSessionDetailTurns({
				bodies: new Map(),
				options: [option],
				query: "ordinary",
			}),
		).toHaveLength(1);
	});
});
