import {
	type KeyboardEvent,
	type Ref,
	useImperativeHandle,
	useMemo,
	useRef,
} from "react";
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
import {
	getSessionTurnTableSelectedRowKey,
	type SessionTurnSelection,
	type SessionTurnTableSpeaker,
} from "./session-turn-table-selection";
import { SessionTurnTableSortableHeader } from "./session-turn-table-sortable-header";
import { SessionTurnTableSpeakerFocusToggle } from "./session-turn-table-view-tabs";
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
	characterCount: number | undefined;
	key: string;
	match: SessionTurnTableMatch;
	speaker: SessionTurnTableSpeaker;
	toolCallGroups: readonly SessionTurnTableToolCallGroup[];
};

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
	sort: SessionTurnTableSortState;
	userImageUrl?: string;
	userLabel?: string;
	visibleOptions: readonly SessionTurnTableMatch[];
	visibleColumnKeys: ReadonlySet<SessionTurnTableColumnKey>;
	viewportRange?: readonly [number, number];
	visibleSpeakers: ReadonlySet<SessionTurnTableSpeaker>;
	virtualizerRef?: Ref<SessionTurnTableVirtualizerHandle>;
};

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
	sort,
	userImageUrl,
	userLabel = "Member",
	visibleOptions,
	visibleColumnKeys,
	viewportRange,
	visibleSpeakers,
	virtualizerRef,
}: SessionTurnTableProps) {
	const scrollElementRef = useRef<HTMLDivElement>(null);
	const tableRows = useMemo<readonly SessionTurnTableRow[]>(
		() =>
			rows ??
			visibleOptions.map((match) => ({
				characterCount: undefined,
				key: `${match.option.key}:model`,
				match,
				speaker: "model",
				toolCallGroups: [],
			})),
		[rows, visibleOptions],
	);
	const columns = useMemo(
		() =>
			buildSessionTurnTableColumns(options, primarySpeaker).filter(
				(column) =>
					primarySpeaker === "member" ||
					isSessionTurnTableColumnVisible(column.key, visibleColumnKeys),
			),
		[options, primarySpeaker, visibleColumnKeys],
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

	const hasMemberRows = tableRows.some((row) => row.speaker === "member");
	const hasModelRows = tableRows.some((row) => row.speaker === "model");
	const tableLabel =
		hasMemberRows && hasModelRows
			? `${primarySpeaker === "model" ? "Model" : "User"}-first user and model session turns`
			: hasMemberRows
				? "User session turns"
				: "Model session turns";
	return (
		<div
			ref={scrollElementRef}
			className="min-h-0 flex-1 overflow-x-auto overflow-y-auto overscroll-none"
		>
			<div className="inline-block min-w-full px-1.5 align-middle [--session-turn-row-hover:#f0f0f0] dark:[--session-turn-row-hover:#222]">
				<table
					aria-label={tableLabel}
					className="session-turn-table w-max min-w-full table-fixed [&:has(tbody_tr[data-visible-index='0']:hover)_thead_tr]:border-b-transparent [&:has(tbody_tr[data-visible-index='0'][data-selected])_thead_tr]:border-b-transparent"
				>
					<colgroup>
						<col className="w-[8%]" />
						{columns.map((column) => (
							<col key={column.key} className={column.widthClassName} />
						))}
					</colgroup>
					<thead className="sticky top-0 z-10 w-full bg-(--session-overview-surface)">
						<tr className="w-full border-b border-(--session-overview-border) bg-(--session-overview-surface)">
							<th
								aria-label="Speaker and tool calls"
								className="h-8 bg-(--session-overview-surface) p-0"
								scope="col"
							>
								<SessionTurnTableSpeakerFocusToggle
									className="h-8"
									model={model}
									onPrimarySpeakerChange={onPrimarySpeakerChange}
									primarySpeaker={primarySpeaker}
									userImageUrl={userImageUrl}
									visibleSpeakers={visibleSpeakers}
								/>
							</th>
							{columns.map((column, columnIndex) => (
								<th
									key={column.key}
									className="h-8 bg-(--session-overview-surface) p-0 text-left text-xs font-medium whitespace-nowrap text-(--session-overview-subtle)"
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
										<span className="flex h-8 items-center px-1.5">
											{column.label}
										</span>
									)}
								</th>
							))}
						</tr>
					</thead>
					<SessionTurnTableBody
						collapsedEpisodeKeys={collapsedEpisodeKeys}
						columns={columns}
						episodeByStartIndex={episodeByStartIndex}
						matchedIndices={matchedIndices}
						onEpisodeToggle={onEpisodeToggle}
						onKeyDown={handleRowKeyDown}
						onSelect={onSelect}
						rows={tableRows}
						selectedRowKey={selectedRowKey}
						userImageUrl={userImageUrl}
						userLabel={userLabel}
						viewportRange={viewportRange}
					/>
				</table>
			</div>
			{tableRows.length === 0 ? (
				<div className="flex min-h-40 items-center justify-center px-6 text-center">
					<p className="text-sm text-(--session-overview-muted)">
						No turns available.
					</p>
				</div>
			) : null}
		</div>
	);
}
