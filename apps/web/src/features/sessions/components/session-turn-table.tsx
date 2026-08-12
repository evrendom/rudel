import { Fragment, type KeyboardEvent, useMemo } from "react";
import {
	ModelTraceIcon,
	UserTraceAvatar,
} from "@/components/conversation/conversation-trace-icons";
import { formatModelDisplayLabel } from "@/features/dashboard/components/dashboard-model-brand";
import { cn } from "@/lib/utils";
import type { SessionCompaction } from "./session-compactions";
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
import { SessionTurnTableSortableHeader } from "./session-turn-table-sortable-header";
import type { SessionTurnTableView } from "./session-turn-table-view-tabs";

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

export type SessionTurnTableRow = {
	characterCount: number | undefined;
	key: string;
	match: SessionTurnTableMatch;
	speaker: "member" | "model";
};

type SessionTurnTableProps = {
	hasActiveFilters: boolean;
	collapsedEpisodeKeys?: ReadonlySet<string>;
	episodes?: readonly SessionTurnEpisode[];
	matchedIndices?: ReadonlySet<number>;
	onEpisodeToggle?: (key: string) => void;
	onSort: (sortKey: SessionTurnTableSortKey) => void;
	onSelect: (index: number) => void;
	options: readonly SessionTurnTableOption[];
	rows?: readonly SessionTurnTableRow[];
	selectedIndex: number;
	sort: SessionTurnTableSortState;
	tableView?: SessionTurnTableView;
	model?: string;
	userImageUrl?: string;
	userLabel?: string;
	visibleOptions: readonly SessionTurnTableMatch[];
	visibleColumnKeys: ReadonlySet<SessionTurnTableColumnKey>;
	viewportRange?: readonly [number, number];
};

export function SessionTurnTable({
	collapsedEpisodeKeys,
	episodes,
	hasActiveFilters,
	matchedIndices,
	onEpisodeToggle,
	onSort,
	onSelect,
	options,
	rows,
	selectedIndex,
	sort,
	tableView = "model",
	model,
	userImageUrl,
	userLabel = "Member",
	visibleOptions,
	visibleColumnKeys,
	viewportRange,
}: SessionTurnTableProps) {
	const tableRows = useMemo<readonly SessionTurnTableRow[]>(
		() =>
			rows ??
			visibleOptions.map((match) => ({
				characterCount: undefined,
				key: `${match.option.key}:model`,
				match,
				speaker: "model",
			})),
		[rows, visibleOptions],
	);
	const columns = useMemo(
		() =>
			buildSessionTurnTableColumns(options, tableView).filter(
				(column) =>
					tableView === "member" ||
					isSessionTurnTableColumnVisible(column.key, visibleColumnKeys),
			),
		[options, tableView, visibleColumnKeys],
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

	function handleRowKeyDown(
		event: KeyboardEvent<HTMLTableRowElement>,
		visibleIndex: number,
	) {
		if (event.key === "Enter" || event.key === " ") {
			event.preventDefault();
			onSelect(tableRows[visibleIndex]?.match.index ?? selectedIndex);
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

		onSelect(nextRow.match.index);
		const nextRowElement = event.currentTarget.parentElement?.querySelector(
			`[data-visible-index="${nextVisibleIndex}"]`,
		);
		if (nextRowElement instanceof HTMLElement) {
			nextRowElement.focus();
		}
	}

	const tableLabel =
		tableView === "member"
			? "Member session turns"
			: tableView === "both"
				? "Chronological member and model session turns"
				: "Filterable session turns";
	const modelLabel = model ? formatModelDisplayLabel(model) : "Model";

	return (
		<div className="min-h-0 flex-1 overflow-x-auto overflow-y-auto overscroll-none">
			<table aria-label={tableLabel} className="w-max min-w-full table-fixed">
				<colgroup>
					{columns.map((column) => (
						<col key={column.key} className={column.widthClassName} />
					))}
				</colgroup>
				<thead className="sticky top-0 z-10 bg-(--session-overview-surface)">
					<tr className="border-b border-(--session-overview-border)">
						{columns.map((column, columnIndex) => (
							<th
								key={column.key}
								className="h-8 p-0 text-left text-xs font-medium whitespace-nowrap text-(--session-overview-subtle)"
								scope="col"
							>
								{column.sortKey ? (
									<SessionTurnTableSortableHeader
										className={undefined}
										columnIndex={columnIndex}
										label={column.label}
										onSort={onSort}
										sort={sort}
										sortKey={column.sortKey}
									/>
								) : (
									<span
										className={cn(
											"flex h-8 items-center",
											columnIndex === 0 ? "pr-1.5 pl-3" : "px-1.5",
										)}
									>
										{column.label}
									</span>
								)}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{tableRows.map((row, visibleIndex) => {
						const { match } = row;
						const selected = match.index === selectedIndex;
						const beginsTurn =
							visibleIndex === 0 ||
							tableRows[visibleIndex - 1]?.match.option.key !==
								match.option.key;
						const episode = beginsTurn
							? episodeByStartIndex.get(match.index)
							: undefined;
						const inViewport =
							viewportRange !== undefined &&
							match.index >= viewportRange[0] &&
							match.index <= viewportRange[1];
						const matchesLens = matchedIndices?.has(match.index) ?? false;
						return (
							<Fragment key={row.key}>
								{episode ? (
									<SessionTurnEpisodeRow
										collapsed={collapsedEpisodeKeys?.has(episode.key) ?? false}
										columnCount={columns.length}
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
												columnCount={columns.length}
												compaction={compaction}
											/>
										))
									: null}
								<tr
									aria-current={selected ? "true" : undefined}
									className={cn(
										"group cursor-pointer border-b border-(--session-overview-border) outline-none hover:bg-(--session-overview-hover) focus-visible:z-10 focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-(--session-overview-accent)",
										inViewport &&
											"bg-[color-mix(in_srgb,var(--session-overview-accent)_7%,var(--session-overview-surface))]",
										matchesLens &&
											"[box-shadow:inset_2px_0_0_var(--session-overview-accent)]",
										selected &&
											"bg-[color-mix(in_srgb,var(--session-overview-accent)_13%,var(--session-overview-surface))]",
									)}
									data-visible-index={visibleIndex}
									data-turn-index={match.index}
									data-speaker={row.speaker}
									data-selected={selected ? "true" : undefined}
									tabIndex={0}
									onClick={() => onSelect(match.index)}
									onKeyDown={(event) => handleRowKeyDown(event, visibleIndex)}
								>
									{columns.map((column, columnIndex) => {
										const values = column.getValues(row);
										return (
											<td
												key={column.key}
												className={cn(
													"py-1.5 align-top",
													columnIndex === 0 ? "pr-1.5 pl-3" : "px-1.5",
												)}
											>
												<div
													className={cn(
														"min-w-0",
														columnIndex === 0 && "flex items-start gap-1.5",
													)}
												>
													{columnIndex === 0 && tableView === "both" ? (
														<span
															title={
																row.speaker === "member"
																	? userLabel
																	: modelLabel
															}
														>
															{row.speaker === "member" ? (
																<UserTraceAvatar
																	expanded={false}
																	expandable={false}
																	imageUrl={userImageUrl}
																/>
															) : (
																<ModelTraceIcon
																	expanded={false}
																	expandable={false}
																	model={model}
																/>
															)}
														</span>
													) : null}
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
							</Fragment>
						);
					})}
				</tbody>
			</table>
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
