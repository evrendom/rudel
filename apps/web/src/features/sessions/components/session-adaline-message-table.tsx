import { Fragment, type KeyboardEvent, useMemo } from "react";
import {
	ModelTraceIcon,
	UserTraceAvatar,
} from "@/components/conversation/conversation-trace-icons";
import { formatModelDisplayLabel } from "@/features/dashboard/components/dashboard-model-brand";
import { cn } from "@/lib/utils";
import {
	buildSessionAdalineMessageRows,
	type SessionAdalineMessageRow,
} from "./session-adaline-message-rows";
import type { SessionTurnTableColumnKey } from "./session-turn-table-column-composer";
import type {
	SessionTurnTableSortKey,
	SessionTurnTableSortState,
} from "./session-turn-table-filters";
import type {
	SessionTurnTablePaneMatch,
	SessionTurnTablePaneOption,
} from "./session-turn-table-pane";
import { SessionTurnCompactionRow } from "./session-turn-table-rows";
import { SessionTurnTableSortableHeader } from "./session-turn-table-sortable-header";

type MessageTableValue = {
	label: string;
	title: string | undefined;
};

type MessageTableColumn = {
	getValue: (row: SessionAdalineMessageRow) => MessageTableValue | undefined;
	key: string;
	label: string;
	sortKey: SessionTurnTableSortKey;
	visibleKey: SessionTurnTableColumnKey;
	widthClassName: string;
};

const costFormatter = new Intl.NumberFormat("en-US", {
	currency: "USD",
	maximumFractionDigits: 2,
	minimumFractionDigits: 2,
	style: "currency",
});

function formatCompactTokens(value: number) {
	if (value < 1_000) {
		return Math.round(value).toLocaleString();
	}

	if (value < 1_000_000) {
		return `${(value / 1_000).toFixed(value < 10_000 ? 1 : 0)}k`;
	}

	return `${(value / 1_000_000).toFixed(value < 10_000_000 ? 1 : 0)}m`;
}

function modelValue(
	row: SessionAdalineMessageRow,
	getValue: (option: SessionTurnTablePaneOption) => MessageTableValue,
) {
	return row.speaker === "model" && row.ownsTurnMetrics
		? getValue(row.match.option)
		: undefined;
}

function buildMessageTableColumns(
	options: readonly SessionTurnTablePaneOption[],
	visibleColumnKeys: ReadonlySet<SessionTurnTableColumnKey>,
): MessageTableColumn[] {
	const scalarColumns: MessageTableColumn[] = [
		{
			getValue: (row) => ({ label: row.time || "—", title: "Message time" }),
			key: "time",
			label: "Time",
			sortKey: "time",
			visibleKey: "time",
			widthClassName: "w-20",
		},
		{
			getValue: (row) =>
				modelValue(row, (option) => ({
					label: option.timing.durationLabel
						? `+${option.timing.durationLabel}`
						: "—",
					title: "Prompt to final assistant message",
				})),
			key: "duration",
			label: "Duration",
			sortKey: "duration",
			visibleKey: "duration",
			widthClassName: "w-18",
		},
		{
			getValue: (row) =>
				modelValue(row, (option) => ({
					label:
						option.metrics.inputTokens === undefined
							? "—"
							: formatCompactTokens(option.metrics.inputTokens),
					title:
						option.metrics.inputTokens === undefined
							? "Input tokens unavailable"
							: `${option.metrics.inputTokens.toLocaleString()} input tokens`,
				})),
			key: "input",
			label: "Input",
			sortKey: "input",
			visibleKey: "input",
			widthClassName: "w-16",
		},
		{
			getValue: (row) =>
				modelValue(row, (option) => ({
					label:
						option.metrics.outputTokens === undefined
							? "—"
							: formatCompactTokens(option.metrics.outputTokens),
					title:
						option.metrics.outputTokens === undefined
							? "Output tokens unavailable"
							: `${option.metrics.outputTokens.toLocaleString()} output tokens`,
				})),
			key: "output",
			label: "Output",
			sortKey: "output",
			visibleKey: "output",
			widthClassName: "w-16",
		},
		{
			getValue: (row) =>
				modelValue(row, (option) => ({
					label:
						option.metrics.estimatedCost === undefined
							? "—"
							: costFormatter.format(option.metrics.estimatedCost),
					title: "Estimated turn cost",
				})),
			key: "cost",
			label: "Cost",
			sortKey: "cost",
			visibleKey: "cost",
			widthClassName: "w-16",
		},
		{
			getValue: (row) =>
				modelValue(row, (option) => ({
					label: option.toolCallCount.toLocaleString(),
					title: "Tool calls",
				})),
			key: "tools",
			label: "Tools",
			sortKey: "tools",
			visibleKey: "tools",
			widthClassName: "w-14",
		},
		{
			getValue: (row) =>
				modelValue(row, (option) => ({
					label: option.metrics.errorCount.toLocaleString(),
					title: "Tool and API errors",
				})),
			key: "errors",
			label: "Errors",
			sortKey: "errors",
			visibleKey: "errors",
			widthClassName: "w-14",
		},
		{
			getValue: (row) =>
				modelValue(row, (option) => ({
					label: option.metrics.editedFiles.length.toLocaleString(),
					title: "Files edited",
				})),
			key: "files",
			label: "Files",
			sortKey: "files",
			visibleKey: "files",
			widthClassName: "w-14",
		},
		{
			getValue: (row) =>
				modelValue(row, (option) => ({
					label: option.metrics.skills.length.toLocaleString(),
					title: "Skills used",
				})),
			key: "skills",
			label: "Skills",
			sortKey: "skills",
			visibleKey: "skills",
			widthClassName: "w-14",
		},
	];
	const maxCommands = Math.max(
		0,
		...options.map((option) => option.slashCommands.length),
	);
	const commandColumns = Array.from(
		{ length: maxCommands },
		(_, index): MessageTableColumn => ({
			getValue: (row) => {
				const command = row.match.option.slashCommands[index];
				return row.speaker === "member" && command
					? {
							label: command.startsWith("/") ? command : `/${command}`,
							title: "Slash command",
						}
					: undefined;
			},
			key: `command-${index}`,
			label: index === 0 ? "Command" : `Command ${index + 1}`,
			sortKey: "commands",
			visibleKey: "commands",
			widthClassName: "w-20",
		}),
	);

	return [...scalarColumns, ...commandColumns].filter((column) =>
		visibleColumnKeys.has(column.visibleKey),
	);
}

