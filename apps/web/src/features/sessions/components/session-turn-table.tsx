import { ChevronDown, ChevronUp } from "lucide-react";
import {
	type CSSProperties,
	type KeyboardEvent,
	type ReactNode,
	type Ref,
	type RefObject,
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
import { SessionTurnTableScrollbar } from "./session-turn-table-scrollbar";
import {
	getSessionTurnTableSelectedRowKey,
	type SessionTurnSelection,
	type SessionTurnTableSpeaker,
} from "./session-turn-table-selection";
import { SessionTurnTableSortableHeader } from "./session-turn-table-sortable-header";
import "./session-constellation-tree.css";
import "./session-turn-table.css";

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
	key: string;
	match: SessionTurnTableMatch;
	memberText: string | undefined;
	signalCount: number;
	speaker: SessionTurnTableSpeaker;
	subagentCount: number;
	toolCallGroups: readonly SessionTurnTableToolCallGroup[];
};

const GRID_TRACK_BY_WIDTH_CLASS: Readonly<Record<string, string>> = {
	"w-12": "minmax(3rem, 12fr)",
	"w-16-fixed": "4rem",
	"w-16": "minmax(4rem, 16fr)",
	"w-20": "minmax(5rem, 20fr)",
	"w-24": "minmax(6rem, 24fr)",
	"w-28": "minmax(7rem, 28fr)",
	"w-32": "minmax(8rem, 32fr)",
	"w-60": "minmax(15rem, 60fr)",
};

