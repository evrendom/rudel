import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { SessionTurnTableSpeaker } from "./session-turn-table";
import { buildSessionTurnTableColumns } from "./session-turn-table-columns";
import { sortSessionTurnTableOptions } from "./session-turn-table-filters";
import { SessionTurnTableFooter } from "./session-turn-table-footer";
import type { SessionTurnTablePaneOption } from "./session-turn-table-pane";
import {
	getSessionTurnTableSelectedRowKey,
	getVisibleSessionTurnSpeaker,
	isSessionTurnTableRowInViewport,
} from "./session-turn-table-selection";
import {
	focusSessionTurnTableSpeaker,
	toggleSessionTurnTableSpeakerVisibility,
} from "./session-turn-table-speaker-visibility";
import { buildSessionTurnTableViewRows } from "./session-turn-table-view-rows";
import { getSessionTurnMemberPreview, type SessionTurn } from "./session-turns";

const compaction = {
	key: "compaction-before-turn-2",
	timestamp: "2026-08-10T10:04:00.000Z",
};

const MODEL_SPEAKERS: ReadonlySet<SessionTurnTableSpeaker> = new Set(["model"]);
const USER_SPEAKERS: ReadonlySet<SessionTurnTableSpeaker> = new Set(["member"]);
const ALL_SPEAKERS: ReadonlySet<SessionTurnTableSpeaker> = new Set([
	"model",
	"member",
]);

const options: readonly SessionTurnTablePaneOption[] = [
	{
		compactionsBefore: [],
		key: "turn-1",
		memberPreview: "Alpha member request",
		metrics: {
			editedFiles: ["src/alpha.ts"],
			errorCount: 1,
			errorEvents: [],
			estimatedCost: 0.04,
			inputTokens: 1_200,
			outputTokens: 480,
			skills: ["design"],
			skillEvents: [],
			usageEvents: [],
		},
		preview: "Alpha model response",
		slashCommands: ["/review"],
		timing: {
			durationLabel: "2 min",
			durationSeconds: 120,
			endTime: "10:02",
			startTime: "10:00",
		},
		toolCallCount: 3,
		turnNumber: 1,
	},
	{
		compactionsBefore: [compaction],
		key: "turn-2",
		memberCharacterCount: 1_200,
		memberPreview: "Beta member request",
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
		preview: "Beta model response",
		slashCommands: [],
		timing: {
			durationLabel: undefined,
			durationSeconds: undefined,
			endTime: "",
			startTime: "10:05",
		},
		toolCallCount: 0,
		turnNumber: 2,
	},
];

describe("session turn table pane", () => {
	test("treats the transcript viewport as an inclusive turn range", () => {
		expect(
			isSessionTurnTableRowInViewport({
				turnIndex: 3,
				viewportRange: [3, 6],
			}),
		).toBe(true);
		expect(
			isSessionTurnTableRowInViewport({
				turnIndex: 6,
				viewportRange: [3, 6],
			}),
		).toBe(true);
		expect(
			isSessionTurnTableRowInViewport({
				turnIndex: 7,
				viewportRange: [3, 6],
			}),
		).toBe(false);
		expect(
			isSessionTurnTableRowInViewport({
				turnIndex: 3,
				viewportRange: undefined,
			}),
		).toBe(false);
	});

	test("separates row visibility from the focused top-row speaker", () => {
		const allSpeakers = toggleSessionTurnTableSpeakerVisibility({
			primarySpeaker: "model",
			speaker: "member",
			visibleSpeakers: MODEL_SPEAKERS,
		});
		expect(allSpeakers.primarySpeaker).toBe("model");
		expect([...allSpeakers.visibleSpeakers]).toEqual(["model", "member"]);

		const userFocused = focusSessionTurnTableSpeaker({
			primarySpeaker: allSpeakers.primarySpeaker,
			speaker: "member",
			visibleSpeakers: allSpeakers.visibleSpeakers,
		});
		expect(userFocused.primarySpeaker).toBe("member");
		expect(userFocused.visibleSpeakers).toBe(allSpeakers.visibleSpeakers);

		const modelOnly = toggleSessionTurnTableSpeakerVisibility({
			primarySpeaker: userFocused.primarySpeaker,
			speaker: "member",
			visibleSpeakers: userFocused.visibleSpeakers,
		});
		expect(modelOnly.primarySpeaker).toBe("model");
		expect([...modelOnly.visibleSpeakers]).toEqual(["model"]);

		const unchanged = toggleSessionTurnTableSpeakerVisibility({
			primarySpeaker: modelOnly.primarySpeaker,
			speaker: "model",
			visibleSpeakers: modelOnly.visibleSpeakers,
		});
		expect(unchanged.visibleSpeakers).toBe(modelOnly.visibleSpeakers);

		const unavailableUserFocus = focusSessionTurnTableSpeaker({
			primarySpeaker: modelOnly.primarySpeaker,
			speaker: "member",
			visibleSpeakers: modelOnly.visibleSpeakers,
		});
		expect(unavailableUserFocus.primarySpeaker).toBe("model");
		expect(unavailableUserFocus.visibleSpeakers).toBe(
			modelOnly.visibleSpeakers,
		);
		expect(getVisibleSessionTurnSpeaker("member", MODEL_SPEAKERS)).toBe(
			"model",
		);
		expect(getVisibleSessionTurnSpeaker("model", USER_SPEAKERS)).toBe("member");
	});

	test("sorts while keeping original row indices and compaction assignments", () => {
		const matches = sortSessionTurnTableOptions(
			options.map((option, index) => ({ index, option })),
			{ direction: "desc", key: "time" },
		);

		expect(matches.map((match) => match.index)).toEqual([1, 0]);
		expect(matches[0]?.option.compactionsBefore).toEqual([compaction]);
	});
});