function SessionAdalineSpeakerCell({
	model,
	row,
	userImageUrl,
	userLabel,
}: {
	model: string | undefined;
	row: SessionAdalineMessageRow;
	userImageUrl: string | undefined;
	userLabel: string;
}) {
	const label =
		row.speaker === "member"
			? userLabel
			: model
				? formatModelDisplayLabel(model)
				: "Agent";

	return (
		<td className="py-2 pr-1.5 pl-3 align-top" title={label}>
			<div className="flex min-h-5 items-start">
				{row.speaker === "member" ? (
					<UserTraceAvatar
						className="size-4"
						expanded={false}
						expandable={false}
						imageUrl={userImageUrl}
					/>
				) : (
					<ModelTraceIcon
						className="size-4"
						expanded={false}
						expandable={false}
						model={model}
					/>
				)}
				<span className="sr-only">{label}</span>
			</div>
		</td>
	);
}

export function SessionAdalineMessageTable({
	hasActiveFilters,
	matchedIndices,
	model,
	onSelect,
	onSort,
	options,
	selectedIndex,
	selectedKey,
	selectedSpeaker,
	sort,
	userImageUrl,
	userLabel,
	viewportRange,
	visibleColumnKeys,
	visibleOptions,
}: {
	hasActiveFilters: boolean;
	matchedIndices: ReadonlySet<number> | undefined;
	model: string | undefined;
	onSelect: (row: SessionAdalineMessageRow) => void;
	onSort: (sortKey: SessionTurnTableSortKey) => void;
	options: readonly SessionTurnTablePaneOption[];
	selectedIndex: number;
	selectedKey: string | undefined;
	selectedSpeaker: SessionAdalineMessageRow["speaker"] | undefined;
	sort: SessionTurnTableSortState;
	userImageUrl: string | undefined;
	userLabel: string;
	viewportRange: readonly [number, number] | undefined;
	visibleColumnKeys: ReadonlySet<SessionTurnTableColumnKey>;
	visibleOptions: readonly SessionTurnTablePaneMatch[];
}) {
	const allRows = useMemo(
		() =>
			buildSessionAdalineMessageRows(
				options.map((option, index) => ({ index, option })),
			),
		[options],
	);
	const rows = useMemo(() => {
		const rowsByIndex = new Map<number, SessionAdalineMessageRow[]>();
		for (const row of allRows) {
			const indexedRows = rowsByIndex.get(row.match.index);
			if (indexedRows) {
				indexedRows.push(row);
			} else {
				rowsByIndex.set(row.match.index, [row]);
			}
		}

		return visibleOptions.flatMap(
			(match) => rowsByIndex.get(match.index) ?? [],
		);
	}, [allRows, visibleOptions]);
	const columns = useMemo(
		() => buildMessageTableColumns(options, visibleColumnKeys),
		[options, visibleColumnKeys],
	);
	const columnCount = columns.length + 2;

	function handleRowKeyDown(
		event: KeyboardEvent<HTMLTableRowElement>,
		rowIndex: number,
	) {
		if (event.key === "Enter" || event.key === " ") {
			event.preventDefault();
			const row = rows[rowIndex];
			if (row) {
				onSelect(row);
			}
			return;
		}

		if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
			return;
		}

		event.preventDefault();
		const direction = event.key === "ArrowDown" ? 1 : -1;
		const nextRowIndex = Math.min(
			Math.max(rowIndex + direction, 0),
			rows.length - 1,
		);
		const nextRow = rows[nextRowIndex];
		if (!nextRow) {
			return;
		}

		onSelect(nextRow);
		event.currentTarget.parentElement
			?.querySelector<HTMLElement>(`[data-message-row-index="${nextRowIndex}"]`)
			?.focus();
	}

	return (
		<div className="min-h-0 flex-1 overflow-auto overscroll-none">
			<table
				aria-label="Chronological session activity"
				className="w-max min-w-full table-fixed"
			>
				<colgroup>
					<col className="w-10" />
					<col className="w-80" />
					{columns.map((column) => (
						<col key={column.key} className={column.widthClassName} />
					))}
				</colgroup>
				<thead className="sticky top-0 z-10 bg-(--session-overview-surface)">
					<tr className="border-b border-(--session-overview-border)">
						<th className="h-8 px-3 text-left whitespace-nowrap" scope="col">
							<span className="sr-only">Speaker</span>
						</th>
						<th
							className="h-8 px-1.5 text-left text-xs font-medium whitespace-nowrap text-(--session-overview-subtle)"
							scope="col"
						>
							Message
						</th>
						{columns.map((column, columnIndex) => (
							<th
								key={column.key}
								className="h-8 p-0 text-left text-xs font-medium whitespace-nowrap text-(--session-overview-subtle)"
								scope="col"
							>
								<SessionTurnTableSortableHeader
									className={undefined}
									columnIndex={columnIndex + 2}
									label={column.label}
									onSort={onSort}
									sort={sort}
									sortKey={column.sortKey}
								/>
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{rows.map((row, rowIndex) => {
						const option = row.match.option;
						const selected =
							selectedKey !== undefined
								? row.key === selectedKey
								: row.match.index === selectedIndex &&
									row.speaker === selectedSpeaker;
						const inViewport =
							viewportRange !== undefined &&
							row.match.index >= viewportRange[0] &&
							row.match.index <= viewportRange[1];
						const matchesLens = matchedIndices?.has(row.match.index) ?? false;
						const beginsTurn =
							rowIndex === 0 ||
							rows[rowIndex - 1]?.match.option.key !== option.key;

						return (
							<Fragment key={row.key}>
								{beginsTurn
									? option.compactionsBefore.map((compaction) => (
											<SessionTurnCompactionRow
												key={compaction.key}
												columnCount={columnCount}
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
									data-message-row-index={rowIndex}
									data-speaker={row.speaker}
									data-turn-index={row.match.index}
									tabIndex={0}
									onClick={() => onSelect(row)}
									onKeyDown={(event) => handleRowKeyDown(event, rowIndex)}
								>
									<SessionAdalineSpeakerCell
										model={model}
										row={row}
										userImageUrl={userImageUrl}
										userLabel={userLabel}
									/>
									<td className="px-1.5 py-2 align-top">
										<p className="line-clamp-2 min-w-0 whitespace-normal text-pretty text-base text-(--session-overview-text) sm:text-xs">
											{row.preview}
										</p>
									</td>
									{columns.map((column) => {
										const value = column.getValue(row);
										return (
											<td key={column.key} className="px-1.5 py-2 align-top">
												<p
													className="min-w-0 truncate text-base text-(--session-overview-muted) tabular-nums sm:text-xs"
													title={value?.title}
												>
													{value?.label ?? "—"}
												</p>
											</td>
										);
									})}
								</tr>
							</Fragment>
						);
					})}
				</tbody>
			</table>
			{rows.length === 0 ? (
				<div className="flex min-h-40 items-center justify-center px-6 text-center">
					<p className="text-base text-(--session-overview-muted) sm:text-sm">
						{hasActiveFilters
							? "No messages match the selected filters."
							: "No messages available."}
					</p>
				</div>
			) : null}
		</div>
	);
}
