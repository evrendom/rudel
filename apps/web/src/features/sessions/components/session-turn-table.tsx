import { ChevronDown, ChevronUp } from "lucide-react";
import {
	type CSSProperties,
	type KeyboardEvent,
	type Ref,
	useCallback,
	useImperativeHandle,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useMountEffect } from "@/app/hooks/useMountEffect";
import type { ToolIconName } from "@/components/conversation/conversation-tools";
import type { TraceIconTone } from "@/components/conversation/conversation-trace-icons";
import type { SessionCompaction } from "./session-compactions";
import type { SessionTurnEpisode } from "./session-turn-episodes";
import type { SessionTurnMetrics } from "./session-turn-metadata";
import { SessionTurnTableBody } from "./session-turn-table-body";
import {
	isSessionTurnTableColumnVisible,
	type SessionTurnTableColumnKey,
} from "./session-turn-table-column-options";
import { buildSessionTurnTableColumns } from "./session-turn-table-columns";
import type {
	SessionTurnTableSortKey,
	SessionTurnTableSortState,
} from "./session-turn-table-filters";
import { SessionTurnTableFooter } from "./session-turn-table-footer";
import {
	getSessionTurnTableSelectedRowKey,
	type SessionTurnSelection,
	type SessionTurnTableSpeaker,
} from "./session-turn-table-selection";
import { SessionTurnTableSortableHeader } from "./session-turn-table-sortable-header";
import { SessionTurnTableSpeakerFocusToggle } from "./session-turn-table-view-tabs";
import "./session-constellation-tree.css";

export type SessionTurnTableOption = {
	compactionsBefore: readonly SessionCompaction[];
	key: string;
	metrics: SessionTurnMetrics;
	slashCommands: readonly string[];
	timing: {
		durationLabel: string | undefined;
		durationSeconds: number | undefined;
		endTime: string;
		endTimestamp?: string;
		startTime: string;
		startTimestamp?: string;
	};
	toolCallCount: number;
	turnNumber: number | undefined;
};

type SessionTurnTableMatch = {
	index: number;
	option: SessionTurnTableOption;
};

export type SessionTurnTableToolCallGroup = {
	count: number;
	icon: ToolIconName;
	names: readonly string[];
	tone: TraceIconTone;
};

export type { SessionTurnTableSpeaker } from "./session-turn-table-selection";

export type SessionTurnTableVirtualizerHandle = {
	scrollToSelection: (
		selection: SessionTurnSelection,
		options?: { behavior?: ScrollBehavior },
	) => void;
};

export type SessionTurnTableRow = {
	characterCount: number | undefined;
	key: string;
	match: SessionTurnTableMatch;
	sentimentWords: readonly string[];
	speaker: SessionTurnTableSpeaker;
	toolCallGroups: readonly SessionTurnTableToolCallGroup[];
};

const GRID_TRACK_BY_WIDTH_CLASS: Readonly<Record<string, string>> = {
	"w-12": "minmax(3rem, 12fr)",
	"w-16": "minmax(4rem, 16fr)",
	"w-18": "minmax(4.5rem, 18fr)",
	"w-20": "minmax(5rem, 20fr)",
	"w-24": "minmax(6rem, 24fr)",
	"w-28": "minmax(7rem, 28fr)",
	"w-32": "minmax(8rem, 32fr)",
};

function getSessionTurnGridTemplate(
	columns: readonly { widthClassName: string }[],
) {
	return [
		"0.375rem",
		"minmax(3.5rem, 8fr)",
		...columns.map(
			(column) =>
				GRID_TRACK_BY_WIDTH_CLASS[column.widthClassName] ??
				"minmax(4rem, 16fr)",
		),
	].join(" ");
}

function getSessionTurnGridStyle(gridTemplate: string) {
	return {
		"--session-turn-grid-template": gridTemplate,
	} as CSSProperties;
}