describe("member turn preview", () => {
	test("combines consecutive member messages into plain truncated text", () => {
		const turn: SessionTurn = {
			responseItems: [],
			userItems: [
				{
					content: "First member prompt",
					id: "member-1",
					kind: "user",
					timestamp: "2026-08-10T10:00:00.000Z",
				},
				{
					content: "Second member prompt",
					id: "member-2",
					kind: "user",
					timestamp: "2026-08-10T10:00:01.000Z",
				},
			],
		};

		expect(getSessionTurnMemberPreview(turn)).toBe(
			"First member prompt Second member prompt",
		);
	});

	test("uses a clear fallback for the synthetic session-start turn", () => {
		const turn: SessionTurn = {
			responseItems: [],
			userItems: [],
		};

		expect(getSessionTurnMemberPreview(turn)).toBe("No member message");
	});
});

describe("session turn table views", () => {
	const optionWithMemberMessages: SessionTurnTablePaneOption = {
		...options[0],
		turn: {
			responseItems: [
				{
					events: [
						{
							id: "tool-read-1",
							input: { file_path: "src/alpha.ts" },
							kind: "tool",
							result: undefined,
							timestamp: "2026-08-10T10:00:02.000Z",
							toolName: "Read",
						},
						{
							id: "tool-bash",
							input: { command: "bun test" },
							kind: "tool",
							result: undefined,
							timestamp: "2026-08-10T10:00:03.000Z",
							toolName: "Bash",
						},
						{
							id: "tool-read-2",
							input: { file_path: "src/beta.ts" },
							kind: "tool",
							result: { content: "Failed", isError: true },
							timestamp: "2026-08-10T10:00:04.000Z",
							toolName: "Read",
						},
					],
					id: "agent-one",
					executionMode: "unknown",
					kind: "agent",
					timestamp: "2026-08-10T10:00:02.000Z",
				},
			],
			userItems: [
				{
					content: "One",
					id: "member-one",
					kind: "user",
					timestamp: "2026-08-10T10:00:00.000Z",
				},
				{
					content: "Second",
					id: "member-two",
					kind: "user",
					timestamp: "2026-08-10T10:00:01.000Z",
				},
			],
		},
	};
	const matches = [
		{ index: 0, option: optionWithMemberMessages },
		{ index: 1, option: options[1] },
	];

	test("uses fixed character and sentiment-word columns for Member", () => {
		const rows = buildSessionTurnTableViewRows(
			matches,
			USER_SPEAKERS,
			"member",
		);
		const columns = buildSessionTurnTableColumns(options, "member", rows);

		expect(columns.map((column) => column.label)).toEqual([
			"Characters",
			"Sentiment words",
		]);
		const memberRow = rows[0];
		if (!memberRow) {
			throw new Error("Expected a member table row");
		}
		expect(memberRow.characterCount).toBe(9);
		expect(
			columns[0]?.getValues(memberRow).map((value) => value.label),
		).toEqual(["9"]);
		expect(columns[0]?.getValues(memberRow)[0]?.relativeMagnitude).toBeCloseTo(
			(9 / 1_200) * 100,
		);
		expect(rows[1]?.characterCount).toBe(1_200);
		expect(rows[1] ? columns[0]?.getValues(rows[1])[0]?.label : undefined).toBe(
			"1,200",
		);
		expect(columns[0]?.summary).toEqual({
			label: "1,209",
			title: "1,209 total characters",
		});
		expect(columns[1]?.getValues(memberRow)).toEqual([]);
	});

	test("derives each mini chart from its raw value relative to the visible column maximum", () => {
		const halfMagnitudeOption: SessionTurnTablePaneOption = {
			...options[0],
			key: "turn-half-magnitude",
			metrics: {
				...options[0].metrics,
				inputTokens: 600,
			},
			turnNumber: 2,
		};
		const magnitudeOptions = [options[0], halfMagnitudeOption];
		const magnitudeRows = buildSessionTurnTableViewRows(
			magnitudeOptions.map((option, index) => ({ index, option })),
			MODEL_SPEAKERS,
			"model",
		);
		const columns = buildSessionTurnTableColumns(
			magnitudeOptions,
			"model",
			magnitudeRows,
		);
		const inputColumn = columns.find((column) => column.key === "input");
		const timeColumn = columns.find((column) => column.key === "time");
		const plainNumberColumns = columns.filter((column) =>
			["tools", "errors", "files", "skills"].includes(column.key),
		);
		if (!inputColumn || !timeColumn || plainNumberColumns.length !== 4) {
			throw new Error("Expected charted and uncharted numeric columns");
		}

		expect(
			magnitudeRows.map(
				(row) => inputColumn.getValues(row)[0]?.relativeMagnitude,
			),
		).toEqual([100, 50]);
		expect(
			magnitudeRows.map(
				(row) => timeColumn.getValues(row)[0]?.relativeMagnitude,
			),
		).toEqual([undefined, undefined]);
		expect(
			plainNumberColumns.every((column) =>
				magnitudeRows.every((row) =>
					column
						.getValues(row)
						.every((value) => value.relativeMagnitude === undefined),
				),
			),
		).toBe(true);
		expect(inputColumn.summary).toEqual({
			label: "1.8k",
			title: "1,800 total input tokens",
		});
		const footerMarkup = renderToStaticMarkup(
			createElement(
				"table",
				null,
				createElement(SessionTurnTableFooter, {
					columns,
					gridTemplate: "3.5rem 4.5rem 4rem",
					sessionDurationLabel: "2h 5m",
					turnCount: 2,
				}),
			),
		);
		expect(footerMarkup).toContain("Visible turn totals");
		expect(footerMarkup).toContain("sticky bottom-0");
		expect(footerMarkup).toContain("2x");
		expect(footerMarkup).toContain("2h 5m");
		expect(footerMarkup).toContain("$0.08");
	});

	test("keeps user and model rows chronological while leaving model columns empty for users", () => {
		const rows = buildSessionTurnTableViewRows(matches, ALL_SPEAKERS, "model");
		const modelColumns = buildSessionTurnTableColumns(options, "model");
		const visibleColumns = buildSessionTurnTableColumns(options, "model");

		expect(rows.map((row) => `${row.match.index}:${row.speaker}`)).toEqual([
			"0:member",
			"0:model",
			"1:member",
			"1:model",
		]);
		expect(visibleColumns.map((column) => column.label)).toEqual(
			modelColumns.map((column) => column.label),
		);
		const memberRow = rows[0];
		expect(memberRow).toBeDefined();
		expect(
			visibleColumns.every(
				(column) => memberRow && column.getValues(memberRow).length === 0,
			),
		).toBe(true);
		expect(rows[0]?.toolCallGroups).toEqual([]);
		expect(rows[1]?.toolCallGroups).toEqual([
			{ count: 2, icon: "file", names: ["Read", "Read"], tone: "tomato" },
			{ count: 1, icon: "terminal", names: ["Bash"], tone: "amber" },
		]);
	});

	test("selects only the clicked speaker row when both row types are visible", () => {
		const rows = buildSessionTurnTableViewRows(matches, ALL_SPEAKERS, "model");

		expect(
			getSessionTurnTableSelectedRowKey({
				rows,
				selection: { index: 0, speaker: "model" },
			}),
		).toBe("turn-1:model");
		expect(
			getSessionTurnTableSelectedRowKey({
				rows,
				selection: { index: 0, speaker: "member" },
			}),
		).toBe("turn-1:member");
	});

	test("keeps chronological rows when the User column classification is active", () => {
		const rows = buildSessionTurnTableViewRows(matches, ALL_SPEAKERS, "member");
		const columns = buildSessionTurnTableColumns(options, "member");

		expect(rows.map((row) => `${row.match.index}:${row.speaker}`)).toEqual([
			"0:member",
			"0:model",
			"1:member",
			"1:model",
		]);
		expect(columns.map((column) => column.label)).toEqual([
			"Characters",
			"Sentiment words",
		]);
	});

	test("compacts duration units without a prefix or intervening space", () => {
		const modelRow = buildSessionTurnTableViewRows(
			[{ index: 0, option: optionWithMemberMessages }],
			MODEL_SPEAKERS,
			"model",
		)[0];
		const minuteColumn = buildSessionTurnTableColumns(
			[optionWithMemberMessages],
			"model",
		).find((column) => column.key === "duration");
		if (!modelRow || !minuteColumn) {
			throw new Error("Expected a model row and duration column");
		}
		expect(minuteColumn.getValues(modelRow)[0]?.label).toBe("2m");

		const secondsOption: SessionTurnTablePaneOption = {
			...optionWithMemberMessages,
			timing: {
				...optionWithMemberMessages.timing,
				durationLabel: "45 sec",
				durationSeconds: 45,
			},
		};
		const secondsRow = buildSessionTurnTableViewRows(
			[{ index: 0, option: secondsOption }],
			MODEL_SPEAKERS,
			"model",
		)[0];
		const secondsColumn = buildSessionTurnTableColumns(
			[secondsOption],
			"model",
		).find((column) => column.key === "duration");
		if (!secondsRow || !secondsColumn) {
			throw new Error("Expected a model row and duration column");
		}
		expect(secondsColumn.getValues(secondsRow)[0]?.label).toBe("45s");
	});
});
