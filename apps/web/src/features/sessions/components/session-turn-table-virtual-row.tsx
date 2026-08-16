import type { KeyboardEvent } from "react";
import {
	TraceIcon,
	UserTraceAvatar,
} from "@/components/conversation/conversation-trace-icons";
import { CONVERSATION_TOOL_ICONS } from "@/components/conversation/conversation-trace-tool-icons";
import { cn } from "@/lib/utils";
import type { SessionTurnEpisode } from "./session-turn-episodes";
import type { SessionTurnTableRow } from "./session-turn-table";
import type { TurnTableColumn } from "./session-turn-table-columns";
import {
	SessionTurnCompactionRow,
	SessionTurnEpisodeRow,
} from "./session-turn-table-rows";

export function SessionTurnTableVirtualRow({
	beginsTurn,
	collapsedEpisodeKeys,
	columns,
	episode,
	inViewport,
	matchesLens,
	measureElement,
	onEpisodeToggle,
	onKeyDown,
	onRowElement,
	onSelect,
	row,
	scheduleMeasurement,
	selected,
	userImageUrl,
	userLabel,
	visibleIndex,
}: {
	beginsTurn: boolean;
	collapsedEpisodeKeys: ReadonlySet<string> | undefined;
	columns: readonly TurnTableColumn[];
	episode: SessionTurnEpisode | undefined;
	inViewport: boolean;
	matchesLens: boolean;
	measureElement: (element: HTMLTableSectionElement | null) => void;
	onEpisodeToggle: ((key: string) => void) | undefined;
	onKeyDown: (
		event: KeyboardEvent<HTMLTableRowElement>,
		visibleIndex: number,
	) => void;
	onRowElement: (
		visibleIndex: number,
		element: HTMLTableRowElement | null,
	) => void;
	onSelect: () => void;
	row: SessionTurnTableRow;
	scheduleMeasurement: (element: HTMLTableSectionElement) => void;
	selected: boolean;
	userImageUrl: string | undefined;
	userLabel: string;
	visibleIndex: number;
}) {
	const { match } = row;
	return (
		<tbody
			ref={measureElement}
			className="[&_tr:last-child]:border-0 [&_tr:has(+_tr:hover)]:border-b-transparent [&_tr:has(+_tr[data-selected])]:border-b-transparent"
			data-index={visibleIndex}
			onPointerUpCapture={(event) => scheduleMeasurement(event.currentTarget)}
			onKeyUpCapture={(event) => {
				if (event.key === "Enter" || event.key === " ") {
					scheduleMeasurement(event.currentTarget);
				}
			}}
			onTransitionEndCapture={(event) =>
				scheduleMeasurement(event.currentTarget)
			}
		>
			{episode ? (
				<SessionTurnEpisodeRow
					collapsed={collapsedEpisodeKeys?.has(episode.key) ?? false}
					columnCount={columns.length + 1}
					episode={episode}
					onToggle={
						onEpisodeToggle ? () => onEpisodeToggle(episode.key) : undefined
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
				ref={(element) => onRowElement(visibleIndex, element)}
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
				onClick={onSelect}
				onKeyDown={(event) => onKeyDown(event, visibleIndex)}
			>
				<td className="py-1.5 pr-1 pl-2 align-middle">
					<div className="session-constellation-tree min-w-0">
						<div
							className="flex min-w-0 items-center"
							data-trace-tree-row-content
						>
							{row.speaker === "member" ? (
								<span className="relative z-20 shrink-0" title={userLabel}>
									<UserTraceAvatar
										expanded={false}
										expandable={false}
										imageUrl={userImageUrl}
									/>
								</span>
							) : null}
							{row.speaker === "model"
								? row.toolCallGroups.map((group, groupIndex) => {
										const toolNames = Array.from(new Set(group.names)).join(
											", ",
										);
										const countLabel = `${group.count.toLocaleString()} ${group.count === 1 ? "tool call" : "tool calls"}`;
										return (
											<span
												key={group.icon}
												aria-label={`${countLabel}: ${toolNames}`}
												className={cn(
													"relative shrink-0",
													groupIndex > 0 && "-ml-2.5",
												)}
												role="img"
												style={{
													zIndex: row.toolCallGroups.length - groupIndex,
												}}
												title={`${countLabel}: ${toolNames}`}
											>
												<TraceIcon
													icon={CONVERSATION_TOOL_ICONS[group.icon]}
													toolIcon={group.icon}
													tone={group.tone}
												/>
												{group.count > 1 ? (
													<span
														aria-hidden="true"
														className="absolute right-0 bottom-0 z-10 min-w-2.5 rounded-[2px] bg-(--session-overview-surface) px-px text-center text-[0.5rem] leading-[0.625rem] font-semibold text-(--session-overview-text) tabular-nums shadow-[0_0_0_1px_var(--session-overview-surface)]"
													>
														{group.count}x
													</span>
												) : null}
											</span>
										);
									})
								: null}
						</div>
					</div>
				</td>
				{columns.map((column) => {
					const values = column.getValues(row);
					return (
						<td key={column.key} className="px-1.5 py-1.5 align-middle">
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
									<p className="text-xs text-(--session-overview-subtle)">—</p>
								)}
							</div>
						</td>
					);
				})}
			</tr>
		</tbody>
	);
}
