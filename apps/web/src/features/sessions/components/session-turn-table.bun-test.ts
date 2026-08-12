import { describe, expect, test } from "bun:test";
import type { SessionTurnTableOption } from "./session-turn-table";
import {
	buildSessionTurnTableFilterOptions,
	buildSessionTurnTableRangeBounds,
	createEmptySessionTurnTableExcludedFilterValues,
	createEmptySessionTurnTableRangeFilterValues,
	filterSessionTurnTableOptions,
	hasActiveSessionTurnTableFilters,
} from "./session-turn-table-filters";

const options: readonly SessionTurnTableOption[] = [
	{
		compactionsBefore: [],
		key: "turn-1",
		metrics: {
			editedFiles: ["src/features/session-table.tsx"],
			errorCount: 2,
			estimatedCost: 0.04,
			inputTokens: 1_200,
			outputTokens: 480,
			skills: ["design"],
			usageEvents: [],
		},
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
		compactionsBefore: [],
		key: "turn-2",
		metrics: {
			editedFiles: [],
			errorCount: 0,
			estimatedCost: undefined,
			inputTokens: undefined,
			outputTokens: undefined,
			skills: ["typescript-standards"],
			usageEvents: [],
		},
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

describe("session turn table filters", () => {
	test("returns every row for empty structured filters", () => {
		const excludedFilters = createEmptySessionTurnTableExcludedFilterValues();
		const rangeFilters = createEmptySessionTurnTableRangeFilterValues();

		expect(
			filterSessionTurnTableOptions(options, excludedFilters, rangeFilters).map(
				({ index }) => index,
			),
		).toEqual([0, 1]);
		expect(
			hasActiveSessionTurnTableFilters(excludedFilters, rangeFilters),
		).toBe(false);
	});

	test("builds file, skill, and command option lists", () => {
		expect(buildSessionTurnTableFilterOptions(options, "files")).toEqual([
			{ label: "No files edited", value: "__no_files__" },
			{
				label: "session-table.tsx",
				value: "src/features/session-table.tsx",
			},
		]);
		expect(
			buildSessionTurnTableFilterOptions(options, "skills").map(
				(option) => option.label,
			),
		).toEqual(["design", "typescript-standards"]);
		expect(
			buildSessionTurnTableFilterOptions(options, "commands").map(
				(option) => option.label,
			),
		).toEqual(["/review", "No commands"]);
	});

	test("builds numeric bounds for range filter controls", () => {
		const bounds = buildSessionTurnTableRangeBounds(options);

		expect(bounds.input).toEqual({ maximum: 1200, minimum: 0, step: 1 });
		expect(bounds.cost).toEqual({ maximum: 0.04, minimum: 0, step: 0.0001 });
		expect(bounds.duration).toEqual({ maximum: 120, minimum: 0, step: 1 });
	});
});
