import { render } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import {
	SessionTurnTable,
	type SessionTurnTableOption,
	type SessionTurnTableRow,
} from "./session-turn-table";
import type { SessionTurnTableColumnKey } from "./session-turn-table-column-options";

const VISIBLE_COLUMNS: ReadonlySet<SessionTurnTableColumnKey> = new Set([
	"time",
	"duration",
	"input",
	"output",
	"cost",
	"errors",
	"files",
	"skills",
	"signals",
]);

function createOption(
	index: number,
	values: {
		cost: number;
		duration: number;
		errors: number;
		files: readonly string[];
		input: number;
		output: number;
		skills: readonly string[];
		tools: number;
	},
): SessionTurnTableOption {
	return {
		compactionsBefore: [],
		key: `turn-${index}`,
		metrics: {
			editedFiles: values.files,
			errorCount: values.errors,
			errorEvents: [],
			estimatedCost: values.cost,
			inputTokens: values.input,
			outputTokens: values.output,
			skills: values.skills,
			skillEvents: [],
			usageEvents: [],
		},
		slashCommands: [],
		timing: {
			durationLabel: undefined,
			durationSeconds: values.duration,
			endTime: "",
			startTime: `${index}:00`,
		},
		toolCallCount: values.tools,
		turnNumber: index + 1,
	};
}

describe("SessionTurnTable header labels", () => {
	test("shows column labels without compact session totals or a footer", () => {
		const options = [
			createOption(0, {
				cost: 0.25,
				duration: 60,
				errors: 1,
				files: ["src/first.ts"],
				input: 1_000,
				output: 200,
				skills: ["design"],
				tools: 3,
			}),
			createOption(1, {
				cost: 0.5,
				duration: 30,
				errors: 2,
				files: ["src/second.ts", "src/third.ts"],
				input: 500,
				output: 100,
				skills: ["testing", "typescript"],
				tools: 1,
			}),
		] satisfies readonly SessionTurnTableOption[];
		const rows = options.map(
			(option, index): SessionTurnTableRow => ({
				key: `${option.key}:model`,
				match: { index, option },
				memberText: undefined,
				signalCount: index + 1,
				speaker: "model",
				subagentCount: 0,
				toolCallGroups: [],
			}),
		);
		const { container, getByRole, queryByRole } = render(
			<SessionTurnTable
				model={undefined}
				onSelect={vi.fn()}
				onSort={vi.fn()}
				options={options}
				primarySpeaker="model"
				rows={rows}
				selection={{ index: 0, speaker: "model" }}
				sessionDurationLabel="2h 5m"
				speakerVisibilityControls={null}
				sort={{ direction: "asc", key: "time" }}
				visibleColumnKeys={VISIBLE_COLUMNS}
				visibleOptions={options.map((option, index) => ({ index, option }))}
			/>,
		);

		const timeHeader = getByRole("button", {
			name: "Sort by Time, descending",
		});
		expect(timeHeader).toHaveTextContent("Time");
		expect(timeHeader.querySelector("[data-sort-label-row]")).toHaveTextContent(
			"Time",
		);
		expect(timeHeader).not.toHaveTextContent("2h 5m");
		expect(
			getByRole("button", { name: "Sort by Length, ascending" }),
		).toHaveTextContent("Length");
		expect(
			getByRole("button", { name: "Sort by Input, ascending" }),
		).toHaveTextContent("Input");
		expect(
			getByRole("button", { name: "Sort by Output, ascending" }),
		).toHaveTextContent("Output");
		expect(
			getByRole("button", { name: "Sort by Cost, ascending" }),
		).toHaveTextContent("Cost");
		expect(
			queryByRole("button", { name: "Sort by Tools, ascending" }),
		).toBeNull();
		expect(
			getByRole("button", { name: "Sort by Errors, ascending" }),
		).toHaveTextContent("Errors");
		expect(
			getByRole("button", { name: "Sort by Files, ascending" }),
		).toHaveTextContent("Files");
		expect(
			getByRole("button", { name: "Sort by Skills, ascending" }),
		).toHaveTextContent("Skills");
		expect(getByRole("columnheader", { name: "Signals" })).toBeInTheDocument();
		expect(container.querySelector("thead small")).toBeNull();
		expect(container.querySelector("tfoot")).toBeNull();
	});
});