function getSessionTurnGridTemplate(
	columns: readonly { widthClassName: string }[],
	showSpeakerColumn: boolean,
) {
	return [
		"0.375rem",
		...(showSpeakerColumn ? ["2.5rem"] : []),
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
	onPrefetchTurn?: (turnId: string, immediate: boolean) => void;
	onSort: (sortKey: SessionTurnTableSortKey) => void;
	onSelect: (selection: SessionTurnSelection) => void;
	options: readonly SessionTurnTableOption[];
	primarySpeaker?: SessionTurnTableSpeaker;
	rows?: readonly SessionTurnTableRow[];
	selection: SessionTurnSelection;
	sessionDurationLabel: string;
	speakerVisibilityControls: ReactNode;
	showSpeakerColumn?: boolean;
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
	scrollElement: HTMLElement,
): readonly HTMLTableRowElement[] {
	return Array.from(
		scrollElement.querySelectorAll<HTMLTableRowElement>(
			'tr[data-viewed="true"][data-visible-index]',
		),
	);
}

function getViewedRowsOffscreenDirection(
	scrollElement: HTMLElement,
): ViewedRowsOffscreenDirection {
	const viewedRows = getViewedRows(scrollElement);
	if (viewedRows.length === 0) {
		return undefined;
	}

	const scrollRect = scrollElement.getBoundingClientRect();
	const headerBottom =
		scrollElement.querySelector<HTMLElement>("thead")?.getBoundingClientRect()
			.bottom ?? scrollRect.top;
	const viewportTop = Math.max(scrollRect.top, headerBottom);
	const viewedTop = Math.min(
		...viewedRows.map((row) => row.getBoundingClientRect().top),
	);
	const viewedBottom = Math.max(
		...viewedRows.map((row) => row.getBoundingClientRect().bottom),
	);

	if (viewedBottom < viewportTop) {
		return "above";
	}
	if (viewedTop > scrollRect.bottom) {
		return "below";
	}
	return undefined;
}

function SessionTurnTableViewedRowsButton({
	scrollElementRef,
	viewedRowKeys,
}: {
	scrollElementRef: RefObject<HTMLDivElement | null>;
	viewedRowKeys: ReadonlySet<string>;
}) {
	const [direction, setDirection] =
		useState<ViewedRowsOffscreenDirection>(undefined);
	const directionRef = useRef<ViewedRowsOffscreenDirection>(undefined);
	const updateDirection = useCallback(() => {
		const scrollElement = scrollElementRef.current;
		if (!scrollElement) {
			return;
		}
		const nextDirection = getViewedRowsOffscreenDirection(scrollElement);
		if (nextDirection === directionRef.current) {
			return;
		}
		directionRef.current = nextDirection;
		setDirection(nextDirection);
	}, [scrollElementRef]);

	useLayoutEffect(() => {
		void viewedRowKeys;
		updateDirection();
	}, [updateDirection, viewedRowKeys]);

	useMountEffect(() => {
		const scrollElement = scrollElementRef.current;
		if (!scrollElement) {
			return;
		}

		scrollElement.addEventListener("scroll", updateDirection, {
			passive: true,
		});
		const resizeObserver =
			typeof ResizeObserver === "undefined"
				? undefined
				: new ResizeObserver(updateDirection);
		resizeObserver?.observe(scrollElement);
		return () => {
			scrollElement.removeEventListener("scroll", updateDirection);
			resizeObserver?.disconnect();
		};
	});

	function scrollToViewedRows() {
		const scrollElement = scrollElementRef.current;
		if (!scrollElement || !direction) {
			return;
		}
		const viewedRows = getViewedRows(scrollElement);
		const targetRow = direction === "above" ? viewedRows.at(-1) : viewedRows[0];
		targetRow?.scrollIntoView({ behavior: "smooth", block: "center" });
	}

	return (
		<button
			type="button"
			aria-hidden={direction === undefined}
			aria-label={
				direction
					? `Scroll ${direction === "above" ? "up" : "down"} to visible transcript rows`
					: "Scroll to visible transcript rows"
			}
			className="group absolute left-2 z-30 flex size-6 items-center justify-center rounded-full bg-white opacity-100 shadow-[0_2px_6px_#00000024] outline-none data-[direction=above]:top-16 data-[direction=below]:bottom-11 data-[direction=none]:pointer-events-none data-[direction=none]:opacity-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[oklch(0.67_0.164_262.589)] dark:shadow-none"
			data-direction={direction ?? "none"}
			disabled={direction === undefined}
			onClick={scrollToViewedRows}
			tabIndex={direction === undefined ? -1 : 0}
		>
			<ChevronUp
				aria-hidden="true"
				className="hidden size-4 shrink-0 stroke-[oklch(0.67_0.164_262.589)] group-data-[direction=above]:block"
			/>
			<ChevronDown
				aria-hidden="true"
				className="hidden size-4 shrink-0 stroke-[oklch(0.67_0.164_262.589)] group-data-[direction=below]:block"
			/>
			<span
				aria-hidden="true"
				className="pointer-fine:hidden absolute top-1/2 left-1/2 size-[max(100%,3rem)] -translate-1/2"
			/>
		</button>
	);
}

export function SessionTurnTable({
	collapsedEpisodeKeys,
	episodes,
	matchedIndices,
	model,
	onEpisodeToggle,
	onPrefetchTurn,
	onSort,
	onSelect,
	options,
	primarySpeaker = "model",
	rows,
	selection,
	speakerVisibilityControls,
	showSpeakerColumn = true,
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
	const tableRows = useMemo<readonly SessionTurnTableRow[]>(
		() =>
			rows ??
			visibleOptions.map((match) => ({
				key: `${match.option.key}:model`,
				match,
				memberText: undefined,
				signalCount: 0,
				speaker: "model",
				subagentCount: 0,
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
	const memberGridTemplate = useMemo(
		() => getSessionTurnGridTemplate(memberColumns, showSpeakerColumn),
		[memberColumns, showSpeakerColumn],
	);
	const modelGridTemplate = useMemo(
		() => getSessionTurnGridTemplate(modelColumns, showSpeakerColumn),
		[modelColumns, showSpeakerColumn],
	);
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
				className="session-turn-table-scroll h-full min-h-0 overflow-auto overscroll-none bg-(--session-turn-table-surface)"
				data-session-turn-table-scroll
			>
				<table
					aria-label="Session turn ledger"
					className="block min-w-full bg-(--session-turn-table-surface)"
				>
					<thead className="sticky top-0 z-10 block min-w-full border-b-[0.5px] border-(--session-overview-border) bg-(--session-turn-table-surface)">
						<tr
							className="grid h-(--session-turn-table-header-height) min-w-full bg-(--session-turn-table-surface) [grid-template-columns:var(--session-turn-grid-template)]"
							style={getSessionTurnGridStyle(modelGridTemplate)}
						>
							<th
								className="h-full bg-(--session-turn-table-surface)"
								scope="col"
							>
								<span className="sr-only">Visible in transcript</span>
							</th>
							{showSpeakerColumn ? (
								<th
									aria-label="Speaker and tool calls"
									className="h-full bg-(--session-turn-table-surface)"
									scope="col"
								>
									{speakerVisibilityControls ?? (
										<span className="sr-only">Speaker and tool calls</span>
									)}
								</th>
							) : null}
							{modelColumns.map((column, columnIndex) => (
								<th
									key={column.key}
									className="h-full min-w-0 bg-(--session-turn-table-surface) text-left text-xs font-medium whitespace-nowrap text-(--session-overview-subtle)"
									scope="col"
								>
									{column.sortKey ? (
										<SessionTurnTableSortableHeader
											className={
												column.key === "time" ? "pr-1.5 pl-0" : undefined
											}
											columnIndex={columnIndex + (showSpeakerColumn ? 1 : 0)}
											label={column.label}
											onSort={onSort}
											sort={sort}
											sortKey={column.sortKey}
										/>
									) : (
										<div className="flex h-full items-center px-1.5">
											<span className="max-w-full truncate">
												{column.label}
											</span>
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
						model={model}
						modelColumns={modelColumns}
						modelGridTemplate={modelGridTemplate}
						onEpisodeToggle={onEpisodeToggle}
						onKeyDown={handleRowKeyDown}
						onPrefetchTurn={onPrefetchTurn}
						onSelect={onSelect}
						primarySpeaker={primarySpeaker}
						rows={tableRows}
						selectedRowKey={selectedRowKey}
						showSpeakerColumn={showSpeakerColumn}
						showSpeakerHighlights={showSpeakerHighlights}
						userImageUrl={userImageUrl}
						userLabel={userLabel}
						viewedRowKeys={viewedRowKeys}
						viewportRange={viewportRange}
					/>
				</table>
			</div>
			<SessionTurnTableScrollbar scrollElementRef={scrollElementRef} />
			{tableRows.length === 0 ? (
				<div className="absolute inset-x-0 top-(--session-turn-table-header-height) bottom-0 flex items-center justify-center px-6 text-center">
					<p className="text-sm text-(--session-overview-muted)">
						No turns available.
					</p>
				</div>
			) : null}
			<div
				aria-hidden="true"
				className="pointer-events-none absolute inset-x-0 top-0 z-20 h-(--session-turn-table-header-height) border-t-[0.5px] border-(--session-overview-border)"
			/>
			<SessionTurnTableViewedRowsButton
				scrollElementRef={scrollElementRef}
				viewedRowKeys={viewedRowKeys}
			/>
		</div>
	);
}
