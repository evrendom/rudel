import { render } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { SessionTurnTable } from "./session-turn-table";
import type { SessionTurnTableColumnKey } from "./session-turn-table-column-options";
import type { SessionTurnTablePaneOption } from "./session-turn-table-pane";
import { buildSessionTurnTableViewRows } from "./session-turn-table-view-rows";

const option: SessionTurnTablePaneOption = {
	compactionsBefore: [],
	key: "turn-with-subagents",
	memberPreview: "Delegate this work",
	metrics: {
		editedFiles: [],
		errorCount: 0,
		errorEvents: [],
		estimatedCost: 1,
		inputTokens: 100,
		outputTokens: 50,
		skillEvents: [],
		skills: [],
		usageEvents: [],
	},
	preview: "Delegated",
	slashCommands: [],
	subagentEvents: [
		{
			at: "2026-08-19T08:00:00.000Z",
			count: 2,
			subagentId: "agent-reviewer",
		},
		{
			at: "2026-08-19T08:01:00.000Z",
			count: 1,
			subagentId: "agent-builder",
		},
	],
	timing: {
		durationLabel: "1 min",
		durationSeconds: 60,
		endTime: "10:01",
		startTime: "10:00",
	},
	toolCallCount: 0,
	turnNumber: 1,
};

describe("SessionTurnTable subagent icons", () => {
	test("renders one tightly stacked model icon per subagent on its model row", () => {
		const visibleOptions = [{ index: 0, option }];
		const rows = buildSessionTurnTableViewRows(
			visibleOptions,
			new Set(["model"]),
			"model",
		);
		const visibleColumnKeys: ReadonlySet<SessionTurnTableColumnKey> = new Set([
			"time",
		]);
		const { container, getByRole } = render(
			<SessionTurnTable
				model="claude-fable-5"
				onSelect={vi.fn()}
				onSort={vi.fn()}
				options={[option]}
				primarySpeaker="model"
				rows={rows}
				selection={{ index: 0, speaker: "model" }}
				sessionDurationLabel="1m"
				showSpeakerColumn
				speakerVisibilityControls={null}
				sort={{ direction: "asc", key: "time" }}
				visibleColumnKeys={visibleColumnKeys}
				visibleOptions={visibleOptions}
			/>,
		);

		expect(rows[0]?.subagentCount).toBe(3);
		expect(
			container.querySelector('[data-subagent-icon-count="3"]'),
		).not.toBeNull();
		expect(
			container.querySelectorAll("[data-subagent-model-icon]"),
		).toHaveLength(3);
		expect(
			getByRole("cell", { name: "claude-fable-5 with 3 subagents" }),
		).toBeInTheDocument();
	});
});
