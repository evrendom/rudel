import { act, createEvent, fireEvent, render } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, test, vi } from "vitest";
import {
	SessionTurnTable,
	type SessionTurnTableOption,
	type SessionTurnTableRow,
	type SessionTurnTableSpeaker,
	type SessionTurnTableVirtualizerHandle,
} from "./session-turn-table";
import type { SessionTurnTableColumnKey } from "./session-turn-table-column-options";
import { SessionTurnTableSpeakerVisibilityControls } from "./session-turn-table-view-tabs";

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
	onPrefetchTurn?: (turnId: string, immediate: boolean) => void,
	onSelect: (selection: {
		index: number;
		speaker: SessionTurnTableSpeaker;
	}) => void = vi.fn(),
) {
	function TableHarness() {
		return (
			<SessionTurnTable
				model={undefined}
				onPrefetchTurn={onPrefetchTurn}
				onSelect={onSelect}
				onSort={vi.fn()}
				options={options}
				primarySpeaker="model"
				rows={rows}
				selection={{ index: 0, speaker: "model" }}
				sessionDurationLabel="2h 5m"
				showSpeakerHighlights={showSpeakerHighlights}
				speakerVisibilityControls={null}
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
		virtualizerRef,
	};
}

describe("SessionTurnTable rendering", () => {
	test("selects only primary button-zero pointer presses", () => {
		const onPrefetchTurn = vi.fn();
		const onSelect = vi.fn();
		const { container } = renderTable(
			[createOption(0)],
			createRef<SessionTurnTableVirtualizerHandle>(),
			undefined,
			true,
			[],
			onPrefetchTurn,
			onSelect,
		);
		const row = container.querySelector<HTMLTableRowElement>(
			'[data-turn-index="0"]',
		);
		if (!row) {
			throw new Error("Expected the first turn row");
		}
		const pressRow = (button: number, isPrimary: boolean) => {
			const event = createEvent.pointerDown(row);
			Object.defineProperties(event, {
				button: { value: button },
				isPrimary: { value: isPrimary },
			});
			fireEvent(row, event);
		};

		fireEvent.pointerEnter(row);
		pressRow(0, true);
		fireEvent.click(row);
		pressRow(2, true);
		pressRow(0, false);

		expect(onPrefetchTurn).toHaveBeenNthCalledWith(1, "turn-0", false);
		expect(onPrefetchTurn).toHaveBeenNthCalledWith(2, "turn-0", true);
		expect(onPrefetchTurn).toHaveBeenCalledTimes(4);
		expect(onSelect).toHaveBeenCalledTimes(1);
		expect(onSelect).toHaveBeenCalledWith({ index: 0, speaker: "model" });

		fireEvent.keyDown(row, { key: "Enter" });
		expect(onSelect).toHaveBeenCalledTimes(2);
	});

	test("uses one overlapping trigger to open the speaker visibility menu", async () => {
		const onVisibleSpeakersChange =
			vi.fn<(speakers: ReadonlySet<SessionTurnTableSpeaker>) => void>();
		const { container, findByRole, getByRole, rerender } = render(
			<SessionTurnTableSpeakerVisibilityControls
				className={undefined}
				model="claude-fable-5"
				onPrimarySpeakerChange={vi.fn()}
				onVisibleSpeakersChange={onVisibleSpeakersChange}
				primarySpeaker="model"
				userImageUrl={undefined}
				userLabel="Evren"
				visibleSpeakers={new Set<SessionTurnTableSpeaker>(["member", "model"])}
			/>,
		);
		const trigger = getByRole("button", {
			name: "Choose visible rows: Evren and Fable 5",
		});

		expect(
			container.querySelectorAll("[data-turn-table-speaker-trigger-icon]"),
		).toHaveLength(2);
		expect(container.querySelector("[data-speaker-check]")).toBeNull();
		fireEvent.click(trigger);
		const userItem = await findByRole("menuitemcheckbox", { name: "Evren" });
		const modelItem = await findByRole("menuitemcheckbox", { name: "Fable 5" });
		fireEvent.click(userItem);

		expect(onVisibleSpeakersChange).toHaveBeenCalledTimes(1);
		expect(onVisibleSpeakersChange).toHaveBeenCalledWith(new Set(["model"]));
		rerender(
			<SessionTurnTableSpeakerVisibilityControls
				className={undefined}
				model="claude-fable-5"
				onPrimarySpeakerChange={vi.fn()}
				onVisibleSpeakersChange={onVisibleSpeakersChange}
				primarySpeaker="model"
				userImageUrl={undefined}
				userLabel="Evren"
				visibleSpeakers={new Set<SessionTurnTableSpeaker>(["model"])}
			/>,
		);
		expect(userItem).toHaveClass("opacity-40");
		expect(modelItem).not.toHaveClass("opacity-40");
		expect(modelItem).not.toHaveAttribute("data-disabled");
		expect(
			container.querySelector(
				'[data-turn-table-speaker-trigger-icon="member"]',
			),
		).toHaveClass("saturate-0", "opacity-35");
		expect(
			container.querySelector('[data-turn-table-speaker-trigger-icon="model"]'),
		).not.toHaveClass("saturate-0", "opacity-35");
	});

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
		expect(container.querySelector("tfoot")).toBeNull();
		expect(container.querySelector("thead")?.textContent).not.toContain(
			"2h 5m",
		);
	}, 15_000);

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
				key: "turn-0:model",
				match: { index: 0, option },
				memberText: undefined,
				signalCount: 0,
				speaker: "model",
				subagentCount: 0,
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
		const viewedRow = container.querySelector<HTMLElement>(
			'tr[data-viewed="true"]',
		);
		expect(scrollElement).not.toBeNull();
		expect(header).not.toBeNull();
		expect(viewedRow).not.toBeNull();
		if (!scrollElement || !header || !viewedRow) {
			throw new Error("Expected the ledger viewport and viewed row to render");
		}

		vi.spyOn(scrollElement, "getBoundingClientRect").mockReturnValue(
			new DOMRect(0, 0, 400, 200),
		);
		vi.spyOn(header, "getBoundingClientRect").mockReturnValue(
			new DOMRect(0, 0, 400, 32),
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
				key: "turn-0:model",
				match: { index: 0, option },
				memberText: undefined,
				signalCount: 0,
				speaker: "model",
				subagentCount: 0,
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
				key: "turn-0:member",
				match: { index: 0, option },
				memberText: "Member message",
				signalCount: 0,
				speaker: "member",
				subagentCount: 0,
				toolCallGroups: [],
			},
			{
				key: "turn-0:model",
				match: { index: 0, option },
				memberText: undefined,
				signalCount: 0,
				speaker: "model",
				subagentCount: 0,
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

	test("keeps model titles while preserving user and model row structures", () => {
		const options = [createOption(0), createOption(1)];
		const rows: readonly SessionTurnTableRow[] = options.flatMap(
			(option, index) => [
				{
					key: `${option.key}:member`,
					match: { index, option },
					memberText: `Member message ${index}`,
					signalCount: 0,
					speaker: "member" as const,
					subagentCount: 0,
					toolCallGroups: [],
				},
				{
					key: `${option.key}:model`,
					match: { index, option },
					memberText: undefined,
					signalCount: 0,
					speaker: "model" as const,
					subagentCount: 0,
					toolCallGroups: [],
				},
			],
		);
		const { container, queryByRole } = renderTable(
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
		).toContain("Member message 0");
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
		).toHaveLength(11);
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

		expect(
			queryByRole("button", { name: "Show User column titles" }),
		).toBeNull();
		expect(
			queryByRole("button", { name: "Show Model column titles" }),
		).toBeNull();
		expect(container.querySelector("thead")?.textContent).toContain("Time");
		expect(container.querySelector("thead")?.textContent).toContain("Length");
		expect(container.querySelector("thead")?.textContent).toContain("Input");
		expect(container.querySelector("thead")?.textContent).not.toContain("Text");
		expect(getBodyValues()).toEqual(initialBodyValues);
		expect(
			container.querySelectorAll(
				'[data-speaker="model"][data-speaker-emphasized="true"]',
			),
		).toHaveLength(2);
		expect(
			Array.from(container.querySelectorAll("tr[data-turn-index]")).map(
				(row) =>
					`${row.getAttribute("data-turn-index")}:${row.getAttribute("data-speaker")}`,
			),
		).toEqual(initialRowKeys);
	});
});
