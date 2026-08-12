import { describe, expect, test } from "bun:test";
import { buildSessionAdalineMessageRows } from "./session-adaline-message-rows";
import {
	buildSessionAdalineRawRecord,
	buildSessionAdalineSpans,
	getSessionAdalineAggregateCounts,
	getSessionAdalineMessageSpans,
	getSessionAdalineTurnStatus,
	type SessionAdalineOption,
} from "./session-adaline-model";

function createOption(
	overrides: Partial<SessionAdalineOption> = {},
): SessionAdalineOption {
	return {
		compactionsBefore: [],
		key: "turn-1",
		memberPreview: "Please update the page",
		metrics: {
			editedFiles: ["src/page.tsx"],
			errorCount: 0,
			estimatedCost: 0.12,
			inputTokens: 1_000,
			outputTokens: 250,
			skills: ["ui"],
			usageEvents: [],
		},
		preview: "Updated it.",
		slashCommands: ["review"],
		timing: {
			durationLabel: "10 sec",
			durationSeconds: 10,
			endTime: "10:00:10",
			endTimestamp: "2026-08-11T10:00:10.000Z",
			startTime: "10:00:00",
			startTimestamp: "2026-08-11T10:00:00.000Z",
		},
		toolCallCount: 1,
		turn: {
			responseItems: [
				{
					events: [
						{
							id: "tool",
							input: { path: "src/page.tsx" },
							kind: "tool",
							result: { content: "Done", isError: false },
							timestamp: "2026-08-11T10:00:02.000Z",
							toolName: "apply_patch",
						},
						{
							content: "Updated it.",
							id: "message",
							kind: "message",
							text: "Updated it.",
							timestamp: "2026-08-11T10:00:10.000Z",
						},
					],
					id: "agent",
					kind: "agent",
					timestamp: "2026-08-11T10:00:02.000Z",
				},
			],
			userItems: [
				{
					content: "Please update the page",
					id: "member",
					kind: "user",
					timestamp: "2026-08-11T10:00:00.000Z",
				},
			],
		},
		turnNumber: 1,
		...overrides,
	};
}

describe("Adaline session detail model", () => {
	test("builds timed member, tool, and message spans from a turn", () => {
		const spans = buildSessionAdalineSpans(createOption());

		expect(spans.map((span) => span.kind)).toEqual([
			"member",
			"tool",
			"message",
		]);
		expect(spans[0]?.durationMs).toBe(2_000);
		expect(spans[1]?.durationMs).toBe(8_000);
		expect(spans[1]?.status).toBe("success");
	});

	test("separates the member row from the model waterfall spans", () => {
		const option = createOption();
		const rows = buildSessionAdalineMessageRows([{ index: 0, option }]);

		expect(
			rows.flatMap((row) =>
				row.speaker === "member"
					? getSessionAdalineMessageSpans(option, row).map((span) => span.kind)
					: [],
			),
		).toEqual(["member"]);
		expect(
			rows.flatMap((row) =>
				row.speaker === "model"
					? getSessionAdalineMessageSpans(option, row).map((span) => span.kind)
					: [],
			),
		).toEqual(["tool", "message"]);
	});

	test("marks a failed turn and deduplicates aggregate files and skills", () => {
		const failedOption = createOption({
			key: "turn-2",
			metrics: {
				editedFiles: ["src/page.tsx", "src/other.ts"],
				errorCount: 1,
				estimatedCost: 0.03,
				inputTokens: 100,
				outputTokens: 50,
				skills: ["ui", "testing-bun"],
				usageEvents: [],
			},
			turnNumber: 2,
		});
		const options = [createOption(), failedOption];

		expect(getSessionAdalineTurnStatus(failedOption)).toBe("error");
		expect(getSessionAdalineAggregateCounts(options)).toEqual({
			editedFileCount: 2,
			errorCount: 1,
			skillCount: 2,
			toolCallCount: 2,
			turnCount: 2,
		});
	});

	test("scopes raw inspection to the selected span with turn context", () => {
		const option = createOption();
		const selectedSpan = buildSessionAdalineSpans(option)[1];
		expect(selectedSpan).toBeDefined();

		const raw = buildSessionAdalineRawRecord(option, selectedSpan);
		expect(raw).toHaveProperty("span");
		expect(raw).toHaveProperty("turn.turnNumber", 1);
	});
});
