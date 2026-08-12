import { describe, expect, test } from "bun:test";
import { buildSessionAdalineMessageRows } from "./session-adaline-message-rows";
import type { SessionTurnTablePaneMatch } from "./session-turn-table-pane";
import type { SessionTurn } from "./session-turns";

function createMatch({
	index,
	turnNumber,
}: {
	index: number;
	turnNumber: number | undefined;
}): SessionTurnTablePaneMatch {
	const turn: SessionTurn | undefined =
		turnNumber === undefined
			? undefined
			: {
					responseItems: [
						{
							events: [
								{
									content: `Model ${index}`,
									id: `message-${index}`,
									kind: "message",
									text: `Model ${index}`,
									timestamp: "2026-08-11T10:00:02.000Z",
								},
							],
							id: `agent-${index}`,
							kind: "agent",
							timestamp: "2026-08-11T10:00:01.000Z",
						},
					],
					userItems: [
						{
							content: `Member ${index}`,
							id: `member-${index}`,
							kind: "user",
							timestamp: "2026-08-11T10:00:00.000Z",
						},
					],
				};

	return {
		index,
		option: {
			compactionsBefore: [],
			key: `turn-${index}`,
			memberPreview: `Member ${index}`,
			metrics: {
				editedFiles: [],
				errorCount: 0,
				estimatedCost: 0.01,
				inputTokens: 100,
				outputTokens: 20,
				skills: [],
				usageEvents: [],
			},
			preview: `Model ${index}`,
			slashCommands: [],
			timing: {
				durationLabel: "2 sec",
				durationSeconds: 2,
				endTime: "10:00:02",
				startTime: "10:00:00",
			},
			toolCallCount: 0,
			turn,
			turnNumber,
		},
	};
}

describe("Adaline table message rows", () => {
	test("places a member row immediately before its model row", () => {
		const rows = buildSessionAdalineMessageRows([
			createMatch({ index: 4, turnNumber: 4 }),
		]);

		expect(rows.map((row) => row.speaker)).toEqual(["member", "model"]);
		expect(rows.map((row) => row.preview)).toEqual(["Member 4", "Model 4"]);
		expect(rows.map((row) => row.match.index)).toEqual([4, 4]);
	});

	test("keeps the synthetic session-start row model-only", () => {
		const rows = buildSessionAdalineMessageRows([
			createMatch({ index: 0, turnNumber: undefined }),
		]);

		expect(rows.map((row) => row.speaker)).toEqual(["model"]);
	});

	test("keeps context and interruption records inside one model row", () => {
		const match = createMatch({ index: 5, turnNumber: 5 });
		match.option.turn?.responseItems.push(
			{
				id: "interrupted",
				kind: "system",
				systemType: "interruption",
				text: "[Request interrupted by user]",
				timestamp: "2026-08-11T10:00:03.000Z",
			},
			{
				events: [
					{
						id: "continued-reasoning",
						kind: "reasoning",
						text: "Continued work",
						timestamp: "2026-08-11T10:00:04.000Z",
					},
				],
				id: "continued-agent",
				kind: "agent",
				timestamp: "2026-08-11T10:00:04.000Z",
			},
		);

		const rows = buildSessionAdalineMessageRows([match]);

		expect(rows.map((row) => row.speaker)).toEqual(["member", "model"]);
		expect(rows[1]?.spanIds).toEqual([
			"message-5",
			"interrupted",
			"continued-reasoning",
		]);
	});
});
