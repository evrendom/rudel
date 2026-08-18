import { act, fireEvent, render } from "@testing-library/react";
import { createRef, useState } from "react";
import { describe, expect, test, vi } from "vitest";
import {
	SessionTurnTable,
	type SessionTurnTableOption,
	type SessionTurnTableRow,
	type SessionTurnTableVirtualizerHandle,
} from "./session-turn-table";
import type { SessionTurnTableColumnKey } from "./session-turn-table-column-options";

const VISIBLE_COLUMNS: ReadonlySet<SessionTurnTableColumnKey> = new Set([
	"time",
	"duration",
	"input",
	"output",
	"cost",
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
	rows?: readonly SessionTurnTableRow[],
	showSpeakerHighlights = true,
	viewedSelections: readonly {
		index: number;
		speaker: "member" | "model";
	}[] = [],
) {
	const onPrimarySpeakerChange = vi.fn();
	function TableHarness() {
		const [primarySpeaker, setPrimarySpeaker] = useState<"member" | "model">(
			"model",
		);

		function handlePrimarySpeakerChange(speaker: "member" | "model") {
			onPrimarySpeakerChange(speaker);
			setPrimarySpeaker(speaker);
		}

		return (
			<SessionTurnTable
				model={undefined}
				onPrimarySpeakerChange={handlePrimarySpeakerChange}
				onSelect={vi.fn()}
				onSort={vi.fn()}
				options={options}
				primarySpeaker={primarySpeaker}
				rows={rows}
				selection={{ index: 0, speaker: "model" }}
				sessionDurationLabel="2h 5m"
				showSpeakerHighlights={showSpeakerHighlights}
				sort={{ direction: "asc", key: "time" }}
				virtualizerRef={virtualizerRef}
				visibleColumnKeys={VISIBLE_COLUMNS}
				visibleOptions={options.map((option, index) => ({ index, option }))}
				viewedSelections={viewedSelections}
			/>
		);
	}

	return {
		...render(<TableHarness />),
		onPrimarySpeakerChange,
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
		expect(
			container.querySelector('button[aria-label="Sort by Time, descending"]'),
		).not.toBeNull();
		expect(container.querySelector("tfoot")?.textContent).toContain("1,000x");
		expect(container.querySelector("tfoot")?.textContent).toContain("2h 5m");
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

	test("returns to transcript-visible rows above or below the ledger viewport", () => {
		const option = createOption(0);
		const rows: readonly SessionTurnTableRow[] = [
			{
				characterCount: undefined,
				key: "turn-0:model",
				match: { index: 0, option },
				sentimentWords: [],
				speaker: "model",
				toolCallGroups: [],
			},
		];
		const { container, getByRole } = renderTable(
			[option],
			createRef<SessionTurnTableVirtualizerHandle>(),
			rows,
			false,
			[{ index: 0, speaker: "model" }],
		);
		const scrollElement = container.querySelector<HTMLElement>(
			"[data-session-turn-table-scroll]",
		);
		const header = container.querySelector<HTMLElement>("thead");
		const footer = container.querySelector<HTMLElement>("tfoot");
		const viewedRow = container.querySelector<HTMLElement>(
			'tr[data-viewed="true"]',
		);
		expect(scrollElement).not.toBeNull();
		expect(header).not.toBeNull();
		expect(footer).not.toBeNull();
		expect(viewedRow).not.toBeNull();
		if (!scrollElement || !header || !footer || !viewedRow) {
			throw new Error("Expected the ledger viewport and viewed row to render");
		}

		vi.spyOn(scrollElement, "getBoundingClientRect").mockReturnValue(
			new DOMRect(0, 0, 400, 200),
		);
		vi.spyOn(header, "getBoundingClientRect").mockReturnValue(
			new DOMRect(0, 0, 400, 32),
		);
		vi.spyOn(footer, "getBoundingClientRect").mockReturnValue(
			new DOMRect(0, 164, 400, 36),
		);
		const viewedRowRect = vi
			.spyOn(viewedRow, "getBoundingClientRect")
			.mockReturnValue(new DOMRect(0, 240, 400, 36));
		const scrollIntoView = vi.fn();
		Object.defineProperty(viewedRow, "scrollIntoView", {
			configurable: true,
			value: scrollIntoView,
		});

		fireEvent.scroll(scrollElement);
		fireEvent.click(
			getByRole("button", {
				name: "Scroll down to visible transcript rows",
			}),
		);
		expect(scrollIntoView).toHaveBeenCalledWith({
			behavior: "smooth",
			block: "center",
		});

		viewedRowRect.mockReturnValue(new DOMRect(0, -50, 400, 36));
		fireEvent.scroll(scrollElement);
		expect(
			getByRole("button", {
				name: "Scroll up to visible transcript rows",
			}),
		).not.toBeNull();
	});

	test("keeps single-speaker row fills flat while pressing its viewed key", () => {
		const option = createOption(0);
		const options = [option];
		const rows: readonly SessionTurnTableRow[] = [
			{
				characterCount: undefined,
				key: "turn-0:model",
				match: { index: 0, option },
				sentimentWords: [],
				speaker: "model",
				toolCallGroups: [],
			},
		];
		const { container } = renderTable(
			options,
			createRef<SessionTurnTableVirtualizerHandle>(),
			rows,
			false,
			[{ index: 0, speaker: "model" }],
		);

		expect(
			container.querySelectorAll('[data-speaker-emphasized="true"]'),
		).toHaveLength(0);
		expect(
			container.querySelectorAll('[data-highlighted="true"]'),
		).toHaveLength(1);
		expect(
			container.querySelectorAll(
				'[data-viewed-indicator-group][data-pressed="true"]',
			),
		).toHaveLength(1);
	});

	test("presses every User and Model indicator currently viewed", () => {
		const option = createOption(0);
		const rows: readonly SessionTurnTableRow[] = [
			{
				characterCount: 42,
				key: "turn-0:member",
				match: { index: 0, option },
				sentimentWords: [],
				speaker: "member",
				toolCallGroups: [],
			},
			{
				characterCount: undefined,
				key: "turn-0:model",
				match: { index: 0, option },
				sentimentWords: [],
				speaker: "model",
				toolCallGroups: [],
			},
		];
		const { container } = renderTable(
			[option],
			createRef<SessionTurnTableVirtualizerHandle>(),
			rows,
			false,
			[
				{ index: 0, speaker: "member" },
				{ index: 0, speaker: "model" },
			],
		);

		expect(container.querySelectorAll('[data-viewed="true"]')).toHaveLength(2);
		expect(
			container.querySelectorAll('[data-highlighted="true"]'),
		).toHaveLength(2);
		const indicators = Array.from(
			container.querySelectorAll<HTMLElement>("[data-viewed-indicator]"),
		);
		expect(indicators).toHaveLength(2);
		expect(indicators.every((indicator) => !indicator.dataset.pressed)).toBe(
			true,
		);
		const indicatorGroups = Array.from(
			container.querySelectorAll<HTMLElement>("[data-viewed-indicator-group]"),
		);
		expect(indicatorGroups).toHaveLength(1);
		expect(indicatorGroups[0]).toHaveAttribute("data-row-count", "2");
		expect(indicatorGroups[0]).toHaveAttribute("data-first-visible-index", "0");
		expect(indicatorGroups[0]).toHaveAttribute("data-last-visible-index", "1");
		expect(
			indicators.every(
				(indicator) => !indicator.className.includes("transition"),
			),
		).toBe(true);
	});

	test("changes the emphasized speaker rows without changing their values", () => {
		const options = [createOption(0), createOption(1)];
		const rows: readonly SessionTurnTableRow[] = options.flatMap(
			(option, index) => [
				{
					characterCount: 42 + index,
					key: `${option.key}:member`,
					match: { index, option },
					sentimentWords: [],
					speaker: "member" as const,
					toolCallGroups: [],
				},
				{
					characterCount: undefined,
					key: `${option.key}:model`,
					match: { index, option },
					sentimentWords: [],
					speaker: "model" as const,
					toolCallGroups: [],
				},
			],
		);
		const { container, getByRole, onPrimarySpeakerChange } = renderTable(
			options,
			createRef<SessionTurnTableVirtualizerHandle>(),
			rows,
		);
		const getBodyValues = () =>
			Array.from(container.querySelectorAll("tr[data-turn-index]")).map(
				(row) => row.textContent,
			);
		const initialBodyValues = getBodyValues();
		const initialRowKeys = Array.from(
			container.querySelectorAll("tr[data-turn-index]"),
		).map(
			(row) =>
				`${row.getAttribute("data-turn-index")}:${row.getAttribute("data-speaker")}`,
		);
		expect(
			container.querySelector('[data-speaker="member"]')?.textContent,
		).toContain("42");
		expect(
			container.querySelector('[data-speaker="model"]')?.textContent,
		).toContain("0:00");
		expect(
			container
				.querySelector('[data-speaker="member"]')
				?.querySelectorAll(":scope > td"),
		).toHaveLength(4);
		expect(
			container
				.querySelector('[data-speaker="member"]')
				?.querySelector(":scope > td:first-child [data-viewed-indicator]"),
		).not.toBeNull();
		expect(
			container
				.querySelector('[data-speaker="model"]')
				?.querySelectorAll(":scope > td"),
		).toHaveLength(7);
		expect(
			container.querySelectorAll(
				'[data-speaker="model"][data-speaker-emphasized="true"]',
			),
		).toHaveLength(2);
		expect(
			container.querySelectorAll(
				'[data-speaker="member"][data-speaker-emphasized="true"]',
			),
		).toHaveLength(0);
		expect(container.querySelectorAll('[data-selected="true"]')).toHaveLength(
			1,
		);

		fireEvent.click(getByRole("button", { name: "Show User column titles" }));

		expect(onPrimarySpeakerChange).toHaveBeenCalledWith("member");
		expect(
			getByRole("button", { name: "Show User column titles" }),
		).toHaveAttribute("aria-pressed", "true");
		expect(container.querySelector("thead")?.textContent).toContain(
			"Characters",
		);
		expect(container.querySelector("thead")?.textContent).toContain(
			"Sentiment words",
		);
		expect(getBodyValues()).toEqual(initialBodyValues);
		expect(
			container.querySelectorAll(
				'[data-speaker="member"][data-speaker-emphasized="true"]',
			),
		).toHaveLength(2);
		expect(
			container.querySelectorAll(
				'[data-speaker="model"][data-speaker-emphasized="true"]',
			),
		).toHaveLength(0);
		expect(
			Array.from(container.querySelectorAll("tr[data-turn-index]")).map(
				(row) =>
					`${row.getAttribute("data-turn-index")}:${row.getAttribute("data-speaker")}`,
			),
		).toEqual(initialRowKeys);
	});
});