type SessionTurnTableProps = {
	collapsedEpisodeKeys?: ReadonlySet<string>;
	episodes?: readonly SessionTurnEpisode[];
	matchedIndices?: ReadonlySet<number>;
	model: string | undefined;
	onEpisodeToggle?: (key: string) => void;
	onPrimarySpeakerChange: (speaker: SessionTurnTableSpeaker) => void;
	onSort: (sortKey: SessionTurnTableSortKey) => void;
	onSelect: (selection: SessionTurnSelection) => void;
	options: readonly SessionTurnTableOption[];
	primarySpeaker?: SessionTurnTableSpeaker;
	rows?: readonly SessionTurnTableRow[];
	selection: SessionTurnSelection;
	sessionDurationLabel: string;
	showSpeakerHighlights?: boolean;
	sort: SessionTurnTableSortState;
	userImageUrl?: string;
	userLabel?: string;
	visibleOptions: readonly SessionTurnTableMatch[];
	visibleColumnKeys: ReadonlySet<SessionTurnTableColumnKey>;
	viewportRange?: readonly [number, number];
	viewedSelections?: readonly SessionTurnSelection[];
	virtualizerRef?: Ref<SessionTurnTableVirtualizerHandle>;
};

type ViewedRowsOffscreenDirection = "above" | "below" | undefined;

function getViewedRows(
	scrollElement: HTMLDivElement,
): readonly HTMLTableRowElement[] {
	return Array.from(
		scrollElement.querySelectorAll<HTMLTableRowElement>(
			'tr[data-viewed="true"][data-visible-index]',
		),
	);
}

function getViewedRowsOffscreenDirection(
	scrollElement: HTMLDivElement,
): ViewedRowsOffscreenDirection {
	const viewedRows = getViewedRows(scrollElement);
	if (viewedRows.length === 0) {
		return undefined;
	}

	const scrollRect = scrollElement.getBoundingClientRect();
	const headerRect = scrollElement
		.querySelector<HTMLElement>("thead")
		?.getBoundingClientRect();
	const footerRect = scrollElement
		.querySelector<HTMLElement>("tfoot")
		?.getBoundingClientRect();
	const viewportTop = Math.max(
		scrollRect.top,
		headerRect?.bottom ?? scrollRect.top,
	);
	const viewportBottom = Math.min(
		scrollRect.bottom,
		footerRect?.top ?? scrollRect.bottom,
	);
	const viewedTop = Math.min(
		...viewedRows.map((row) => row.getBoundingClientRect().top),
	);
	const viewedBottom = Math.max(
		...viewedRows.map((row) => row.getBoundingClientRect().bottom),
	);

	if (viewedBottom < viewportTop) {
		return "above";
	}
	if (viewedTop > viewportBottom) {
		return "below";
	}
	return undefined;
}

