import { act, render } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, test, vi } from "vitest";
import {
	SessionTurnTable,
	type SessionTurnTableOption,
	type SessionTurnTableSpeaker,
	type SessionTurnTableVirtualizerHandle,
} from "./session-turn-table";
import type { SessionTurnTableColumnKey } from "./session-turn-table-column-options";

const VISIBLE_COLUMNS: ReadonlySet<SessionTurnTableColumnKey> = new Set([
	"time",
]);
const VISIBLE_SPEAKERS: ReadonlySet<SessionTurnTableSpeaker> = new Set([
	"model",
]);

function createOption(index: number): SessionTurnTableOption {
	return {
		compactionsBefore: [],
		key: `turn-${index}`,
		metrics: {
			editedFiles: [],
			errorCount: 0,
			errorEvents: [],
			estimatedCost: undefined,
			inputTokens: index,
			outputTokens: index,
			skills: [],
			skillEvents: [],
			usageEvents: [],
		},
		slashCommands: [],
		timing: {
			durationLabel: undefined,
			durationSeconds: undefined,
			endTime: "",
			startTime: `${index}:00`,
		},
		toolCallCount: 0,
		turnNumber: index + 1,
	};
}

function renderTable(
	options: readonly SessionTurnTableOption[],
	virtualizerRef = createRef<SessionTurnTableVirtualizerHandle>(),
) {
	return {
		...render(
			<SessionTurnTable
				model={undefined}
				onPrimarySpeakerChange={vi.fn()}
				onSelect={vi.fn()}
				onSort={vi.fn()}
				options={options}
				selection={{ index: 0, speaker: "model" }}
				sort={{ direction: "asc", key: "time" }}
				virtualizerRef={virtualizerRef}
				visibleColumnKeys={VISIBLE_COLUMNS}
				visibleOptions={options.map((option, index) => ({ index, option }))}
				visibleSpeakers={VISIBLE_SPEAKERS}
			/>,
		),
		virtualizerRef,
	};
}

describe("SessionTurnTable rendering", () => {
	test("renders every loaded row in normal document flow", () => {
		const options = Array.from({ length: 1_000 }, (_, index) =>
			createOption(index),
		);
		const { container } = renderTable(options);

		expect(container.querySelectorAll("tr[data-turn-index]")).toHaveLength(
			1_000,
		);
		expect(container.querySelector("tbody[aria-hidden='true']")).toBeNull();
	});

	test("scrolls the exact selected speaker row into view", () => {
		const scrollIntoView = vi.fn();
		Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
			configurable: true,
			value: scrollIntoView,
		});
		const { container, virtualizerRef } = renderTable([
			createOption(0),
			createOption(1),
		]);

		act(() => {
			virtualizerRef.current?.scrollToSelection(
				{ index: 1, speaker: "model" },
				{ behavior: "smooth" },
			);
		});

		expect(
			container.querySelector('[data-turn-index="1"][data-speaker="model"]'),
		).not.toBeNull();
		expect(scrollIntoView).toHaveBeenCalledWith({
			behavior: "smooth",
			block: "nearest",
		});
	});
});
