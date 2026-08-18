import type { CSSProperties, KeyboardEvent } from "react";
import {
	TraceIcon,
	UserTraceAvatar,
} from "@/components/conversation/conversation-trace-icons";
import { CONVERSATION_TOOL_ICONS } from "@/components/conversation/conversation-trace-tool-icons";
import { SignalText } from "@/components/signal-text";
import { cn } from "@/lib/utils";
import type { SessionTurnEpisode } from "./session-turn-episodes";
import type { SessionTurnTableRow } from "./session-turn-table";
import type { TurnTableColumn } from "./session-turn-table-columns";
import {
	SessionTurnCompactionRow,
	SessionTurnEpisodeRow,
} from "./session-turn-table-rows";

function SessionTurnRelativeMagnitude({
	columnLabel,
	value,
}: {
	columnLabel: string;
	value: number;
}) {
	const magnitude = Math.min(100, Math.max(0, value));
	const roundedMagnitude = Math.round(magnitude);
	const valueText = `${roundedMagnitude}% of the largest ${columnLabel.toLowerCase()} value in this ledger`;

	return (
		<div
			aria-label={`${columnLabel} relative magnitude`}
			aria-valuemax={100}
			aria-valuemin={0}
			aria-valuenow={roundedMagnitude}
			aria-valuetext={valueText}
			className="relative flex size-4 shrink-0 items-center justify-center"
			role="progressbar"
			title={valueText}
		>
			<svg
				aria-hidden="true"
				className="size-4 shrink-0 overflow-visible fill-none"
				viewBox="0 0 16 16"
			>
				<circle
					className="stroke-(--session-overview-border)"
					cx="8"
					cy="8"
					r="6.25"
					strokeWidth="2.5"
				/>
				{magnitude > 0 ? (
					<circle
						className="stroke-(--session-overview-accent)"
						cx="8"
						cy="8"
						pathLength="100"
						r="6.25"
						strokeDasharray={`${magnitude} ${100 - magnitude}`}
						strokeLinecap="round"
						strokeWidth="2.5"
						transform="rotate(-90 8 8)"
					/>
				) : null}
			</svg>
		</div>
	);
}

export function SessionTurnTableRowView({
	beginsTurn,
	collapsedEpisodeKeys,
	columns,
	emphasized,
	episode,
	gridTemplate,
	inViewport,
	matchesLens,
	onEpisodeToggle,
	onKeyDown,
	onSelect,
	row,
	selected,
	userImageUrl,
	userLabel,
	viewed,
	visibleIndex,
}: {
	beginsTurn: boolean;
	collapsedEpisodeKeys: ReadonlySet<string> | undefined;
	columns: readonly TurnTableColumn[];
	emphasized: boolean;
	episode: SessionTurnEpisode | undefined;
	gridTemplate: string;
	inViewport: boolean;
	matchesLens: boolean;
	onEpisodeToggle: ((key: string) => void) | undefined;
	onKeyDown: (
		event: KeyboardEvent<HTMLTableRowElement>,
		visibleIndex: number,
	) => void;
	onSelect: () => void;
	row: SessionTurnTableRow;
	selected: boolean;
	userImageUrl: string | undefined;
	userLabel: string;
	viewed: boolean;
	visibleIndex: number;
}) {
	const { match } = row;
	const highlighted = emphasized || viewed;
	return (
		<>
			{episode ? (
				<SessionTurnEpisodeRow
					collapsed={collapsedEpisodeKeys?.has(episode.key) ?? false}
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
							compaction={compaction}
						/>
					))
				: null}
			<tr
				aria-current={selected ? "true" : undefined}
				className={cn(
					"group relative isolate grid h-9 min-w-full cursor-pointer select-none outline-none [grid-template-columns:var(--session-turn-grid-template)] hover:bg-(--session-turn-row-hover) focus-visible:z-10 focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-(--session-overview-accent)",
					emphasized && "bg-(--session-turn-row-emphasis-fill)",
					matchesLens &&
						"[box-shadow:inset_2px_0_0_var(--session-overview-accent)]",
				)}
				data-visible-index={visibleIndex}
				data-turn-index={match.index}
				data-speaker={row.speaker}
				data-in-viewport={inViewport ? "true" : undefined}
				data-highlighted={highlighted ? "true" : undefined}
				data-speaker-emphasized={emphasized ? "true" : undefined}
				data-selected={selected ? "true" : undefined}
				data-viewed={viewed ? "true" : undefined}
				style={
					{
						"--session-turn-grid-template": gridTemplate,
					} as CSSProperties
				}
				tabIndex={0}
				onClick={onSelect}
				onKeyDown={(event) => onKeyDown(event, visibleIndex)}
			>
				<td
					aria-label={
						viewed ? "Visible in transcript" : "Outside transcript viewport"
					}
					className="flex h-full items-center justify-center p-0"
				>
					<div
						aria-hidden="true"
						className="size-full bg-transparent"
						data-viewed-indicator
					/>
				</td>
				<td
					aria-label={row.speaker === "member" ? userLabel : "Model tools"}
					className="flex h-full min-w-0 items-center overflow-hidden py-1.5 pr-1 pl-2"
				>
					<div className="session-constellation-tree min-w-0 overflow-hidden">
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
						<td
							key={column.key}
							aria-label={column.label}
							className="flex h-full min-w-0 items-center overflow-hidden px-1.5 py-1.5"
						>
							<div className="min-w-0 w-full overflow-hidden">
								{values.length > 0 ? (
									<div
										className={cn(
											"flex min-w-0 flex-1 items-center overflow-hidden",
											column.appearance === "tag" ||
												column.appearance === "signal"
												? "flex-nowrap gap-1"
												: "gap-1.5",
										)}
									>
										{values.map((value) => (
											<div
												key={
													value.key ??
													`${value.title ?? "value"}:${value.label}`
												}
												className={cn(
													column.appearance === "signal"
														? "max-w-full shrink-0"
														: "min-w-0 max-w-full text-(--session-overview-muted)",
													value.relativeMagnitude === undefined &&
														column.appearance !== "signal" &&
														"truncate",
													column.appearance === "tag"
														? "rounded-full bg-(--session-overview-surface) px-1.5 py-0.5 text-xs font-medium tracking-[-0.01em]"
														: "text-xs tabular-nums",
												)}
												title={value.title}
											>
												{column.appearance === "signal" ? (
													<SignalText text={value.label} />
												) : value.relativeMagnitude === undefined ? (
													value.label
												) : (
													<div className="flex min-w-0 items-center gap-1.5">
														<SessionTurnRelativeMagnitude
															columnLabel={column.label}
															value={value.relativeMagnitude}
														/>
														<span className="min-w-0 truncate">
															{value.label}
														</span>
													</div>
												)}
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
		</>
	);
}
