import { describe, expect, test } from "bun:test";
import { buildSessionTurnTableColumns } from "./session-turn-table-columns";
import {
	createEmptySessionTurnTableExcludedFilterValues,
	createEmptySessionTurnTableRangeFilterValues,
	filterSessionTurnTableOptions,
	sortSessionTurnTableOptions,
} from "./session-turn-table-filters";
import type { SessionTurnTablePaneOption } from "./session-turn-table-pane";
import { buildSessionTurnTableViewRows } from "./session-turn-table-view-rows";
import { getNextSessionTurnTableView } from "./session-turn-table-view-tabs";
import { getSessionTurnMemberPreview, type SessionTurn } from "./session-turns";

const compaction = {
	key: "compaction-before-turn-2",
	timestamp: "2026-08-10T10:04:00.000Z",
};

const options: readonly SessionTurnTablePaneOption[] = [
	{
		compactionsBefore: [],
		key: "turn-1",
		memberPreview: "Alpha member request",
		metrics: {
			editedFiles: ["src/alpha.ts"],
			errorCount: 1,
			estimatedCost: 0.04,
			inputTokens: 1_200,
			outputTokens: 480,
			skills: ["design"],
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
		memberPreview: "Beta member request",
		metrics: {
			editedFiles: [],
			errorCount: 0,
			estimatedCost: undefined,
			inputTokens: undefined,
			outputTokens: undefined,
			skills: [],
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
	test("cycles through Model, Member, and Both tabs", () => {
		expect(getNextSessionTurnTableView("model", "ArrowRight")).toBe("member");
		expect(getNextSessionTurnTableView("member", "ArrowRight")).toBe("both");
		expect(getNextSessionTurnTableView("both", "ArrowRight")).toBe("model");
		expect(getNextSessionTurnTableView("model", "ArrowLeft")).toBe("both");
		expect(getNextSessionTurnTableView("both", "Home")).toBe("model");
		expect(getNextSessionTurnTableView("model", "End")).toBe("both");
	});

	test("filters turns by option and numeric metadata", () => {
		const excludedFilters = createEmptySessionTurnTableExcludedFilterValues();
		const rangeFilters = createEmptySessionTurnTableRangeFilterValues();

		expect(
			filterSessionTurnTableOptions(
				options,
				{ ...excludedFilters, commands: new Set(["/review"]) },
				rangeFilters,
			).map((match) => match.index),
		).toEqual([1]);
		expect(
			filterSessionTurnTableOptions(options, excludedFilters, {
				...rangeFilters,
				errors: { maximum: null, minimum: 1 },
			}).map((match) => match.index),
		).toEqual([0]);
	});

	test("sorts while keeping original row indices and compaction assignments", () => {
		const matches = sortSessionTurnTableOptions(
			filterSessionTurnTableOptions(
				options,
				createEmptySessionTurnTableExcludedFilterValues(),
				createEmptySessionTurnTableRangeFilterValues(),
			),
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
			responseItems: [],
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

	test("uses fixed character and negative-signal columns for Member", () => {
		const rows = buildSessionTurnTableViewRows(matches, "member");
		const columns = buildSessionTurnTableColumns(options, "member");

		expect(columns.map((column) => column.label)).toEqual([
			"Characters",
			"Negative signals",
		]);
		const memberRow = rows[0];
		if (!memberRow) {
			throw new Error("Expected a member table row");
		}
		expect(memberRow.characterCount).toBe(9);
		expect(
			columns[0]?.getValues(memberRow).map((value) => value.label),
		).toEqual(["9"]);
		expect(columns[1]?.getValues(memberRow)).toEqual([]);
	});

	test("interleaves member and model rows while leaving model columns empty for members", () => {
		const rows = buildSessionTurnTableViewRows(matches, "both");
		const modelColumns = buildSessionTurnTableColumns(options, "model");
		const bothColumns = buildSessionTurnTableColumns(options, "both");

		expect(rows.map((row) => `${row.match.index}:${row.speaker}`)).toEqual([
			"0:member",
			"0:model",
			"1:member",
			"1:model",
		]);
		expect(bothColumns.map((column) => column.label)).toEqual(
			modelColumns.map((column) => column.label),
		);
		const memberRow = rows[0];
		expect(memberRow).toBeDefined();
		expect(
			bothColumns.every(
				(column) => memberRow && column.getValues(memberRow).length === 0,
			),
		).toBe(true);
	});
});