export function SessionTurnTable({
	collapsedEpisodeKeys,
	episodes,
	matchedIndices,
	model,
	onEpisodeToggle,
	onPrimarySpeakerChange,
	onSort,
	onSelect,
	options,
	primarySpeaker = "model",
	rows,
	selection,
	sessionDurationLabel,
	showSpeakerHighlights = true,
	sort,
	userImageUrl,
	userLabel = "Member",
	visibleOptions,
	visibleColumnKeys,
	viewportRange,
	viewedSelections = [],
	virtualizerRef,
}: SessionTurnTableProps) {
	const scrollElementRef = useRef<HTMLDivElement>(null);
	const [viewedRowsOffscreenDirection, setViewedRowsOffscreenDirection] =
		useState<ViewedRowsOffscreenDirection>(undefined);
	const tableRows = useMemo<readonly SessionTurnTableRow[]>(
		() =>
			rows ??
			visibleOptions.map((match) => ({
				characterCount: undefined,
				key: `${match.option.key}:model`,
				match,
				sentimentWords: [],
				speaker: "model",
				toolCallGroups: [],
			})),
		[rows, visibleOptions],
	);
	const modelColumns = useMemo(
		() =>
			buildSessionTurnTableColumns(options, "model", tableRows).filter(
				(column) =>
					isSessionTurnTableColumnVisible(column.key, visibleColumnKeys),
			),
		[options, tableRows, visibleColumnKeys],
	);
	const memberColumns = useMemo(
		() => buildSessionTurnTableColumns(options, "member", tableRows),
		[options, tableRows],
	);
	const headerColumns =
		primarySpeaker === "member" ? memberColumns : modelColumns;
	const memberGridTemplate = useMemo(
		() => getSessionTurnGridTemplate(memberColumns),
		[memberColumns],
	);
	const modelGridTemplate = useMemo(
		() => getSessionTurnGridTemplate(modelColumns),
		[modelColumns],
	);
	const headerGridTemplate =
		primarySpeaker === "member" ? memberGridTemplate : modelGridTemplate;
	const episodeByStartIndex = useMemo(
		() =>
			new Map(
				sort.key === "time" && sort.direction === "asc"
					? episodes?.map((episode) => [episode.startIndex, episode])
					: [],
			),
		[episodes, sort.direction, sort.key],
	);
	const selectedRowKey = useMemo(
		() =>
			getSessionTurnTableSelectedRowKey({
				rows: tableRows,
				selection,
			}),
		[selection, tableRows],
	);
	const viewedRowKeys = useMemo(
		() =>
			new Set(
				tableRows
					.filter((row) =>
						viewedSelections.some(
							(viewed) =>
								viewed.index === row.match.index &&
								viewed.speaker === row.speaker,
						),
					)
					.map((row) => row.key),
			),
		[tableRows, viewedSelections],
	);
	const updateViewedRowsOffscreenDirection = useCallback(() => {
		const scrollElement = scrollElementRef.current;
		if (!scrollElement) {
			return;
		}
		setViewedRowsOffscreenDirection(
			getViewedRowsOffscreenDirection(scrollElement),
		);
	}, []);

	useLayoutEffect(() => {
		updateViewedRowsOffscreenDirection();
	});

	useMountEffect(() => {
		const scrollElement = scrollElementRef.current;
		if (!scrollElement) {
			return;
		}

		scrollElement.addEventListener(
			"scroll",
			updateViewedRowsOffscreenDirection,
			{ passive: true },
		);
		const resizeObserver =
			typeof ResizeObserver === "undefined"
				? undefined
				: new ResizeObserver(updateViewedRowsOffscreenDirection);
		resizeObserver?.observe(scrollElement);
		return () => {
			scrollElement.removeEventListener(
				"scroll",
				updateViewedRowsOffscreenDirection,
			);
			resizeObserver?.disconnect();
		};
	});

	function scrollToViewedRows() {
		const scrollElement = scrollElementRef.current;
		if (!scrollElement || !viewedRowsOffscreenDirection) {
			return;
		}

		const viewedRows = getViewedRows(scrollElement);
		const targetRow =
			viewedRowsOffscreenDirection === "above"
				? viewedRows.at(-1)
				: viewedRows[0];
		targetRow?.scrollIntoView({ behavior: "smooth", block: "center" });
	}
	useImperativeHandle(
		virtualizerRef,
		() => ({
			scrollToSelection: (nextSelection, options) => {
				const scrollElement = scrollElementRef.current;
				const exactRow = scrollElement?.querySelector<HTMLElement>(
					`[data-turn-index="${nextSelection.index}"][data-speaker="${nextSelection.speaker}"]`,
				);
				const fallbackRow = scrollElement?.querySelector<HTMLElement>(
					`[data-turn-index="${nextSelection.index}"]`,
				);
				(exactRow ?? fallbackRow)?.scrollIntoView({
					behavior: options?.behavior,
					block: "nearest",
				});
			},
		}),
		[],
	);

	function handleRowKeyDown(
		event: KeyboardEvent<HTMLTableRowElement>,
		visibleIndex: number,
	) {
		if (event.key === "Enter" || event.key === " ") {
			event.preventDefault();
			const row = tableRows[visibleIndex];
			if (row) {
				onSelect({ index: row.match.index, speaker: row.speaker });
			}
			return;
		}

		if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
			return;
		}

		event.preventDefault();
		const direction = event.key === "ArrowDown" ? 1 : -1;
		const nextVisibleIndex = Math.min(
			Math.max(visibleIndex + direction, 0),
			tableRows.length - 1,
		);
		const nextRow = tableRows[nextVisibleIndex];
		if (!nextRow) {
			return;
		}

		onSelect({ index: nextRow.match.index, speaker: nextRow.speaker });
		const nextRowElement = scrollElementRef.current?.querySelector<HTMLElement>(
			`[data-visible-index="${nextVisibleIndex}"]`,
		);
		nextRowElement?.scrollIntoView({ block: "nearest" });
		window.requestAnimationFrame(() => {
			nextRowElement?.focus({ preventScroll: true });
		});
	}

	return (
		<div className="relative min-h-0 flex-1">
			<div
				ref={scrollElementRef}
				className="h-full min-h-0 overflow-x-auto overflow-y-auto overscroll-none bg-(--session-turn-table-surface)"
				data-session-turn-table-scroll
			>
				<table
					aria-label="Session turn ledger"
					className="block min-w-full bg-(--session-turn-table-surface) [--session-turn-row-hover:#f0f0f0] dark:[--session-turn-row-hover:#222]"
				>
					<thead className="sticky top-0 z-10 block min-w-full bg-(--session-turn-table-surface)">
						<tr
							className="grid min-w-full border-b border-(--session-overview-border) bg-(--session-turn-table-surface) [grid-template-columns:var(--session-turn-grid-template)]"
							style={getSessionTurnGridStyle(headerGridTemplate)}
						>
							<th className="h-8 bg-(--session-turn-table-surface)" scope="col">
								<span className="sr-only">Visible in transcript</span>
							</th>
							<th
								aria-label="Speaker and tool calls"
								className="h-8 bg-(--session-turn-table-surface)"
								scope="col"
							>
								<SessionTurnTableSpeakerFocusToggle
									className="h-8"
									model={model}
									onPrimarySpeakerChange={onPrimarySpeakerChange}
									primarySpeaker={primarySpeaker}
									userImageUrl={userImageUrl}
								/>
							</th>
							{headerColumns.map((column, columnIndex) => (
								<th
									key={column.key}
									className="h-8 min-w-0 bg-(--session-turn-table-surface) text-left text-xs font-medium whitespace-nowrap text-(--session-overview-subtle)"
									scope="col"
								>
									{column.sortKey ? (
										<SessionTurnTableSortableHeader
											className={undefined}
											columnIndex={columnIndex + 1}
											label={column.label}
											onSort={onSort}
											sort={sort}
											sortKey={column.sortKey}
										/>
									) : (
										<div className="flex h-8 items-center px-1.5">
											{column.label}
										</div>
									)}
								</th>
							))}
						</tr>
					</thead>
					<SessionTurnTableBody
						collapsedEpisodeKeys={collapsedEpisodeKeys}
						episodeByStartIndex={episodeByStartIndex}
						matchedIndices={matchedIndices}
						memberColumns={memberColumns}
						memberGridTemplate={memberGridTemplate}
						modelColumns={modelColumns}
						modelGridTemplate={modelGridTemplate}
						onEpisodeToggle={onEpisodeToggle}
						onKeyDown={handleRowKeyDown}
						onSelect={onSelect}
						primarySpeaker={primarySpeaker}
						rows={tableRows}
						selectedRowKey={selectedRowKey}
						showSpeakerHighlights={showSpeakerHighlights}
						userImageUrl={userImageUrl}
						userLabel={userLabel}
						viewedRowKeys={viewedRowKeys}
						viewportRange={viewportRange}
					/>
					{tableRows.length > 0 ? (
						<SessionTurnTableFooter
							columns={modelColumns}
							gridTemplate={modelGridTemplate}
							sessionDurationLabel={sessionDurationLabel}
							turnCount={visibleOptions.length}
						/>
					) : null}
				</table>
				{tableRows.length === 0 ? (
					<div className="flex min-h-40 items-center justify-center px-6 text-center">
						<p className="text-sm text-(--session-overview-muted)">
							No turns available.
						</p>
					</div>
				) : null}
			</div>
			{viewedRowsOffscreenDirection ? (
				<button
					type="button"
					aria-label={`Scroll ${viewedRowsOffscreenDirection === "above" ? "up" : "down"} to visible transcript rows`}
					className={`absolute left-2 z-30 flex size-6 items-center justify-center rounded-full bg-white shadow-[0_2px_6px_#00000024] outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[oklch(0.67_0.164_262.589)] dark:shadow-none ${viewedRowsOffscreenDirection === "above" ? "top-10" : "bottom-11"}`}
					onClick={scrollToViewedRows}
				>
					{viewedRowsOffscreenDirection === "above" ? (
						<ChevronUp
							aria-hidden="true"
							className="size-4 shrink-0 stroke-[oklch(0.67_0.164_262.589)]"
						/>
					) : (
						<ChevronDown
							aria-hidden="true"
							className="size-4 shrink-0 stroke-[oklch(0.67_0.164_262.589)]"
						/>
					)}
					<span
						aria-hidden="true"
						className="pointer-fine:hidden absolute top-1/2 left-1/2 size-[max(100%,3rem)] -translate-1/2"
					/>
				</button>
			) : null}
		</div>
	);
}
