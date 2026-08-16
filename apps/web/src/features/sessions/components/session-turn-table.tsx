import { useVirtualizer } from "@tanstack/react-virtual";
import {
	type KeyboardEvent,
	type Ref,
	useImperativeHandle,
	useMemo,
	useRef,
} from "react";
import type { ToolIconName } from "@/components/conversation/conversation-tools";
import {
	TraceIcon,
	type TraceIconTone,
	UserTraceAvatar,
} from "@/components/conversation/conversation-trace-icons";
import { CONVERSATION_TOOL_ICONS } from "@/components/conversation/conversation-trace-tool-icons";
import { cn } from "@/lib/utils";
import type { SessionCompaction } from "./session-compactions";
import {
	estimateSessionTurnTableRowSize,
	SESSION_DETAIL_VIRTUAL_OVERSCAN,
	type SessionTurnTableVirtualizerHandle,
} from "./session-detail-virtualization";
import type { SessionTurnEpisode } from "./session-turn-episodes";
import type { SessionTurnMetrics } from "./session-turn-metadata";
import {
	isSessionTurnTableColumnVisible,
	type SessionTurnTableColumnKey,
} from "./session-turn-table-column-composer";
import { buildSessionTurnTableColumns } from "./session-turn-table-columns";
import type {
	SessionTurnTableSortKey,
	SessionTurnTableSortState,
} from "./session-turn-table-filters";
import {
	SessionTurnCompactionRow,
	SessionTurnEpisodeRow,
} from "./session-turn-table-rows";
import {
	getSessionTurnTableSelectedRowKey,
	isSessionTurnTableRowInViewport,
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

export type SessionTurnTableMatch = {
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

export type SessionTurnTableRow = {
	characterCount: number | undefined;
	key: string;
	match: SessionTurnTableMatch;
	speaker: SessionTurnTableSpeaker;
	toolCallGroups: readonly SessionTurnTableToolCallGroup[];
};

type SessionTurnTableProps = {
	hasActiveFilters: boolean;
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
	hasActiveFilters,
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
	const rowElementsRef = useRef(new Map<number, HTMLTableRowElement>());
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
	const rowVirtualizer = useVirtualizer<
		HTMLDivElement,
		HTMLTableSectionElement
	>({
		count: tableRows.length,
		estimateSize: (index) => {
			const row = tableRows[index];
			if (!row) {
				return 36;
			}
			const beginsTurn =
				index === 0 ||
				tableRows[index - 1]?.match.option.key !== row.match.option.key;
			return estimateSessionTurnTableRowSize({
				beginsTurn,
				hasEpisode: beginsTurn && episodeByStartIndex.has(row.match.index),
				row,
			});
		},
		getItemKey: (index) => tableRows[index]?.key ?? index,
		getScrollElement: () => scrollElementRef.current,
		overscan: SESSION_DETAIL_VIRTUAL_OVERSCAN,
		useAnimationFrameWithResizeObserver: true,
	});
	const virtualRows = rowVirtualizer.getVirtualItems();
	const paddingTop = virtualRows[0]?.start ?? 0;
	const paddingBottom = Math.max(
		0,
		rowVirtualizer.getTotalSize() - (virtualRows.at(-1)?.end ?? 0),
	);

	useImperativeHandle(
		virtualizerRef,
		() => ({
			scrollToSelection: (nextSelection, options) => {
				const exactIndex = tableRows.findIndex(
					(row) =>
						row.match.index === nextSelection.index &&
						row.speaker === nextSelection.speaker,
				);
				const rowIndex =
					exactIndex >= 0
						? exactIndex
						: tableRows.findIndex(
								(row) => row.match.index === nextSelection.index,
							);
				if (rowIndex >= 0) {
					rowVirtualizer.scrollToIndex(rowIndex, {
						align: "auto",
						behavior: options?.behavior,
					});
				}
			},
		}),
		[rowVirtualizer, tableRows],
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
		rowVirtualizer.scrollToIndex(nextVisibleIndex, { align: "auto" });
		window.requestAnimationFrame(() => {
			rowElementsRef.current.get(nextVisibleIndex)?.focus();
		});
	}

	function scheduleRowMeasurement(element: HTMLTableSectionElement) {
		window.requestAnimationFrame(() => rowVirtualizer.measureElement(element));
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
					{paddingTop > 0 ? (
						<tbody aria-hidden="true">
							<tr>
								<td
									colSpan={columns.length + 1}
									style={{ height: paddingTop }}
								/>
							</tr>
						</tbody>
					) : null}
					{virtualRows.map((virtualRow) => {
						const visibleIndex = virtualRow.index;
						const row = tableRows[visibleIndex];
						if (!row) {
							return null;
						}
						const { match } = row;
						const selected = row.key === selectedRowKey;
						const beginsTurn =
							visibleIndex === 0 ||
							tableRows[visibleIndex - 1]?.match.option.key !==
								match.option.key;
						const episode = beginsTurn
							? episodeByStartIndex.get(match.index)
							: undefined;
						const inViewport = isSessionTurnTableRowInViewport({
							turnIndex: match.index,
							viewportRange,
						});
						const matchesLens = matchedIndices?.has(match.index) ?? false;
						return (
							<tbody
								key={row.key}
								ref={rowVirtualizer.measureElement}
								className="[&_tr:last-child]:border-0 [&_tr:has(+_tr:hover)]:border-b-transparent [&_tr:has(+_tr[data-selected])]:border-b-transparent"
								data-index={visibleIndex}
								onClickCapture={(event) =>
									scheduleRowMeasurement(event.currentTarget)
								}
								onTransitionEndCapture={(event) =>
									scheduleRowMeasurement(event.currentTarget)
								}
							>
								{episode ? (
									<SessionTurnEpisodeRow
										collapsed={collapsedEpisodeKeys?.has(episode.key) ?? false}
										columnCount={columns.length + 1}
										episode={episode}
										onToggle={
											onEpisodeToggle
												? () => onEpisodeToggle(episode.key)
												: undefined
										}
									/>
								) : null}
								{beginsTurn
									? match.option.compactionsBefore.map((compaction) => (
											<SessionTurnCompactionRow
												key={compaction.key}
												columnCount={columns.length + 1}
												compaction={compaction}
											/>
										))
									: null}
								<tr
									ref={(element) => {
										if (element) {
											rowElementsRef.current.set(visibleIndex, element);
										} else {
											rowElementsRef.current.delete(visibleIndex);
										}
									}}
									aria-current={selected ? "true" : undefined}
									className={cn(
										"group relative isolate cursor-pointer select-none border-b border-b-(--session-turn-row-hover) outline-none [&>td:first-child]:rounded-l-md [&>td:last-child]:rounded-r-md hover:border-b-transparent hover:[&>td]:bg-(--session-turn-row-hover) focus-visible:z-10 focus-visible:rounded-md focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-(--session-overview-accent) data-selected:border-b-transparent",
										inViewport && "[&>td]:bg-(--session-overview-hover)",
										matchesLens &&
											"[box-shadow:inset_2px_0_0_var(--session-overview-accent)]",
										selected && "[&>td]:bg-(--session-turn-row-hover)",
									)}
									data-visible-index={visibleIndex}
									data-turn-index={match.index}
									data-speaker={row.speaker}
									data-in-viewport={inViewport ? "true" : undefined}
									data-selected={selected ? "true" : undefined}
									tabIndex={0}
									onClick={() =>
										onSelect({ index: match.index, speaker: row.speaker })
									}
									onKeyDown={(event) => handleRowKeyDown(event, visibleIndex)}
								>
									<td className="py-1.5 pr-1 pl-2 align-middle">
										<div className="session-constellation-tree min-w-0">
											<div
												className="flex min-w-0 items-center"
												data-trace-tree-row-content
											>
												{row.speaker === "member" ? (
													<span
														className="relative z-20 shrink-0"
														title={userLabel}
													>
														<UserTraceAvatar
															expanded={false}
															expandable={false}
															imageUrl={userImageUrl}
														/>
													</span>
												) : null}
												{row.speaker === "model"
													? row.toolCallGroups.map(
															(toolCallGroup, groupIndex) => {
																const toolNames = Array.from(
																	new Set(toolCallGroup.names),
																).join(", ");
																const countLabel = `${toolCallGroup.count.toLocaleString()} ${
																	toolCallGroup.count === 1
																		? "tool call"
																		: "tool calls"
																}`;
																return (
																	<span
																		key={toolCallGroup.icon}
																		aria-label={`${countLabel}: ${toolNames}`}
																		className={cn(
																			"relative shrink-0",
																			groupIndex > 0 && "-ml-2.5",
																		)}
																		role="img"
																		style={{
																			zIndex:
																				row.toolCallGroups.length - groupIndex,
																		}}
																		title={`${countLabel}: ${toolNames}`}
																	>
																		<TraceIcon
																			icon={
																				CONVERSATION_TOOL_ICONS[
																					toolCallGroup.icon
																				]
																			}
																			toolIcon={toolCallGroup.icon}
																			tone={toolCallGroup.tone}
																		/>
																		{toolCallGroup.count > 1 ? (
																			<span
																				aria-hidden="true"
																				className="absolute right-0 bottom-0 z-10 min-w-2.5 rounded-[2px] bg-(--session-overview-surface) px-px text-center text-[0.5rem] leading-[0.625rem] font-semibold text-(--session-overview-text) tabular-nums shadow-[0_0_0_1px_var(--session-overview-surface)]"
																			>
																				{toolCallGroup.count}x
																			</span>
																		) : null}
																	</span>
																);
															},
														)
													: null}
											</div>
										</div>
									</td>
									{columns.map((column) => {
										const values = column.getValues(row);
										return (
											<td
												key={column.key}
												className="px-1.5 py-1.5 align-middle"
											>
												<div className="min-w-0">
													{values.length > 0 ? (
														<div
															className={cn(
																"min-w-0 flex-1",
																column.appearance === "tag"
																	? "flex flex-wrap gap-1"
																	: "grid gap-0.5",
															)}
														>
															{values.map((value) => (
																<div
																	key={`${value.title ?? "value"}:${value.label}`}
																	className={cn(
																		"min-w-0 max-w-full truncate text-(--session-overview-muted)",
																		column.appearance === "tag"
																			? "rounded-full bg-(--session-overview-surface) px-1.5 py-0.5 text-xs font-medium tracking-[-0.01em]"
																			: "text-xs",
																	)}
																	title={value.title}
																>
																	{value.label}
																</div>
															))}
														</div>
													) : (
														<p className="text-xs text-(--session-overview-subtle)">
															—
														</p>
													)}
												</div>
											</td>
										);
									})}
								</tr>
							</tbody>
						);
					})}
					{paddingBottom > 0 ? (
						<tbody aria-hidden="true">
							<tr>
								<td
									colSpan={columns.length + 1}
									style={{ height: paddingBottom }}
								/>
							</tr>
						</tbody>
					) : null}
				</table>
			</div>
			{tableRows.length === 0 ? (
				<div className="flex min-h-40 items-center justify-center px-6 text-center">
					<p className="text-sm text-(--session-overview-muted)">
						{hasActiveFilters
							? "No turns match the selected filters."
							: "No turns available."}
					</p>
				</div>
			) : null}
		</div>
	);
}
